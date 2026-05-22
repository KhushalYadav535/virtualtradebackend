const { z } = require('zod');
const { pool } = require('../config/database');
const tradingService = require('../services/trading');

const queueSchema = z.object({
  orders: z.array(z.object({
    symbol: z.string(),
    exchange: z.string().optional(),
    qty: z.number().positive(),
    order_type: z.string(),
    order_mode: z.string().optional(),
    price: z.number().optional(),
    product_type: z.string().optional(),
    trigger_price: z.number().optional()
  })).min(1).max(50)
});

const queueOrders = async (req, res, next) => {
  try {
    const { orders } = queueSchema.parse(req.body);
    if (!pool) throw { status: 503, message: 'Database not available' };

    const inserted = [];
    for (const o of orders) {
      const { rows } = await pool.query(
        `INSERT INTO offline_orders (user_id, symbol, exchange, qty, order_type, order_mode, price, product_type, trigger_price)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, symbol, qty, queued_at`,
        [req.user.id, o.symbol, o.exchange || 'NSE', o.qty, o.order_type, o.order_mode || 'market',
         o.price || null, o.product_type || 'CNC', o.trigger_price || null]
      );
      inserted.push(rows[0]);
    }
    res.status(201).json({ queued: inserted.length, orders: inserted });
  } catch (err) {
    next(err);
  }
};

const syncQueued = async (req, res, next) => {
  try {
    if (!pool) throw { status: 503, message: 'Database not available' };
    const { rows } = await pool.query(
      'SELECT * FROM offline_orders WHERE user_id = $1 AND status = $2 ORDER BY queued_at ASC LIMIT 50',
      [req.user.id, 'queued']
    );
    if (!rows.length) return res.json({ synced: 0, results: [] });

    const results = [];
    for (const o of rows) {
      try {
        const orderData = {
          symbol: o.symbol,
          exchange: o.exchange,
          qty: o.qty,
          order_type: o.order_type,
          order_mode: o.order_mode,
          price: parseFloat(o.price) || undefined,
          product_type: o.product_type,
          trigger_price: parseFloat(o.trigger_price) || undefined
        };
        const result = await tradingService.placeOrder(req.user.id, orderData);
        await pool.query('UPDATE offline_orders SET status = $1, synced_at = NOW(), order_id = $2 WHERE id = $3',
          ['synced', result.order?.id || result.id, o.id]);
        results.push({ localId: o.id, symbol: o.symbol, status: 'synced', orderId: result.order?.id || result.id });
      } catch (err) {
        await pool.query('UPDATE offline_orders SET status = $1, error_message = $2 WHERE id = $3',
          ['failed', err.message || 'Sync failed', o.id]);
        results.push({ localId: o.id, symbol: o.symbol, status: 'failed', error: err.message });
      }
    }
    res.json({ synced: results.filter((r) => r.status === 'synced').length, results });
  } catch (err) {
    next(err);
  }
};

const getQueued = async (req, res, next) => {
  try {
    if (!pool) return res.json([]);
    const { rows } = await pool.query(
      'SELECT id, symbol, qty, order_type, order_mode, queued_at, status, error_message FROM offline_orders WHERE user_id = $1 ORDER BY queued_at DESC LIMIT 20',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
};

module.exports = { queueOrders, syncQueued, getQueued };
