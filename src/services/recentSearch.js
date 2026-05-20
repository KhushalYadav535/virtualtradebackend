const { pool } = require('../config/database');

const recordSearch = async (userId, { query, symbol, exchange }) => {
  const q = String(query || symbol || '').trim().slice(0, 100);
  if (!q) return;
  await pool.query(
    `DELETE FROM user_recent_searches WHERE user_id = $1 AND LOWER(query) = LOWER($2)`,
    [userId, q]
  );
  await pool.query(
    `INSERT INTO user_recent_searches (user_id, query, symbol, exchange) VALUES ($1, $2, $3, $4)`,
    [userId, q, symbol || null, exchange || 'NSE']
  );
  await pool.query(
    `DELETE FROM user_recent_searches WHERE user_id = $1 AND id NOT IN (
       SELECT id FROM user_recent_searches WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20
     )`,
    [userId]
  );
};

const getRecentSearches = async (userId, limit = 10) => {
  const result = await pool.query(
    `SELECT query, symbol, exchange, created_at FROM user_recent_searches
     WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [userId, limit]
  );
  return result.rows;
};

module.exports = { recordSearch, getRecentSearches };
