const { pool } = require('../config/database');
const { getStockQuote } = require('./marketData');
const { buildLotPreview } = require('../utils/lotUtils');
const {
  enrichLedgerRow,
  buildMarginSnapshot,
  lotsAffordableFromBalance
} = require('../utils/fundsUtils');

const getUsedMargin = async (userId) => {
  const r = await pool.query(
    `SELECT COALESCE(SUM(margin_blocked), 0)::numeric AS used FROM intraday_positions WHERE user_id = $1`,
    [userId]
  );
  return parseFloat(r.rows[0]?.used || 0);
};

const getCollateralValue = async (userId) => {
  const { getHoldings } = require('./portfolio');
  try {
    const holdings = await getHoldings(userId);
    const value = holdings.reduce((s, h) => s + (h.currentValue || 0), 0);
    return parseFloat((value * 0.5).toFixed(2));
  } catch {
    return 0;
  }
};

const getStartBalance = async (userId) => {
  const r = await pool.query(
    `SELECT b.start_balance FROM users u LEFT JOIN batches b ON u.batch_id = b.id WHERE u.id = $1`,
    [userId]
  );
  return parseFloat(r.rows[0]?.start_balance || 1000000);
};

const getReferenceMarginPerLot = async (userId, symbol = 'RELIANCE') => {
  try {
    const quote = await getStockQuote(symbol);
    const wallet = await pool.query('SELECT balance FROM wallets WHERE user_id = $1', [userId]);
    const bal = parseFloat(wallet.rows[0]?.balance || 0);
    const preview = buildLotPreview(quote, 'MIS', quote?.lotSizeMis || 1, 'BUY', quote?.ltp, bal);
    return preview.marginPerLot || 50000;
  } catch {
    return 50000;
  }
};

const getWalletRow = async (userId) => {
  const result = await pool.query('SELECT * FROM wallets WHERE user_id = $1', [userId]);
  return result.rows[0] || null;
};

const getFundsDetail = async (userId) => {
  const wallet = await getWalletRow(userId);
  if (!wallet) return null;

  const [usedMargin, collateralValue, startBalance, marginPerLotRef] = await Promise.all([
    getUsedMargin(userId),
    getCollateralValue(userId),
    getStartBalance(userId),
    getReferenceMarginPerLot(userId)
  ]);

  const cashBalance = parseFloat(wallet.balance) || 0;
  const margin = buildMarginSnapshot({
    cashBalance,
    usedMargin,
    collateralValue,
    startBalance
  });

  return {
    ...wallet,
    balance: cashBalance,
    total_invested: parseFloat(wallet.total_invested) || 0,
    total_profit: parseFloat(wallet.total_profit) || 0,
    startBalance,
    ...margin,
    lotsAffordableCash: lotsAffordableFromBalance(cashBalance, marginPerLotRef),
    referenceSymbol: 'RELIANCE',
    referenceMarginPerLot: marginPerLotRef
  };
};

const getWallet = async (userId) => getFundsDetail(userId);

const getWalletHistory = async (userId, limit = 50) => {
  const marginPerLotRef = await getReferenceMarginPerLot(userId);

  const transactionsResult = await pool.query(
    `SELECT id, type, amount, balance_after, description, order_id, created_at 
     FROM wallet_transactions 
     WHERE user_id = $1 
     ORDER BY created_at DESC 
     LIMIT $2`,
    [userId, limit]
  );

  const transactions = transactionsResult.rows.map((row) =>
    enrichLedgerRow(row, marginPerLotRef)
  );

  const orders = await pool.query(
    `SELECT id, symbol, qty, price, status, order_type, order_mode, product_type, created_at as timestamp
     FROM orders 
     WHERE user_id = $1 AND status IN ('executed', 'pending', 'cancelled') 
     ORDER BY created_at DESC 
     LIMIT $2`,
    [userId, limit]
  );

  const marginLedger = transactions.filter((t) => t.isMarginRelated);

  return {
    transactions,
    marginLedger,
    orders: orders.rows,
    marginPerLotRef
  };
};

const getMaxLotsAffordable = async (userId, symbol, productType = 'MIS') => {
  const sym = String(symbol || '').toUpperCase();
  if (!sym) throw { status: 400, message: 'Symbol required' };
  const quote = await getStockQuote(sym);
  const wallet = await pool.query('SELECT balance FROM wallets WHERE user_id = $1', [userId]);
  const availableBalance = parseFloat(wallet.rows[0]?.balance || 0);
  const pt = String(productType || 'MIS').toUpperCase();
  const preview = buildLotPreview(
    quote,
    pt,
    quote?.lotSizeMis || 1,
    'BUY',
    quote?.ltp,
    availableBalance
  );
  return {
    symbol: sym,
    name: quote?.companyName || quote?.name || sym,
    availableBalance,
    ...preview,
    lotsAffordable: preview.maxLots,
    cashLotsAffordable: lotsAffordableFromBalance(availableBalance, preview.marginPerLot)
  };
};

const addTransaction = async (userId, type, amount, description, orderId = null) => {
  const walletResult = await pool.query('SELECT balance FROM wallets WHERE user_id = $1', [userId]);
  const currentBalance = walletResult.rows[0]?.balance || 0;
  const newBalance = type === 'credit' ? currentBalance + amount : currentBalance - amount;

  await pool.query(
    `INSERT INTO wallet_transactions (user_id, type, amount, balance_after, description, order_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, type, amount, newBalance, description, orderId]
  );

  return { balance: newBalance };
};

const creditWallet = async (userId, amount, description) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const walletResult = await client.query(
      'SELECT * FROM wallets WHERE user_id = $1 FOR UPDATE',
      [userId]
    );
    if (!walletResult.rows.length) throw { status: 404, message: 'Wallet not found' };

    const wallet = walletResult.rows[0];
    const prev = parseFloat(wallet.balance);
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) throw { status: 400, message: 'Invalid amount' };

    const newBalance = prev + amt;
    const marginPerLotRef = await getReferenceMarginPerLot(userId);
    const lotsBefore = lotsAffordableFromBalance(prev, marginPerLotRef);
    const lotsAfter = lotsAffordableFromBalance(newBalance, marginPerLotRef);

    await client.query(
      'UPDATE wallets SET balance = $1, last_updated = NOW() WHERE user_id = $2',
      [newBalance, userId]
    );
    const creditDesc =
      description ||
      `Virtual funds added (lots affordable ~${lotsBefore} → ${lotsAfter})`;
    await client.query(
      `INSERT INTO wallet_transactions (user_id, type, amount, balance_after, description)
       VALUES ($1, 'credit', $2, $3, $4)`,
      [userId, amt, newBalance, creditDesc]
    );
    await client.query('COMMIT');
    const { notifyFundMovement } = require('./alertNotifications');
    notifyFundMovement(userId, {
      type: 'credit',
      amount: amt,
      balanceAfter: newBalance,
      description: creditDesc
    }).catch(() => {});
    return { balance: newBalance, lotsAffordableBefore: lotsBefore, lotsAffordableAfter: lotsAfter };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const addFunds = async (userId, amount) => creditWallet(userId, amount, null);

const updateWalletBalance = async (userId, amount, type, description, orderId = null) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const walletResult = await client.query(
      'SELECT * FROM wallets WHERE user_id = $1 FOR UPDATE',
      [userId]
    );

    if (walletResult.rows.length === 0) {
      throw { status: 404, message: 'Wallet not found' };
    }

    const wallet = walletResult.rows[0];
    const prev = parseFloat(wallet.balance);
    const amt = parseFloat(amount);
    const newBalance = type === 'credit' ? prev + amt : prev - amt;

    if (newBalance < 0) {
      throw { status: 400, message: 'Insufficient balance' };
    }

    await client.query(
      'UPDATE wallets SET balance = $1, last_updated = NOW() WHERE user_id = $2',
      [newBalance, userId]
    );

    await client.query(
      `INSERT INTO wallet_transactions (user_id, type, amount, balance_after, description, order_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, type, amt, newBalance, description || '', orderId]
    );

    await client.query('COMMIT');
    return { balance: newBalance };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const resetWallet = async (userId, amount = 1000000) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      "UPDATE orders SET status = 'cancelled' WHERE user_id = $1 AND status = 'pending'",
      [userId]
    );
    await client.query('DELETE FROM holdings WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM intraday_positions WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM trade_history WHERE user_id = $1', [userId]);

    const result = await client.query(
      `UPDATE wallets SET balance = $1, total_invested = 0, total_profit = 0, last_updated = NOW()
       WHERE user_id = $2 RETURNING *`,
      [amount, userId]
    );

    await client.query(
      `INSERT INTO wallet_transactions (user_id, type, amount, balance_after, description)
       VALUES ($1, 'credit', $2, $3, $4)`,
      [userId, amount, amount, `Account reset — balance ₹${amount} (lots affordable reset)`]
    );

    await client.query('COMMIT');
    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const selfResetWallet = async (userId, amount) => {
  const startBalance = await getStartBalance(userId);
  const resetAmount = amount > 0 ? amount : startBalance;
  return resetWallet(userId, resetAmount);
};

const getBatchWallets = async (batchId) => {
  const result = await pool.query(
    `SELECT u.id, u.name, u.email, w.balance, w.total_invested, w.total_profit
     FROM users u
     JOIN wallets w ON u.id = w.user_id
     WHERE u.batch_id = $1`,
    [batchId]
  );
  return result.rows;
};

module.exports = {
  getWallet,
  getFundsDetail,
  getWalletHistory,
  getMaxLotsAffordable,
  addFunds,
  addTransaction,
  updateWalletBalance,
  resetWallet,
  selfResetWallet,
  getBatchWallets
};