const { pool } = require('../config/database');

const getWallet = async (userId) => {
  const result = await pool.query(
    'SELECT * FROM wallets WHERE user_id = $1',
    [userId]
  );
  return result.rows[0] || null;
};

const getWalletHistory = async (userId, limit = 50) => {
  const transactionsResult = await pool.query(
    `SELECT id, type, amount, balance_after, description, order_id, created_at 
     FROM wallet_transactions 
     WHERE user_id = $1 
     ORDER BY created_at DESC 
     LIMIT $2`,
    [userId, limit]
  );

  const orders = await pool.query(
    `SELECT id, symbol, qty, price, status, order_type, order_mode, created_at as timestamp
     FROM orders 
     WHERE user_id = $1 AND status IN ('executed', 'pending', 'cancelled') 
     ORDER BY created_at DESC 
     LIMIT $2`,
    [userId, limit]
  );

  return { transactions: transactionsResult.rows, orders: orders.rows };
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

const updateWalletBalance = async (userId, amount, type, description) => {
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
    const newBalance = type === 'credit' ? wallet.balance + amount : wallet.balance - amount;

    if (newBalance < 0) {
      throw { status: 400, message: 'Insufficient balance' };
    }

    await client.query(
      'UPDATE wallets SET balance = $1, last_updated = NOW() WHERE user_id = $2',
      [newBalance, userId]
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

    const result = await client.query(
      `UPDATE wallets SET balance = $1, total_invested = 0, total_profit = 0, last_updated = NOW()
       WHERE user_id = $2 RETURNING *`,
      [amount, userId]
    );

    await client.query(
      `INSERT INTO wallet_transactions (user_id, type, amount, balance_after, description)
       VALUES ($1, 'credit', $2, $3, 'Wallet reset by admin')`,
      [userId, amount, amount]
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

module.exports = { getWallet, getWalletHistory, addTransaction, updateWalletBalance, resetWallet, getBatchWallets };