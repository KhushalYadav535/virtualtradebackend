const { getIndices, getMultipleQuotes, getMarketStatus } = require('./marketData');
const { pool } = require('../config/database');

const DEFAULT_SYMBOLS = [
  'NIFTY', 'BANKNIFTY', 'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'SBIN', 'ITC', 'LT'
];

const getOfflineSnapshot = async (userId) => {
  let symbols = [...DEFAULT_SYMBOLS];

  if (userId) {
    const wl = await pool.query(
      `SELECT wi.symbol FROM watchlist_items wi
       JOIN watchlists w ON w.id = wi.watchlist_id
       WHERE w.user_id = $1
       ORDER BY wi.sort_order NULLS LAST, wi.added_at
       LIMIT 40`,
      [userId]
    );
    const fromWl = wl.rows.map((r) => r.symbol).filter(Boolean);
    symbols = [...new Set([...symbols, ...fromWl])].slice(0, 50);
  }

  const [indices, quotes] = await Promise.all([
    getIndices(),
    getMultipleQuotes(symbols)
  ]);

  return {
    cachedAt: new Date().toISOString(),
    marketStatus: getMarketStatus(),
    indices,
    quotes,
    symbols
  };
};

module.exports = { getOfflineSnapshot };
