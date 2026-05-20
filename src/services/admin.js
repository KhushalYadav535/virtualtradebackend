const { pool } = require('../config/database');
const { resetWallet } = require('./wallet');
const { getStockQuote } = require('./marketData');

const getAllStudents = async (requesterId, requesterRole) => {
  let query = `
    SELECT u.id, u.name, u.email, u.role, u.batch_id, u.is_active, u.created_at,
           w.balance, w.total_invested, w.total_profit,
           b.name as batch_name
    FROM users u
    LEFT JOIN wallets w ON u.id = w.user_id
    LEFT JOIN batches b ON u.batch_id = b.id
    WHERE u.role = 'student'
  `;
  const params = [];

  if (requesterRole === 'trainer') {
    params.push(requesterId);
    query += ` AND (b.trainer_id = $${params.length} OR u.batch_id IS NULL)`;
  }

  query += ' ORDER BY u.created_at DESC';

  const result = await pool.query(query, params);
  return result.rows;
};

const getStudentDetails = async (studentId) => {
  const userResult = await pool.query(
    `SELECT u.id, u.name, u.email, u.role, u.batch_id, u.is_active, u.created_at,
            w.balance, w.total_invested, w.total_profit,
            b.name as batch_name, b.start_balance
     FROM users u
     LEFT JOIN wallets w ON u.id = w.user_id
     LEFT JOIN batches b ON u.batch_id = b.id
     WHERE u.id = $1`,
    [studentId]
  );

  if (userResult.rows.length === 0) {
    throw { status: 404, message: 'Student not found' };
  }

  const ordersResult = await pool.query(
    'SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
    [studentId]
  );

  const holdingsResult = await pool.query(
    'SELECT * FROM holdings WHERE user_id = $1',
    [studentId]
  );

  return {
    user: userResult.rows[0],
    orders: ordersResult.rows,
    holdings: holdingsResult.rows
  };
};

const createBatch = async (trainerId, name, startBalance = 1000000) => {
  const result = await pool.query(
    'INSERT INTO batches (name, trainer_id, start_balance) VALUES ($1, $2, $3) RETURNING *',
    [name, trainerId, startBalance]
  );
  return result.rows[0];
};

const getBatches = async (requesterId, requesterRole) => {
  let query = `
    SELECT b.*, COUNT(u.id) as student_count
    FROM batches b
    LEFT JOIN users u ON u.batch_id = b.id
  `;
  const params = [];

  if (requesterRole === 'trainer') {
    params.push(requesterId);
    query += ` WHERE b.trainer_id = $${params.length}`;
  }

  query += ' GROUP BY b.id ORDER BY b.created_at DESC';

  const result = await pool.query(query, params);
  return result.rows;
};

const updateBatchStartBalance = async (batchId, startBalance) => {
  const result = await pool.query(
    'UPDATE batches SET start_balance = $1 WHERE id = $2 RETURNING *',
    [startBalance, batchId]
  );
  return result.rows[0];
};

const assignBatch = async (studentId, batchId) => {
  await pool.query('UPDATE users SET batch_id = $1 WHERE id = $2', [batchId, studentId]);

  if (batchId) {
    const batch = await pool.query('SELECT start_balance FROM batches WHERE id = $1', [batchId]);
    if (batch.rows.length > 0) {
      await resetWallet(studentId, parseFloat(batch.rows[0].start_balance));
    }
  }
  return true;
};

const banUser = async (userId) => {
  await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
  await pool.query('UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1', [userId]);
  return true;
};

const activateUser = async (userId) => {
  await pool.query('UPDATE users SET is_active = true, updated_at = NOW() WHERE id = $1', [userId]);
  return true;
};

const computePortfolioValue = async (userId, cashBalance) => {
  const holdings = await pool.query('SELECT symbol, qty FROM holdings WHERE user_id = $1', [userId]);
  let holdingsValue = 0;

  for (const h of holdings.rows) {
    const quote = await getStockQuote(h.symbol);
    if (quote?.ltp) {
      holdingsValue += quote.ltp * h.qty;
    }
  }

  return parseFloat(cashBalance || 0) + holdingsValue;
};

const getLeaderboard = async (limit = 50, batchId = null, period = null) => {
  let query = `
    SELECT u.id, u.name, u.batch_id, b.name as batch_name, b.start_balance,
           w.balance, w.total_profit
    FROM users u
    JOIN wallets w ON u.id = w.user_id
    LEFT JOIN batches b ON u.batch_id = b.id
    WHERE u.role = 'student' AND u.is_active = true
  `;
  const params = [];

  if (batchId) {
    params.push(batchId);
    query += ` AND u.batch_id = $${params.length}`;
  }

  if (period === 'week') {
    query += ` AND u.created_at >= NOW() - INTERVAL '7 days'`;
  } else if (period === 'month') {
    query += ` AND u.created_at >= NOW() - INTERVAL '30 days'`;
  }

  query += ' ORDER BY w.balance DESC';

  const result = await pool.query(query, params);

  const ranked = await Promise.all(
    result.rows.map(async (r) => {
      const portfolioValue = await computePortfolioValue(r.id, r.balance);
      const startBalance = parseFloat(r.start_balance || 1000000);
      const totalReturns = portfolioValue - startBalance;
      const totalReturnsPercent = startBalance > 0
        ? parseFloat(((totalReturns / startBalance) * 100).toFixed(2))
        : 0;

      return {
        id: r.id,
        name: r.name,
        batchId: r.batch_id,
        batchName: r.batch_name,
        portfolioValue: parseFloat(portfolioValue.toFixed(2)),
        totalReturns: parseFloat(totalReturns.toFixed(2)),
        totalReturnsPercent,
        cashBalance: parseFloat(r.balance)
      };
    })
  );

  ranked.sort((a, b) => b.portfolioValue - a.portfolioValue);

  return ranked.slice(0, limit).map((r, i) => ({
    rank: i + 1,
    ...r
  }));
};

const exportTradesCSV = async (userId = null, batchId = null) => {
  let query = `
    SELECT u.name as trader_name, u.email as trader_email, b.name as batch_name,
           th.symbol, th.qty, th.trade_price, th.trade_type, th.pnl, th.timestamp
    FROM trade_history th
    JOIN users u ON th.user_id = u.id
    LEFT JOIN batches b ON u.batch_id = b.id
    WHERE 1=1
  `;
  const params = [];

  if (userId) {
    params.push(userId);
    query += ` AND th.user_id = $${params.length}`;
  }

  if (batchId) {
    params.push(batchId);
    query += ` AND u.batch_id = $${params.length}`;
  }

  query += ' ORDER BY th.timestamp DESC';

  const result = await pool.query(query, params);

  const headers = ['Trader Name', 'Email', 'Batch', 'Symbol', 'Quantity', 'Price', 'Type', 'P&L', 'Date/Time'];
  const csvRows = [headers.join(',')];

  result.rows.forEach(row => {
    csvRows.push([
      `"${row.trader_name || ''}"`,
      `"${row.trader_email || ''}"`,
      `"${row.batch_name || 'N/A'}"`,
      `"${row.symbol}"`,
      row.qty,
      row.trade_price,
      `"${row.trade_type}"`,
      row.pnl || 0,
      `"${row.timestamp}"`
    ].join(','));
  });

  return csvRows.join('\n');
};

module.exports = {
  getAllStudents,
  getStudentDetails,
  createBatch,
  getBatches,
  updateBatchStartBalance,
  assignBatch,
  banUser,
  activateUser,
  getLeaderboard,
  exportTradesCSV
};
