const { pool } = require('../config/database');
const { getStockQuote } = require('./marketData');

const MIS_MARGIN_RATE = 0.2;

const marginFor = (notional) => notional * MIS_MARGIN_RATE;

const getPosition = async (client, userId, symbol) => {
  const result = await client.query(
    'SELECT * FROM intraday_positions WHERE user_id = $1 AND symbol = $2 FOR UPDATE',
    [userId, symbol]
  );
  return result.rows[0] || null;
};

const getPendingMisSellQty = async (client, userId, symbol, excludeOrderId = null) => {
  const params = [userId, symbol];
  let sql = `SELECT COALESCE(SUM(qty), 0)::int AS qty FROM orders
    WHERE user_id = $1 AND symbol = $2 AND product_type = 'MIS' AND order_type = 'SELL' AND status = 'pending'`;
  if (excludeOrderId) {
    params.push(excludeOrderId);
    sql += ` AND id != $${params.length}`;
  }
  const result = await client.query(sql, params);
  return parseInt(result.rows[0].qty, 10) || 0;
};

const executeBuy = async (client, { userId, symbol, exchange, qty, price, orderId, wallet }) => {
  const notional = price * qty;
  const margin = marginFor(notional);
  const balanceAfter = parseFloat(wallet.balance) - margin;

  await client.query('UPDATE wallets SET balance = $1, last_updated = NOW() WHERE user_id = $2', [
    balanceAfter,
    userId
  ]);
  await client.query(
    `INSERT INTO wallet_transactions (user_id, type, amount, balance_after, description, order_id)
     VALUES ($1, 'debit', $2, $3, $4, $5)`,
    [userId, margin, balanceAfter, `MIS margin ${qty} ${symbol} @ ${price}`, orderId]
  );

  const pos = await getPosition(client, userId, symbol);
  if (pos) {
    const totalQty = pos.qty + qty;
    const avg =
      (parseFloat(pos.avg_buy_price) * pos.qty + notional) / totalQty;
    const newMargin = parseFloat(pos.margin_blocked) + margin;
    await client.query(
      `UPDATE intraday_positions SET qty = $1, avg_buy_price = $2, margin_blocked = $3,
       exchange = $4, last_updated = NOW() WHERE user_id = $5 AND symbol = $6`,
      [totalQty, avg, newMargin, exchange, userId, symbol]
    );
  } else {
    await client.query(
      `INSERT INTO intraday_positions (user_id, symbol, exchange, qty, avg_buy_price, margin_blocked)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, symbol, exchange, qty, price, margin]
    );
  }

  await client.query(
    `INSERT INTO trade_history (user_id, order_id, symbol, qty, trade_price, trade_type, pnl)
     VALUES ($1, $2, $3, $4, $5, 'BUY', 0)`,
    [userId, orderId, symbol, qty, price]
  );
};

const executeSell = async (client, { userId, symbol, qty, price, orderId, wallet }) => {
  const pos = await getPosition(client, userId, symbol);
  if (!pos || pos.qty < qty) {
    throw { status: 400, message: 'Insufficient intraday position' };
  }

  const costBasis = parseFloat(pos.avg_buy_price) * qty;
  const sellValue = price * qty;
  const pnl = sellValue - costBasis;
  const marginRelease = marginFor(costBasis);
  const balanceAfter = parseFloat(wallet.balance) + marginRelease + pnl;

  await client.query(
    'UPDATE wallets SET balance = $1, total_profit = COALESCE(total_profit, 0) + $2, last_updated = NOW() WHERE user_id = $3',
    [balanceAfter, pnl, userId]
  );
  await client.query(
    `INSERT INTO wallet_transactions (user_id, type, amount, balance_after, description, order_id)
     VALUES ($1, 'credit', $2, $3, $4, $5)`,
    [userId, marginRelease + pnl, balanceAfter, `MIS square ${qty} ${symbol} P&L ${pnl.toFixed(2)}`, orderId]
  );

  const remaining = pos.qty - qty;
  if (remaining > 0) {
    const ratio = remaining / pos.qty;
    await client.query(
      `UPDATE intraday_positions SET qty = $1, margin_blocked = $2, last_updated = NOW()
       WHERE user_id = $3 AND symbol = $4`,
      [remaining, parseFloat(pos.margin_blocked) * ratio, userId, symbol]
    );
  } else {
    await client.query('DELETE FROM intraday_positions WHERE user_id = $1 AND symbol = $2', [
      userId,
      symbol
    ]);
  }

  await client.query(
    `INSERT INTO trade_history (user_id, order_id, symbol, qty, trade_price, trade_type, pnl)
     VALUES ($1, $2, $3, $4, $5, 'SELL', $6)`,
    [userId, orderId, symbol, qty, price, pnl]
  );
};

const reserveMarginForPendingBuy = async (client, { userId, symbol, qty, price, orderId, wallet }) => {
  const margin = marginFor(price * qty);
  const balanceAfter = parseFloat(wallet.balance) - margin;
  await client.query('UPDATE wallets SET balance = $1, last_updated = NOW() WHERE user_id = $2', [
    balanceAfter,
    userId
  ]);
  await client.query(
    `INSERT INTO wallet_transactions (user_id, type, amount, balance_after, description, order_id)
     VALUES ($1, 'debit', $2, $3, $4, $5)`,
    [userId, margin, balanceAfter, `Reserved MIS margin ${symbol}`, orderId]
  );
};

const { enrichPosition, buildTotals, getAutoSquareOffStatus } = require('../utils/positionUtils');

const getPositionsForUser = async (userId) => {
  const { positions } = await getPositionsDetail(userId);
  return positions;
};

const getPositionsDetail = async (userId) => {
  const result = await pool.query(
    'SELECT * FROM intraday_positions WHERE user_id = $1 ORDER BY symbol',
    [userId]
  );

  const positions = await Promise.all(
    result.rows.map(async (row) => {
      const quote = await getStockQuote(row.symbol);
      return enrichPosition(
        {
          ...row,
          avg_buy_price: parseFloat(row.avg_buy_price),
          margin_blocked: parseFloat(row.margin_blocked)
        },
        quote
      );
    })
  );

  return {
    positions,
    totals: buildTotals(positions),
    autoSquareOff: getAutoSquareOffStatus()
  };
};

const getPositionBuildHistory = async (userId, symbol) => {
  const sym = String(symbol || '').toUpperCase();
  const quote = await getStockQuote(sym);
  const lotSize = quote ? require('../utils/lotUtils').getEffectiveLotSize(quote, 'MIS') : 1;

  const result = await pool.query(
    `SELECT th.qty, th.trade_price, th.timestamp, th.order_id, o.product_type
     FROM trade_history th
     LEFT JOIN orders o ON o.id = th.order_id
     WHERE th.user_id = $1 AND th.symbol = $2 AND th.trade_type = 'BUY'
       AND (o.product_type = 'MIS' OR o.id IS NULL)
       AND th.timestamp >= CURRENT_DATE
     ORDER BY th.timestamp ASC`,
    [userId, sym]
  );

  return result.rows.map((r) => {
    const qty = parseInt(r.qty, 10);
    const lots = lotSize > 0 ? qty / lotSize : qty;
    return {
      qty,
      lots: parseFloat(lots.toFixed(2)),
      lotSize,
      tradePrice: parseFloat(r.trade_price),
      timestamp: r.timestamp,
      orderId: r.order_id,
      label: `Bought ${lots} lot(s) (${qty} sh) @ ₹${parseFloat(r.trade_price).toFixed(2)}`
    };
  });
};

const squareOffPosition = async (userId, symbol, partialQty = null) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const pos = await getPosition(client, userId, symbol.toUpperCase());
    if (!pos || pos.qty <= 0) {
      throw { status: 404, message: 'No open intraday position' };
    }
    const quote = await getStockQuote(symbol);
    if (!quote?.ltp) throw { status: 400, message: 'Unable to fetch price' };

    const { validateOrderQuantity } = require('../utils/lotUtils');
    let qtyToClose = pos.qty;
    if (partialQty != null && partialQty !== undefined && partialQty !== '') {
      const pq = parseInt(partialQty, 10);
      if (!Number.isFinite(pq) || pq <= 0) {
        throw { status: 400, message: 'Invalid quantity for square-off' };
      }
      if (pq > pos.qty) {
        throw { status: 400, message: 'Quantity exceeds open position' };
      }
      const lotCheck = validateOrderQuantity(pq, quote, 'MIS', 'SELL');
      if (!lotCheck.valid) {
        throw { status: 400, message: lotCheck.message };
      }
      qtyToClose = pq;
    }

    const walletResult = await client.query('SELECT * FROM wallets WHERE user_id = $1 FOR UPDATE', [
      userId
    ]);
    const orderResult = await client.query(
      `INSERT INTO orders (user_id, symbol, exchange, qty, order_type, order_mode, product_type, status, executed_price, executed_at, created_at)
       VALUES ($1, $2, $3, $4, 'SELL', 'market', 'MIS', 'executed', $5, NOW(), NOW()) RETURNING *`,
      [userId, pos.symbol, pos.exchange || 'NSE', qtyToClose, quote.ltp]
    );
    await executeSell(client, {
      userId,
      symbol: pos.symbol,
      qty: qtyToClose,
      price: quote.ltp,
      orderId: orderResult.rows[0].id,
      wallet: walletResult.rows[0]
    });
    await client.query('COMMIT');
    return orderResult.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/** Pay delivery value minus MIS margin already blocked; move qty from intraday to CNC holdings. */
const convertMisToCnc = async (userId, symbol, convertQty = null) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const pos = await getPosition(client, userId, symbol.toUpperCase());
    if (!pos || pos.qty <= 0) {
      throw { status: 404, message: 'No open MIS position' };
    }

    const quote = await getStockQuote(symbol);
    const { validateOrderQuantity } = require('../utils/lotUtils');

    let qty =
      convertQty != null && convertQty !== '' ? parseInt(convertQty, 10) : pos.qty;
    if (!Number.isFinite(qty) || qty <= 0) {
      throw { status: 400, message: 'Invalid quantity' };
    }
    if (qty > pos.qty) {
      throw { status: 400, message: 'Quantity exceeds MIS position' };
    }
    const lotCheck = validateOrderQuantity(qty, quote, 'MIS', 'SELL');
    if (!lotCheck.valid) {
      throw { status: 400, message: lotCheck.message };
    }

    const avg = parseFloat(pos.avg_buy_price);
    const notional = avg * qty;
    const marginSlice = parseFloat(pos.margin_blocked) * (qty / pos.qty);
    const amountToPay = Math.max(0, notional - marginSlice);

    const walletResult = await client.query('SELECT * FROM wallets WHERE user_id = $1 FOR UPDATE', [userId]);
    const wallet = walletResult.rows[0];
    const bal = parseFloat(wallet.balance);
    if (bal + 1e-9 < amountToPay) {
      throw {
        status: 400,
        message: `Insufficient balance to convert (need ₹${amountToPay.toFixed(2)}; approx. full value minus MIS margin blocked)`
      };
    }

    const balanceAfter = bal - amountToPay;
    await client.query('UPDATE wallets SET balance = $1, last_updated = NOW() WHERE user_id = $2', [
      balanceAfter,
      userId
    ]);
    await client.query(
      `INSERT INTO wallet_transactions (user_id, type, amount, balance_after, description, order_id)
       VALUES ($1, 'debit', $2, $3, $4, NULL)`,
      [
        userId,
        amountToPay,
        balanceAfter,
        `MIS→CNC ${qty} ${pos.symbol} (notional ₹${notional.toFixed(2)}, margin credit ₹${marginSlice.toFixed(2)})`
      ]
    );

    const remaining = pos.qty - qty;
    if (remaining > 0) {
      const ratio = remaining / pos.qty;
      await client.query(
        `UPDATE intraday_positions SET qty = $1, margin_blocked = $2, last_updated = NOW()
         WHERE user_id = $3 AND symbol = $4`,
        [remaining, parseFloat(pos.margin_blocked) * ratio, userId, pos.symbol]
      );
    } else {
      await client.query('DELETE FROM intraday_positions WHERE user_id = $1 AND symbol = $2', [
        userId,
        pos.symbol
      ]);
    }

    const holdingResult = await client.query(
      'SELECT * FROM holdings WHERE user_id = $1 AND symbol = $2 FOR UPDATE',
      [userId, pos.symbol]
    );
    if (holdingResult.rows.length > 0) {
      const h = holdingResult.rows[0];
      const newQty = h.qty + qty;
      const newAvg = (parseFloat(h.avg_buy_price) * h.qty + avg * qty) / newQty;
      await client.query(
        'UPDATE holdings SET qty = $1, avg_buy_price = $2, last_updated = NOW() WHERE user_id = $3 AND symbol = $4',
        [newQty, newAvg, userId, pos.symbol]
      );
    } else {
      await client.query(
        'INSERT INTO holdings (user_id, symbol, qty, avg_buy_price) VALUES ($1, $2, $3, $4)',
        [userId, pos.symbol, qty, avg]
      );
    }

    await client.query('COMMIT');
    return {
      symbol: pos.symbol,
      qty,
      amountPaid: parseFloat(amountToPay.toFixed(2)),
      avgBuyPrice: avg
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const squareOffAll = async (userId) => {
  const positions = await pool.query('SELECT symbol FROM intraday_positions WHERE user_id = $1', [
    userId
  ]);
  const results = [];
  for (const row of positions.rows) {
    try {
      results.push(await squareOffPosition(userId, row.symbol));
    } catch (err) {
      console.error(`Square-off ${row.symbol}:`, err.message);
    }
  }
  return results;
};

const autoSquareOffAllUsers = async () => {
  const result = await pool.query('SELECT DISTINCT user_id FROM intraday_positions');
  for (const row of result.rows) {
    try {
      await squareOffAll(row.user_id);
    } catch (err) {
      console.error(`Auto square-off user ${row.user_id}:`, err.message);
    }
  }
};

let lastAutoSquareOffDate = null;

/** Run once per trading day during 3:20–3:25 PM IST window */
const runScheduledAutoSquareOff = async () => {
  const { getIstClock } = require('../utils/positionUtils');
  const { day, minutes, dateKey } = getIstClock();
  if (day === 0 || day === 6) return;
  const execStart = 15 * 60 + 20;
  const execEnd = 15 * 60 + 25;
  if (minutes < execStart || minutes > execEnd) return;
  if (lastAutoSquareOffDate === dateKey) return;
  lastAutoSquareOffDate = dateKey;
  console.log('✓ Auto square-off MIS positions (3:20 PM IST)');
  await autoSquareOffAllUsers();
};

module.exports = {
  MIS_MARGIN_RATE,
  marginFor,
  getPosition,
  getPendingMisSellQty,
  executeBuy,
  executeSell,
  reserveMarginForPendingBuy,
  getPositionsForUser,
  getPositionsDetail,
  getPositionBuildHistory,
  squareOffPosition,
  squareOffAll,
  autoSquareOffAllUsers,
  runScheduledAutoSquareOff,
  convertMisToCnc
};
