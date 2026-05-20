const { pool } = require('../config/database');

const PLACE_MARKET = 'market';
const PLACE_LIMIT = 'limit';

const getPendingSellQty = async (client, userId, symbol, excludeOrderId = null) => {
  const params = [userId, symbol];
  let sql = `SELECT COALESCE(SUM(qty), 0)::int AS qty FROM orders
    WHERE user_id = $1 AND symbol = $2 AND order_type = 'SELL' AND status = 'pending'`;
  if (excludeOrderId) {
    params.push(excludeOrderId);
    sql += ` AND id != $${params.length}`;
  }
  const result = await client.query(sql, params);
  return parseInt(result.rows[0].qty, 10) || 0;
};

const placeOrder = async (userId, symbol, qty, orderType, price = null, orderMode = PLACE_MARKET, exchange = 'NSE') => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let currentPrice;
    if (orderMode === PLACE_MARKET) {
      const { getStockQuote } = require('./marketData');
      const quote = await getStockQuote(symbol);
      if (!quote?.ltp) {
        throw { status: 400, message: 'Unable to fetch current price' };
      }
      currentPrice = quote.ltp;
    } else {
      if (!price || price <= 0) {
        throw { status: 400, message: 'Limit price required for limit orders' };
      }
      currentPrice = price;
    }

    const totalCost = currentPrice * qty;
    const walletResult = await client.query(
      'SELECT * FROM wallets WHERE user_id = $1 FOR UPDATE',
      [userId]
    );
    const wallet = walletResult.rows[0];
    if (!wallet) {
      throw { status: 404, message: 'Wallet not found' };
    }

    if (orderType === 'BUY' && parseFloat(wallet.balance) < totalCost) {
      throw { status: 400, message: 'Insufficient balance' };
    }

    const holdingResult = await client.query(
      'SELECT * FROM holdings WHERE user_id = $1 AND symbol = $2 FOR UPDATE',
      [userId, symbol]
    );

    if (orderType === 'SELL') {
      if (holdingResult.rows.length === 0) {
        throw { status: 400, message: 'No holdings to sell' };
      }
      const pendingSell = await getPendingSellQty(client, userId, symbol);
      const availableQty = holdingResult.rows[0].qty - pendingSell;
      if (availableQty < qty) {
        throw { status: 400, message: 'Insufficient holdings (includes pending sell orders)' };
      }
    }

    let status = 'pending';
    let executedPrice = null;
    let executedAt = null;

    if (orderMode === PLACE_MARKET) {
      status = 'executed';
      executedPrice = currentPrice;
      executedAt = new Date();
    }

    const orderResult = await client.query(
      `INSERT INTO orders (user_id, symbol, exchange, qty, order_type, order_mode, price, status, executed_price, executed_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
       RETURNING *`,
      [userId, symbol, exchange, qty, orderType, orderMode, price, status, executedPrice, executedAt]
    );
    const order = orderResult.rows[0];

    if (orderMode === PLACE_MARKET && orderType === 'BUY') {
      const newInvested = parseFloat(wallet.total_invested || 0) + totalCost;
      await client.query(
        'UPDATE wallets SET balance = balance - $1, total_invested = $2, last_updated = NOW() WHERE user_id = $3',
        [totalCost, newInvested, userId]
      );
      await client.query(
        `INSERT INTO wallet_transactions (user_id, type, amount, balance_after, description, order_id)
         VALUES ($1, 'debit', $2, $3, $4, $5)`,
        [userId, totalCost, parseFloat(wallet.balance) - totalCost, `BUY ${qty} ${symbol} @ ${currentPrice}`, order.id]
      );

      if (holdingResult.rows.length > 0) {
        const existing = holdingResult.rows[0];
        const totalQty = existing.qty + qty;
        const totalCostHolding = (parseFloat(existing.avg_buy_price) * existing.qty) + (currentPrice * qty);
        const newAvg = totalCostHolding / totalQty;
        await client.query(
          'UPDATE holdings SET qty = $1, avg_buy_price = $2, last_updated = NOW() WHERE user_id = $3 AND symbol = $4',
          [totalQty, newAvg, userId, symbol]
        );
      } else {
        await client.query(
          'INSERT INTO holdings (user_id, symbol, qty, avg_buy_price) VALUES ($1, $2, $3, $4)',
          [userId, symbol, qty, currentPrice]
        );
      }

      await client.query(
        `INSERT INTO trade_history (user_id, order_id, symbol, qty, trade_price, trade_type, pnl)
         VALUES ($1, $2, $3, $4, $5, 'BUY', 0)`,
        [userId, order.id, symbol, qty, currentPrice]
      );
    } else if (orderMode === PLACE_MARKET && orderType === 'SELL') {
      const holding = holdingResult.rows[0];
      const sellValue = currentPrice * qty;
      const costBasis = parseFloat(holding.avg_buy_price) * qty;
      const pnl = sellValue - costBasis;

      await client.query(
        'UPDATE wallets SET balance = balance + $1, total_profit = COALESCE(total_profit, 0) + $2, last_updated = NOW() WHERE user_id = $3',
        [sellValue, pnl, userId]
      );
      await client.query(
        `INSERT INTO wallet_transactions (user_id, type, amount, balance_after, description, order_id)
         VALUES ($1, 'credit', $2, $3, $4, $5)`,
        [userId, sellValue, parseFloat(wallet.balance) + sellValue, `SELL ${qty} ${symbol} @ ${currentPrice} P&L: ${pnl}`, order.id]
      );

      const remaining = holding.qty - qty;
      if (remaining > 0) {
        await client.query(
          'UPDATE holdings SET qty = $1, last_updated = NOW() WHERE user_id = $2 AND symbol = $3',
          [remaining, userId, symbol]
        );
      } else {
        await client.query('DELETE FROM holdings WHERE user_id = $1 AND symbol = $2', [userId, symbol]);
      }

      await client.query(
        `INSERT INTO trade_history (user_id, order_id, symbol, qty, trade_price, trade_type, pnl)
         VALUES ($1, $2, $3, $4, $5, 'SELL', $6)`,
        [userId, order.id, symbol, qty, currentPrice, pnl]
      );
    } else if (orderMode === PLACE_LIMIT && orderType === 'BUY') {
      const balanceAfter = parseFloat(wallet.balance) - totalCost;
      await client.query(
        'UPDATE wallets SET balance = $1, last_updated = NOW() WHERE user_id = $2',
        [balanceAfter, userId]
      );
      await client.query(
        `INSERT INTO wallet_transactions (user_id, type, amount, balance_after, description, order_id)
         VALUES ($1, 'debit', $2, $3, $4, $5)`,
        [
          userId,
          totalCost,
          balanceAfter,
          `Reserved for limit BUY ${qty} ${symbol} @ ${currentPrice}`,
          order.id
        ]
      );
    }

    await client.query('COMMIT');

    try {
      const { sendOrderNotification } = require('./pushNotifications');
      sendOrderNotification(userId, order).catch(err => console.log('Push notification error:', err.message));
    } catch (e) {}

    return order;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const executePendingLimitOrders = async () => {
  const { getStockQuote } = require('./marketData');
  const result = await pool.query(
    "SELECT * FROM orders WHERE order_mode = 'limit' AND status = 'pending' ORDER BY created_at"
  );

  for (const order of result.rows) {
    try {
      const quote = await getStockQuote(order.symbol);
      if (!quote?.ltp) continue;

      const price = parseFloat(order.price);
      let shouldExecute = false;

      if (order.order_type === 'BUY' && quote.ltp <= price) {
        shouldExecute = true;
      } else if (order.order_type === 'SELL' && quote.ltp >= price) {
        shouldExecute = true;
      }

      if (shouldExecute) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');

          const executedPrice = quote.ltp;
          const totalCost = executedPrice * order.qty;
          const reservedCost = parseFloat(order.price) * order.qty;

          const walletResult = await client.query(
            'SELECT * FROM wallets WHERE user_id = $1 FOR UPDATE',
            [order.user_id]
          );
          const wallet = walletResult.rows[0];

          if (!wallet) {
            await client.query("UPDATE orders SET status = 'rejected' WHERE id = $1", [order.id]);
            await client.query('COMMIT');
            continue;
          }

          const holdingResult = await client.query(
            'SELECT * FROM holdings WHERE user_id = $1 AND symbol = $2 FOR UPDATE',
            [order.user_id, order.symbol]
          );

          if (order.order_type === 'SELL') {
            const pendingSell = await getPendingSellQty(client, order.user_id, order.symbol, order.id);
            const held = holdingResult.rows[0]?.qty || 0;
            if (held - pendingSell < order.qty) {
              await client.query("UPDATE orders SET status = 'rejected' WHERE id = $1", [order.id]);
              await client.query('COMMIT');
              continue;
            }
          }

          await client.query(
            "UPDATE orders SET status = 'executed', executed_price = $1, executed_at = NOW() WHERE id = $2 AND status = 'pending'",
            [executedPrice, order.id]
          );

          if (order.order_type === 'BUY') {
            const refundDiff = Math.max(0, reservedCost - totalCost);
            let balance = parseFloat(wallet.balance);
            if (refundDiff > 0) {
              balance += refundDiff;
              await client.query('UPDATE wallets SET balance = $1, last_updated = NOW() WHERE user_id = $2', [
                balance,
                order.user_id
              ]);
            }
            const newInvested = parseFloat(wallet.total_invested || 0) + totalCost;
            await client.query(
              'UPDATE wallets SET total_invested = $1, last_updated = NOW() WHERE user_id = $2',
              [newInvested, order.user_id]
            );

            if (holdingResult.rows.length > 0) {
              const existing = holdingResult.rows[0];
              const totalQty = existing.qty + order.qty;
              const totalCostHolding = (parseFloat(existing.avg_buy_price) * existing.qty) + (quote.ltp * order.qty);
              await client.query(
                'UPDATE holdings SET qty = $1, avg_buy_price = $2, last_updated = NOW() WHERE user_id = $3 AND symbol = $4',
                [totalQty, totalCostHolding / totalQty, order.user_id, order.symbol]
              );
            } else {
              await client.query(
                'INSERT INTO holdings (user_id, symbol, qty, avg_buy_price) VALUES ($1, $2, $3, $4)',
                [order.user_id, order.symbol, order.qty, quote.ltp]
              );
            }

            await client.query(
              `INSERT INTO trade_history (user_id, order_id, symbol, qty, trade_price, trade_type, pnl)
               VALUES ($1, $2, $3, $4, $5, 'BUY', 0)`,
              [order.user_id, order.id, order.symbol, order.qty, quote.ltp]
            );
          } else if (order.order_type === 'SELL' && holdingResult.rows.length > 0) {
            const holding = holdingResult.rows[0];
            const sellValue = quote.ltp * order.qty;
            const costBasis = parseFloat(holding.avg_buy_price) * order.qty;
            const pnl = sellValue - costBasis;

            await client.query(
              'UPDATE wallets SET balance = balance + $1, total_profit = COALESCE(total_profit, 0) + $2, last_updated = NOW() WHERE user_id = $3',
              [sellValue, pnl, order.user_id]
            );

            const remaining = holding.qty - order.qty;
            if (remaining > 0) {
              await client.query(
                'UPDATE holdings SET qty = $1, last_updated = NOW() WHERE user_id = $2 AND symbol = $3',
                [remaining, order.user_id, order.symbol]
              );
            } else {
              await client.query('DELETE FROM holdings WHERE user_id = $1 AND symbol = $2', [order.user_id, order.symbol]);
            }

            await client.query(
              `INSERT INTO trade_history (user_id, order_id, symbol, qty, trade_price, trade_type, pnl)
               VALUES ($1, $2, $3, $4, $5, 'SELL', $6)`,
              [order.user_id, order.id, order.symbol, order.qty, quote.ltp, pnl]
            );
          }

          await client.query('COMMIT');
        } catch (err) {
          await client.query('ROLLBACK');
          console.error(`Limit order exec error for ${order.id}:`, err.message);
        } finally {
          client.release();
        }
      }
    } catch (err) {
      console.error(`Limit order check error for ${order.id}:`, err.message);
    }
  }
};

const getOrders = async (userId, limit = 50) => {
  const result = await pool.query(
    `SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [userId, limit]
  );
  return result.rows;
};

const cancelOrder = async (userId, orderId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const orderResult = await client.query(
      `SELECT * FROM orders WHERE id = $1 AND user_id = $2 AND status = 'pending' FOR UPDATE`,
      [orderId, userId]
    );

    if (orderResult.rows.length === 0) {
      throw { status: 400, message: 'Order not found or cannot be cancelled' };
    }

    const order = orderResult.rows[0];

    if (order.order_mode === PLACE_LIMIT && order.order_type === 'BUY') {
      const refund = parseFloat(order.price) * order.qty;
      const walletResult = await client.query(
        'SELECT * FROM wallets WHERE user_id = $1 FOR UPDATE',
        [userId]
      );
      const wallet = walletResult.rows[0];
      const balanceAfter = parseFloat(wallet.balance) + refund;
      await client.query('UPDATE wallets SET balance = $1, last_updated = NOW() WHERE user_id = $2', [
        balanceAfter,
        userId
      ]);
      await client.query(
        `INSERT INTO wallet_transactions (user_id, type, amount, balance_after, description, order_id)
         VALUES ($1, 'credit', $2, $3, $4, $5)`,
        [userId, refund, balanceAfter, `Cancelled limit BUY ${order.qty} ${order.symbol}`, order.id]
      );
    }

    await client.query(
      `UPDATE orders SET status = 'cancelled' WHERE id = $1`,
      [orderId]
    );

    await client.query('COMMIT');
    return { ...order, status: 'cancelled' };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

module.exports = {
  placeOrder,
  getOrders,
  cancelOrder,
  executePendingLimitOrders
};