const crypto = require('crypto');
const { pool } = require('../config/database');
const { getStockQuote, getMultipleQuotes } = require('./marketData');
const { buildLotPreview } = require('../utils/lotUtils');
const { placeOrder } = require('./trading');

const mapBasketRow = async (row, items) => {
  const symbols = items.map((i) => i.symbol);
  const quotes = symbols.length ? await getMultipleQuotes(symbols) : [];
  const qMap = Object.fromEntries(quotes.map((q) => [q.symbol, q]));

  let totalLots = 0;
  let marginRequired = 0;
  let orderValue = 0;

  const enrichedItems = items.map((it) => {
    const q = qMap[it.symbol] || {};
    const lotSize = q.lotSize || 1;
    const lots = parseInt(it.lots, 10) || 1;
    const qty = it.qty ? parseInt(it.qty, 10) : lots * lotSize;
    const preview = buildLotPreview(q, it.product_type || 'MIS', qty, it.order_type || 'BUY', q.ltp, 0);
    totalLots += lots;
    marginRequired += preview.marginPerLot * lots;
    orderValue += preview.orderValue;
    return {
      ...it,
      lotSize,
      qty,
      ltp: q.ltp,
      lotValue: preview.lotValue,
      marginPerLot: preview.marginPerLot,
      orderValue: preview.orderValue
    };
  });

  return {
    id: row.id,
    name: row.name,
    shareToken: row.share_token,
    itemCount: enrichedItems.length,
    totalLots,
    marginRequired: parseFloat(marginRequired.toFixed(2)),
    orderValue: parseFloat(orderValue.toFixed(2)),
    items: enrichedItems,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

const listBaskets = async (userId) => {
  const res = await pool.query(
    `SELECT * FROM order_baskets WHERE user_id = $1 ORDER BY updated_at DESC`,
    [userId]
  );
  const out = [];
  for (const row of res.rows) {
    const items = await pool.query(
      `SELECT * FROM order_basket_items WHERE basket_id = $1 ORDER BY sort_order, created_at`,
      [row.id]
    );
    out.push(await mapBasketRow(row, items.rows));
  }
  return out;
};

const getBasket = async (userId, basketId) => {
  const res = await pool.query(`SELECT * FROM order_baskets WHERE id = $1 AND user_id = $2`, [
    basketId,
    userId
  ]);
  if (!res.rows.length) return null;
  const items = await pool.query(
    `SELECT * FROM order_basket_items WHERE basket_id = $1 ORDER BY sort_order, created_at`,
    [basketId]
  );
  return mapBasketRow(res.rows[0], items.rows);
};

const getBasketByShareToken = async (token) => {
  const res = await pool.query(`SELECT * FROM order_baskets WHERE share_token = $1`, [token]);
  if (!res.rows.length) return null;
  const items = await pool.query(
    `SELECT * FROM order_basket_items WHERE basket_id = $1 ORDER BY sort_order`,
    [res.rows[0].id]
  );
  const mapped = await mapBasketRow(res.rows[0], items.rows);
  return { ...mapped, shared: true, ownerId: res.rows[0].user_id };
};

const createBasket = async (userId, { name, items = [] }) => {
  const shareToken = crypto.randomBytes(8).toString('hex');
  const res = await pool.query(
    `INSERT INTO order_baskets (user_id, name, share_token) VALUES ($1, $2, $3) RETURNING *`,
    [userId, name || 'My Basket', shareToken]
  );
  const basket = res.rows[0];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    await pool.query(
      `INSERT INTO order_basket_items (basket_id, symbol, lots, qty, order_type, product_type, order_mode, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        basket.id,
        String(it.symbol).toUpperCase(),
        parseInt(it.lots, 10) || 1,
        it.qty || null,
        (it.orderType || it.order_type || 'BUY').toUpperCase(),
        (it.productType || it.product_type || 'MIS').toUpperCase(),
        it.orderMode || it.order_mode || 'market',
        i
      ]
    );
  }
  return getBasket(userId, basket.id);
};

const updateBasket = async (userId, basketId, { name, items }) => {
  const existing = await pool.query(`SELECT id FROM order_baskets WHERE id = $1 AND user_id = $2`, [
    basketId,
    userId
  ]);
  if (!existing.rows.length) return null;

  if (name) {
    await pool.query(`UPDATE order_baskets SET name = $2, updated_at = NOW() WHERE id = $1`, [
      basketId,
      name
    ]);
  }

  if (Array.isArray(items)) {
    await pool.query(`DELETE FROM order_basket_items WHERE basket_id = $1`, [basketId]);
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      await pool.query(
        `INSERT INTO order_basket_items (basket_id, symbol, lots, qty, order_type, product_type, order_mode, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          basketId,
          String(it.symbol).toUpperCase(),
          parseInt(it.lots, 10) || 1,
          it.qty || null,
          (it.orderType || it.order_type || 'BUY').toUpperCase(),
          (it.productType || it.product_type || 'MIS').toUpperCase(),
          it.orderMode || it.order_mode || 'market',
          i
        ]
      );
    }
  }

  await pool.query(`UPDATE order_baskets SET updated_at = NOW() WHERE id = $1`, [basketId]);
  return getBasket(userId, basketId);
};

const deleteBasket = async (userId, basketId) => {
  const res = await pool.query(`DELETE FROM order_baskets WHERE id = $1 AND user_id = $2 RETURNING id`, [
    basketId,
    userId
  ]);
  return res.rows.length > 0;
};

const executeBasket = async (userId, basketId) => {
  const basket = await getBasket(userId, basketId);
  if (!basket) throw { status: 404, message: 'Basket not found' };
  if (!basket.items?.length) throw { status: 400, message: 'Basket is empty' };

  const results = [];
  for (const it of basket.items) {
    try {
      const order = await placeOrder({
        userId,
        symbol: it.symbol,
        qty: it.qty,
        orderType: it.order_type,
        orderMode: it.order_mode || 'market',
        productType: it.product_type || 'MIS',
        exchange: 'NSE'
      });
      results.push({ symbol: it.symbol, success: true, orderId: order?.id });
    } catch (err) {
      results.push({
        symbol: it.symbol,
        success: false,
        error: err.message || 'Order failed'
      });
    }
  }

  const successCount = results.filter((r) => r.success).length;
  return {
    basketId,
    successCount,
    failCount: results.length - successCount,
    results
  };
};

const cloneBasketFromShare = async (userId, shareToken) => {
  const shared = await getBasketByShareToken(shareToken);
  if (!shared) throw { status: 404, message: 'Shared basket not found' };
  return createBasket(userId, {
    name: `${shared.name} (copy)`,
    items: shared.items.map((it) => ({
      symbol: it.symbol,
      lots: it.lots,
      qty: it.qty,
      orderType: it.order_type,
      productType: it.product_type,
      orderMode: it.order_mode
    }))
  });
};

module.exports = {
  listBaskets,
  getBasket,
  getBasketByShareToken,
  createBasket,
  updateBasket,
  deleteBasket,
  executeBasket,
  cloneBasketFromShare
};
