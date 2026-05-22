const { pool } = require('../config/database');
const intraday = require('./intraday');
const { getMarketPhase } = require('./marketData');
const { calculateOrderCharges } = require('../utils/orderCharges');
const { validateOrderQuantity } = require('../utils/lotUtils');
const { resolvePlacement } = require('../utils/orderExecution');

const PLACE_MARKET = 'market';
const PLACE_LIMIT = 'limit';

const spawnBracketChildOrders = async (client, userId, parentOrder, entryPrice) => {
  const { symbol, exchange, qty, product_type: productType, order_mode: orderMode } = parentOrder;
  if (orderMode !== 'bo' && orderMode !== 'co') return;

  if (orderMode === 'bo' && parentOrder.target_price) {
    await client.query(
      `INSERT INTO orders (user_id, symbol, exchange, qty, order_type, order_mode, price, product_type, validity, parent_order_id, status)
       VALUES ($1, $2, $3, $4, 'SELL', 'limit', $5, $6, 'DAY', $7, 'pending')`,
      [userId, symbol, exchange || 'NSE', qty, parentOrder.target_price, productType, parentOrder.id]
    );
  }

  if (parentOrder.stoploss_price) {
    const trigger = parseFloat(parentOrder.stoploss_price);
    await client.query(
      `INSERT INTO orders (user_id, symbol, exchange, qty, order_type, order_mode, trigger_price, product_type, validity, parent_order_id, status)
       VALUES ($1, $2, $3, $4, 'SELL', 'sl-m', $5, $6, 'DAY', $7, 'pending')`,
      [userId, symbol, exchange || 'NSE', qty, trigger, productType, parentOrder.id]
    );
  }
};

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

const placeOrder = async ({
  userId, symbol, qty, orderType, price = null, triggerPrice = null, targetPrice = null, stoplossPrice = null,
  orderMode = PLACE_MARKET, productType = 'CNC', validity = 'DAY', exchange = 'NSE', parentOrderId = null,
  isAmo = false, disclosedQty = null, portfolioId = null
}) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { getStockQuote, isMarketOpen } = require('./marketData');
    const quote = await getStockQuote(symbol);
    if (!quote) {
      throw { status: 400, message: 'Invalid symbol or unable to fetch details' };
    }
    
    let currentPrice;
    if (orderMode === PLACE_MARKET) {
      if (!quote.ltp) throw { status: 400, message: 'Unable to fetch current price' };
      currentPrice = quote.ltp;
    } else if (orderMode === 'limit') {
      if (!price || price <= 0) throw { status: 400, message: 'Limit price required for limit orders' };
      currentPrice = price;
    } else if (orderMode === 'sl') {
      if (!price || !triggerPrice) throw { status: 400, message: 'Price and trigger price required for SL orders' };
      currentPrice = price;
    } else if (orderMode === 'sl-m') {
      if (!triggerPrice) throw { status: 400, message: 'Trigger price required for SL-M orders' };
      currentPrice = triggerPrice;
    } else if (['bo', 'co'].includes(orderMode)) {
      if (orderMode === 'bo' && (!targetPrice || !stoplossPrice)) throw { status: 400, message: 'Target and Stoploss required for Bracket Order' };
      if (orderMode === 'co' && !stoplossPrice) throw { status: 400, message: 'Stoploss required for Cover Order' };
      currentPrice = price || quote.ltp;
    }

    const prevClose = quote.prevClose || quote.ltp;
    const upperCircuit = quote.upperCircuit || parseFloat((prevClose * 1.2).toFixed(2));
    const lowerCircuit = quote.lowerCircuit || parseFloat((prevClose * 0.8).toFixed(2));
    if (currentPrice > upperCircuit || currentPrice < lowerCircuit) {
      throw {
        status: 400,
        message: `Price outside circuit band (₹${lowerCircuit} – ₹${upperCircuit})`
      };
    }

    const placement = resolvePlacement({
      validity,
      orderMode,
      isAmo,
      isMarketOpen: isMarketOpen()
    });
    if (!placement.ok) {
      throw { status: placement.status, message: placement.message };
    }

    const isAmoOrder = placement.isAmoOrder;
    const orderValidity = placement.validity;
    const isBracketOrCover = ['bo', 'co'].includes(orderMode);
    const effectiveProduct = productType === 'NRML' ? 'CNC' : productType;

    const disclosed =
      disclosedQty != null && disclosedQty !== ''
        ? parseInt(disclosedQty, 10)
        : null;
    if (disclosed != null && (disclosed <= 0 || disclosed > qty)) {
      throw { status: 400, message: 'Disclosed quantity must be between 1 and order quantity' };
    }

    const lotCheck = validateOrderQuantity(qty, quote, productType, orderType);
    if (!lotCheck.valid) {
      const { notifyOrderRejectedLot } = require('./alertNotifications');
      notifyOrderRejectedLot(userId, symbol, lotCheck.message, qty, productType).catch(() => {});
      throw { status: 400, message: lotCheck.message };
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

    const isMIS = effectiveProduct === 'MIS';
    const buyRequired = isMIS ? intraday.marginFor(totalCost) : totalCost;

    if (orderType === 'BUY' && parseFloat(wallet.balance) < buyRequired) {
      const { notifyInsufficientMargin } = require('./alertNotifications');
      notifyInsufficientMargin(userId, {
        symbol,
        qty,
        productType: effectiveProduct,
        required: buyRequired,
        available: parseFloat(wallet.balance)
      }).catch(() => {});
      throw { status: 400, message: isMIS ? 'Insufficient margin for MIS order' : 'Insufficient balance' };
    }

    const holdingResult = await client.query(
      'SELECT * FROM holdings WHERE user_id = $1 AND symbol = $2 FOR UPDATE',
      [userId, symbol]
    );

    if (orderType === 'SELL') {
      if (isMIS) {
        const pos = await intraday.getPosition(client, userId, symbol);
        if (!pos) throw { status: 400, message: 'No intraday position to sell' };
        const pendingMisSell = await intraday.getPendingMisSellQty(client, userId, symbol);
        if (pos.qty - pendingMisSell < qty) {
          throw { status: 400, message: 'Insufficient intraday qty (pending sells included)' };
        }
      } else {
        if (holdingResult.rows.length === 0) {
          throw { status: 400, message: 'No holdings to sell' };
        }
        const pendingSell = await getPendingSellQty(client, userId, symbol);
        const availableQty = holdingResult.rows[0].qty - pendingSell;
        if (availableQty < qty) {
          throw { status: 400, message: 'Insufficient holdings (includes pending sell orders)' };
        }
      }
    }

    let status = 'pending';
    let executedPrice = null;
    let executedAt = null;

    const executeNow = placement.executeNow;

    if (executeNow) {
      status = 'executed';
      executedPrice = currentPrice;
      executedAt = new Date();
    }

    const orderResult = await client.query(
      `INSERT INTO orders (user_id, symbol, exchange, qty, order_type, order_mode, price, trigger_price, target_price, stoploss_price, product_type, validity, parent_order_id, portfolio_id, status, executed_price, executed_at, is_amo, disclosed_qty, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW())
       RETURNING *`,
      [
        userId, symbol, exchange, qty, orderType, orderMode, price, triggerPrice, targetPrice, stoplossPrice,
        effectiveProduct === 'BO' || effectiveProduct === 'CO' ? 'MIS' : effectiveProduct,
        orderValidity, parentOrderId, portfolioId, status, executedPrice, executedAt, isAmoOrder, disclosed
      ]
    );
    const order = orderResult.rows[0];

    if (executeNow && orderType === 'BUY') {
      if (isMIS) {
        await intraday.executeBuy(client, {
          userId,
          symbol,
          exchange,
          qty,
          price: currentPrice,
          orderId: order.id,
          wallet,
          portfolioId
        });
      } else {
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
          const totalCostHolding =
            parseFloat(existing.avg_buy_price) * existing.qty + currentPrice * qty;
          const newAvg = totalCostHolding / totalQty;
          await client.query(
            'UPDATE holdings SET qty = $1, avg_buy_price = $2, last_updated = NOW() WHERE user_id = $3 AND symbol = $4',
            [totalQty, newAvg, userId, symbol]
          );
        } else {
          await client.query(
            'INSERT INTO holdings (user_id, symbol, qty, avg_buy_price, portfolio_id) VALUES ($1, $2, $3, $4, $5)',
            [userId, symbol, qty, currentPrice, portfolioId]
          );
        }

        await client.query(
          `INSERT INTO trade_history (user_id, order_id, symbol, qty, trade_price, trade_type, pnl, portfolio_id)
           VALUES ($1, $2, $3, $4, $5, 'BUY', 0, $6)`,
          [userId, order.id, symbol, qty, currentPrice, portfolioId]
        );
      }
    } else if (executeNow && orderType === 'SELL') {
      if (isMIS) {
        await intraday.executeSell(client, {
          userId,
          symbol,
          qty,
          price: currentPrice,
          orderId: order.id,
          wallet,
          portfolioId
        });
      } else {
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
          `INSERT INTO trade_history (user_id, order_id, symbol, qty, trade_price, trade_type, pnl, portfolio_id)
           VALUES ($1, $2, $3, $4, $5, 'SELL', $6, $7)`,
          [userId, order.id, symbol, qty, currentPrice, pnl, portfolioId]
        );
      }
    } else if (status === 'pending' && orderType === 'BUY') {
      if (isMIS) {
        await intraday.reserveMarginForPendingBuy(client, {
          userId,
          symbol,
          qty,
          price: currentPrice,
          orderId: order.id,
          wallet
        });
      } else {
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
            `Reserved for ${orderMode} BUY ${qty} ${symbol} @ ${currentPrice}`,
            order.id
          ]
        );
      }
    }

    if (executeNow && orderType === 'BUY' && isBracketOrCover) {
      await spawnBracketChildOrders(client, userId, order, currentPrice);
    }

    await client.query('COMMIT');

    try {
      const { notifyOrderUpdate } = require('./alertNotifications');
      notifyOrderUpdate(userId, order, order.status).catch(() => {});

      const { checkAndAwardAchievements } = require('./achievements');
      checkAndAwardAchievements(userId).catch(e => console.error(e));
    } catch (e) {}

    return order;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const fillExecutedOrder = async (client, order, executedPrice) => {
  const isMIS = order.product_type === 'MIS';
  const totalCost = executedPrice * order.qty;
  const reservedCost = parseFloat(order.price || executedPrice) * order.qty;

  const walletResult = await client.query('SELECT * FROM wallets WHERE user_id = $1 FOR UPDATE', [
    order.user_id
  ]);
  const wallet = walletResult.rows[0];
  if (!wallet) throw new Error('Wallet not found');

  const holdingResult = await client.query(
    'SELECT * FROM holdings WHERE user_id = $1 AND symbol = $2 FOR UPDATE',
    [order.user_id, order.symbol]
  );

  const portfolioId = order.portfolio_id;

  if (order.order_type === 'BUY') {
    if (isMIS) {
      await intraday.executeBuy(client, {
        userId: order.user_id,
        symbol: order.symbol,
        exchange: order.exchange || 'NSE',
        qty: order.qty,
        price: executedPrice,
        orderId: order.id,
        wallet,
        portfolioId
      });
    } else {
      const refundDiff = Math.max(0, reservedCost - totalCost);
      if (refundDiff > 0) {
        await client.query('UPDATE wallets SET balance = balance + $1, last_updated = NOW() WHERE user_id = $2', [
          refundDiff,
          order.user_id
        ]);
      }
      await client.query(
        'UPDATE wallets SET total_invested = COALESCE(total_invested, 0) + $1, last_updated = NOW() WHERE user_id = $2',
        [totalCost, order.user_id]
      );

      if (holdingResult.rows.length > 0) {
        const existing = holdingResult.rows[0];
        const totalQty = existing.qty + order.qty;
        const avg =
          (parseFloat(existing.avg_buy_price) * existing.qty + executedPrice * order.qty) / totalQty;
        await client.query(
          'UPDATE holdings SET qty = $1, avg_buy_price = $2, last_updated = NOW() WHERE user_id = $3 AND symbol = $4',
          [totalQty, avg, order.user_id, order.symbol]
        );
      } else {
        await client.query(
          'INSERT INTO holdings (user_id, symbol, qty, avg_buy_price, portfolio_id) VALUES ($1, $2, $3, $4, $5)',
          [order.user_id, order.symbol, order.qty, executedPrice, portfolioId]
        );
      }

      await client.query(
        `INSERT INTO trade_history (user_id, order_id, symbol, qty, trade_price, trade_type, pnl, portfolio_id)
         VALUES ($1, $2, $3, $4, $5, 'BUY', 0, $6)`,
        [order.user_id, order.id, order.symbol, order.qty, executedPrice, portfolioId]
      );
    }
  } else if (order.order_type === 'SELL') {
    if (isMIS) {
      await intraday.executeSell(client, {
        userId: order.user_id,
        symbol: order.symbol,
        qty: order.qty,
        price: executedPrice,
        orderId: order.id,
        wallet,
        portfolioId
      });
    } else if (holdingResult.rows.length > 0) {
      const holding = holdingResult.rows[0];
      const sellValue = executedPrice * order.qty;
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
        await client.query('DELETE FROM holdings WHERE user_id = $1 AND symbol = $2', [
          order.user_id,
          order.symbol
        ]);
      }

      await client.query(
        `INSERT INTO trade_history (user_id, order_id, symbol, qty, trade_price, trade_type, pnl, portfolio_id)
         VALUES ($1, $2, $3, $4, $5, 'SELL', $6, $7)`,
        [order.user_id, order.id, order.symbol, order.qty, executedPrice, pnl, portfolioId]
      );
    }
  }
};

const canExecuteSell = async (client, order) => {
  if (order.product_type === 'MIS') {
    const pos = await intraday.getPosition(client, order.user_id, order.symbol);
    if (!pos) return false;
    const pendingMisSell = await intraday.getPendingMisSellQty(client, order.user_id, order.symbol, order.id);
    return pos.qty - pendingMisSell >= order.qty;
  }
  const holdingResult = await client.query(
    'SELECT qty FROM holdings WHERE user_id = $1 AND symbol = $2',
    [order.user_id, order.symbol]
  );
  const held = holdingResult.rows[0]?.qty || 0;
  const pendingSell = await getPendingSellQty(client, order.user_id, order.symbol, order.id);
  return held - pendingSell >= order.qty;
};

const executePendingOrderFill = async (order, executedPrice) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (order.order_type === 'SELL') {
      const ok = await canExecuteSell(client, order);
      if (!ok) {
        const reason = 'Insufficient holdings for sell order';
        await client.query(
          `UPDATE orders SET status = 'rejected', reject_reason = $2 WHERE id = $1`,
          [order.id, reason]
        );
        await client.query('COMMIT');
        const { notifyOrderUpdate } = require('./alertNotifications');
        notifyOrderUpdate(order.user_id, { ...order, status: 'rejected', reject_reason: reason }, 'rejected').catch(
          () => {}
        );
        return;
      }
    }

    const updated = await client.query(
      `UPDATE orders SET status = 'executed', executed_price = $1, executed_at = NOW()
       WHERE id = $2 AND status = 'pending' RETURNING *`,
      [executedPrice, order.id]
    );
    if (!updated.rows.length) {
      await client.query('ROLLBACK');
      return;
    }

    const filled = updated.rows[0];
    await fillExecutedOrder(client, filled, executedPrice);
    await client.query('COMMIT');

    const { notifyOrderUpdate, notifyTargetOrStop } = require('./alertNotifications');
    notifyOrderUpdate(order.user_id, filled, 'executed').catch(() => {});

    if (filled.parent_order_id) {
      const parentRes = await pool.query('SELECT * FROM orders WHERE id = $1', [filled.parent_order_id]);
      const parent = parentRes.rows[0];
      if (parent?.target_price && filled.order_mode === 'limit') {
        notifyTargetOrStop(order.user_id, filled, 'target').catch(() => {});
      }
      if (parent?.stoploss_price && ['sl', 'sl-m'].includes(filled.order_mode)) {
        notifyTargetOrStop(order.user_id, filled, 'stoploss').catch(() => {});
      }
    }

    const { checkAndAwardAchievements } = require('./achievements');
    checkAndAwardAchievements(order.user_id).catch(() => {});
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const executeAmoOrders = async () => {
  const { getStockQuote, isMarketOpen } = require('./marketData');
  if (!isMarketOpen()) return;

  const result = await pool.query(
    "SELECT * FROM orders WHERE is_amo = true AND status = 'pending' ORDER BY created_at"
  );

  for (const order of result.rows) {
    try {
      const quote = await getStockQuote(order.symbol);
      if (!quote?.ltp) continue;
      await executePendingOrderFill(order, quote.ltp);
    } catch (err) {
      console.error(`AMO fill ${order.id}:`, err.message);
    }
  }
};

const cancelExpiredIocOrders = async () => {
  await pool.query(
    `UPDATE orders SET status = 'cancelled', reject_reason = 'IOC expired — unfilled quantity cancelled'
     WHERE validity = 'IOC' AND status = 'pending'
     AND created_at < NOW() - INTERVAL '90 seconds'`
  );
};

const expireDayPendingAtClose = async () => {
  if (getMarketPhase() !== 'closed') return;
  await pool.query(
    `UPDATE orders SET status = 'cancelled', reject_reason = 'DAY order expired at market close'
     WHERE validity = 'DAY' AND status = 'pending' AND (is_amo IS NOT TRUE)
     AND order_mode IN ('limit', 'sl', 'sl-m')`
  );
};

const executePendingLimitOrders = async () => {
  const { getStockQuote } = require('./marketData');
  await cancelExpiredIocOrders();

  const result = await pool.query(
    `SELECT * FROM orders WHERE order_mode = 'limit' AND status = 'pending'
     AND (is_amo IS NOT TRUE OR is_amo = false)
     AND (validity IS NULL OR validity IN ('DAY', 'IOC'))
     ORDER BY created_at`
  );

  for (const order of result.rows) {
    try {
      const quote = await getStockQuote(order.symbol);
      if (!quote?.ltp) continue;

      const price = parseFloat(order.price);
      let shouldExecute = false;

      if (order.order_type === 'BUY' && quote.ltp <= price) shouldExecute = true;
      else if (order.order_type === 'SELL' && quote.ltp >= price) shouldExecute = true;

      if (shouldExecute) {
        await executePendingOrderFill(order, quote.ltp);
      }
    } catch (err) {
      console.error(`Limit order check error for ${order.id}:`, err.message);
    }
  }

  const gttResult = await pool.query(
    `SELECT * FROM orders WHERE validity = 'GTT' AND status = 'pending' AND order_mode = 'limit' ORDER BY created_at`
  );
  for (const order of gttResult.rows) {
    try {
      const quote = await getStockQuote(order.symbol);
      if (!quote?.ltp) continue;
      const price = parseFloat(order.price);
      let shouldExecute = false;
      if (order.order_type === 'BUY' && quote.ltp <= price) shouldExecute = true;
      else if (order.order_type === 'SELL' && quote.ltp >= price) shouldExecute = true;
      if (shouldExecute) await executePendingOrderFill(order, quote.ltp);
    } catch (err) {
      console.error(`GTT order check ${order.id}:`, err.message);
    }
  }
};

const getOrderCharges = (params) => calculateOrderCharges(params);

const { enrichOrder, buildCounts, filterAndSortOrders } = require('../utils/orderBookUtils');

const enrichOrdersList = async (rows) => {
  const { getStockQuote } = require('./marketData');
  return Promise.all(
    rows.map(async (row) => {
      const quote = await getStockQuote(row.symbol);
      return enrichOrder(row, quote);
    })
  );
};

const getOrders = async (userId, limit = 50) => {
  const result = await pool.query(
    `SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [userId, limit]
  );
  return enrichOrdersList(result.rows);
};

const getOrdersBook = async (userId, options = {}) => {
  const limit = Math.min(parseInt(options.limit, 10) || 300, 500);
  const result = await pool.query(
    `SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [userId, limit]
  );
  const enriched = await enrichOrdersList(result.rows);
  const counts = buildCounts(enriched);
  const orders = filterAndSortOrders(enriched, options);
  return { orders, counts };
};

const getOrderById = async (userId, orderId) => {
  const result = await pool.query(
    `SELECT * FROM orders WHERE id = $1 AND user_id = $2`,
    [orderId, userId]
  );
  if (!result.rows.length) throw { status: 404, message: 'Order not found' };
  const { getStockQuote } = require('./marketData');
  const quote = await getStockQuote(result.rows[0].symbol);
  return enrichOrder(result.rows[0], quote);
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

    if (order.order_type === 'BUY') {
      const reservePrice = parseFloat(order.price || order.trigger_price || 0);
      const refund =
        order.product_type === 'MIS'
          ? intraday.marginFor(reservePrice * order.qty)
          : reservePrice * order.qty;
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
        [userId, refund, balanceAfter, `Cancelled ${order.order_mode} BUY ${order.qty} ${order.symbol}`, order.id]
      );
    }

    await client.query(
      `UPDATE orders SET status = 'cancelled' WHERE id = $1`,
      [orderId]
    );

    await client.query('COMMIT');
    const cancelled = { ...order, status: 'cancelled' };
    const { notifyOrderUpdate } = require('./alertNotifications');
    notifyOrderUpdate(userId, cancelled, 'cancelled').catch(() => {});
    return cancelled;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const getPendingBuyReservationAmount = (order) => {
  if (order.order_type !== 'BUY') return 0;
  const reservePrice = parseFloat(order.price || order.trigger_price || 0);
  if (!reservePrice) return 0;
  const q = parseInt(order.qty, 10);
  return order.product_type === 'MIS'
    ? intraday.marginFor(reservePrice * q)
    : reservePrice * q;
};

const releasePendingBuyReservation = async (client, userId, order) => {
  const refund = getPendingBuyReservationAmount(order);
  if (refund <= 0) return;
  const walletResult = await client.query('SELECT * FROM wallets WHERE user_id = $1 FOR UPDATE', [userId]);
  const wallet = walletResult.rows[0];
  const balanceAfter = parseFloat(wallet.balance) + refund;
  await client.query('UPDATE wallets SET balance = $1, last_updated = NOW() WHERE user_id = $2', [
    balanceAfter,
    userId
  ]);
  await client.query(
    `INSERT INTO wallet_transactions (user_id, type, amount, balance_after, description, order_id)
     VALUES ($1, 'credit', $2, $3, $4, $5)`,
    [userId, refund, balanceAfter, `Modify order — released reservation ${order.symbol}`, order.id]
  );
};

const modifyPendingOrder = async (userId, orderId, updates = {}) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query(
      `SELECT * FROM orders WHERE id = $1 AND user_id = $2 AND status = 'pending' FOR UPDATE`,
      [orderId, userId]
    );
    if (existing.rows.length === 0) {
      throw { status: 400, message: 'Order not found or cannot be modified' };
    }
    const order = existing.rows[0];

    if (order.parent_order_id) {
      throw { status: 400, message: 'Cannot modify bracket child order' };
    }
    if (['bo', 'co'].includes(order.order_mode)) {
      throw { status: 400, message: 'Cannot modify bracket/cover orders here' };
    }

    const nextQty = updates.qty != null ? parseInt(updates.qty, 10) : parseInt(order.qty, 10);
    const nextPrice =
      updates.price !== undefined && updates.price !== null && updates.price !== ''
        ? parseFloat(updates.price)
        : order.price != null
          ? parseFloat(order.price)
          : null;
    const nextTrigger =
      updates.triggerPrice !== undefined && updates.triggerPrice !== null && updates.triggerPrice !== ''
        ? parseFloat(updates.triggerPrice)
        : order.trigger_price != null
          ? parseFloat(order.trigger_price)
          : null;
    const nextTarget =
      updates.targetPrice !== undefined && updates.targetPrice !== null
        ? parseFloat(updates.targetPrice)
        : order.target_price != null
          ? parseFloat(order.target_price)
          : null;
    const nextStop =
      updates.stoplossPrice !== undefined && updates.stoplossPrice !== null
        ? parseFloat(updates.stoplossPrice)
        : order.stoploss_price != null
          ? parseFloat(order.stoploss_price)
          : null;
    const nextValidity = updates.validity || order.validity || 'DAY';

    if (!Number.isFinite(nextQty) || nextQty <= 0) {
      throw { status: 400, message: 'Invalid quantity' };
    }

    const { getStockQuote } = require('./marketData');
    const quote = await getStockQuote(order.symbol);
    if (!quote) throw { status: 400, message: 'Unable to fetch quote' };
    const lotCheck = validateOrderQuantity(nextQty, quote, order.product_type, order.order_type);
    if (!lotCheck.valid) {
      throw { status: 400, message: lotCheck.message };
    }

    const prevClose = quote.prevClose || quote.ltp;
    const upperCircuit = quote.upperCircuit || parseFloat((prevClose * 1.2).toFixed(2));
    const lowerCircuit = quote.lowerCircuit || parseFloat((prevClose * 0.8).toFixed(2));

    const orderMode = order.order_mode;
    const effectiveProduct = order.product_type === 'NRML' ? 'CNC' : order.product_type;
    const isMIS = effectiveProduct === 'MIS';

    let currentPrice;
    if (orderMode === PLACE_MARKET) {
      if (!quote.ltp) throw { status: 400, message: 'Unable to fetch current price' };
      currentPrice = quote.ltp;
    } else if (orderMode === PLACE_LIMIT) {
      if (!nextPrice || nextPrice <= 0) throw { status: 400, message: 'Limit price required' };
      currentPrice = nextPrice;
    } else if (orderMode === 'sl') {
      if (!nextPrice || !nextTrigger) throw { status: 400, message: 'Price and trigger price required for SL' };
      currentPrice = nextPrice;
    } else if (orderMode === 'sl-m') {
      if (!nextTrigger) throw { status: 400, message: 'Trigger price required for SL-M' };
      currentPrice = nextTrigger;
    } else {
      throw { status: 400, message: 'This order mode cannot be modified' };
    }

    if (currentPrice > upperCircuit || currentPrice < lowerCircuit) {
      throw {
        status: 400,
        message: `Price outside circuit band (₹${lowerCircuit} – ₹${upperCircuit})`
      };
    }

    const totalCost = currentPrice * nextQty;
    const buyRequired = isMIS ? intraday.marginFor(totalCost) : totalCost;

    if (order.order_type === 'BUY') {
      await releasePendingBuyReservation(client, userId, order);
    }

    const walletFresh = await client.query('SELECT * FROM wallets WHERE user_id = $1 FOR UPDATE', [userId]);
    const wallet = walletFresh.rows[0];

    if (order.order_type === 'BUY') {
      if (parseFloat(wallet.balance) < buyRequired) {
        throw { status: 400, message: isMIS ? 'Insufficient margin for modified order' : 'Insufficient balance' };
      }
    }

    if (order.order_type === 'SELL') {
      if (isMIS) {
        const pos = await intraday.getPosition(client, userId, order.symbol);
        const pendingMisSell = await intraday.getPendingMisSellQty(client, userId, order.symbol, order.id);
        if (!pos || pos.qty - pendingMisSell < nextQty) {
          throw { status: 400, message: 'Insufficient intraday qty for modified sell (pending sells included)' };
        }
      } else {
        const holdingResult = await client.query(
          'SELECT * FROM holdings WHERE user_id = $1 AND symbol = $2 FOR UPDATE',
          [userId, order.symbol]
        );
        if (holdingResult.rows.length === 0) throw { status: 400, message: 'No holdings' };
        const pendingSell = await getPendingSellQty(client, userId, order.symbol, order.id);
        const availableQty = holdingResult.rows[0].qty - pendingSell;
        if (availableQty < nextQty) {
          throw { status: 400, message: 'Insufficient holdings for modified sell' };
        }
      }
    }

    if (order.order_type === 'BUY') {
      if (isMIS) {
        await intraday.reserveMarginForPendingBuy(client, {
          userId,
          symbol: order.symbol,
          qty: nextQty,
          price: currentPrice,
          orderId: order.id,
          wallet
        });
      } else {
        const balanceAfter = parseFloat(wallet.balance) - totalCost;
        await client.query('UPDATE wallets SET balance = $1, last_updated = NOW() WHERE user_id = $2', [
          balanceAfter,
          userId
        ]);
        await client.query(
          `INSERT INTO wallet_transactions (user_id, type, amount, balance_after, description, order_id)
           VALUES ($1, 'debit', $2, $3, $4, $5)`,
          [
            userId,
            totalCost,
            balanceAfter,
            `Reserved for modified ${orderMode} BUY ${nextQty} ${order.symbol} @ ${currentPrice}`,
            order.id
          ]
        );
      }
    }

    const updated = await client.query(
      `UPDATE orders SET qty = $1, price = $2, trigger_price = $3, target_price = $4, stoploss_price = $5, validity = $6
       WHERE id = $7 RETURNING *`,
      [
        nextQty,
        nextPrice,
        nextTrigger,
        nextTarget,
        nextStop,
        nextValidity,
        orderId
      ]
    );

    await client.query('COMMIT');
    return updated.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const executePendingStopOrders = async () => {
  const { getStockQuote } = require('./marketData');
  const result = await pool.query(
    `SELECT * FROM orders WHERE status = 'pending' AND order_mode IN ('sl', 'sl-m') ORDER BY created_at`
  );

  for (const order of result.rows) {
    try {
      const quote = await getStockQuote(order.symbol);
      if (!quote?.ltp) continue;

      const ltp = quote.ltp;
      const trigger = parseFloat(order.trigger_price);
      let shouldExecute = false;
      let executedPrice = ltp;

      if (order.order_mode === 'sl-m') {
        if (order.order_type === 'SELL' && ltp <= trigger) shouldExecute = true;
        if (order.order_type === 'BUY' && ltp >= trigger) shouldExecute = true;
      } else {
        const limit = parseFloat(order.price);
        if (order.order_type === 'SELL' && ltp <= trigger) {
          shouldExecute = true;
          executedPrice = limit;
        }
        if (order.order_type === 'BUY' && ltp >= trigger) {
          shouldExecute = true;
          executedPrice = Math.min(ltp, limit);
        }
      }

      if (shouldExecute) {
        await executePendingOrderFill(order, executedPrice);
      }
    } catch (err) {
      console.error(`SL check ${order.id}:`, err.message);
    }
  }
};

const getLotPreview = async ({
  symbol,
  productType = 'CNC',
  qty = 0,
  orderType = 'BUY',
  price = null,
  userId = null
}) => {
  const { getStockQuote } = require('./marketData');
  const { buildLotPreview } = require('../utils/lotUtils');
  const quote = await getStockQuote(symbol.toUpperCase());
  if (!quote) throw { status: 404, message: 'Symbol not found' };

  let availableBalance = 0;
  if (userId) {
    const w = await pool.query('SELECT balance FROM wallets WHERE user_id = $1', [userId]);
    availableBalance = parseFloat(w.rows[0]?.balance || 0);
  }

  return buildLotPreview(quote, productType, qty, orderType, price, availableBalance);
};

module.exports = {
  placeOrder,
  getOrders,
  getOrdersBook,
  getOrderById,
  cancelOrder,
  modifyPendingOrder,
  executePendingLimitOrders,
  executePendingStopOrders,
  executeAmoOrders,
  expireDayPendingAtClose,
  cancelExpiredIocOrders,
  getOrderCharges,
  getLotPreview
};