const { pool } = require('../config/database');

const getWatchlists = async (userId) => {
  const result = await pool.query(
    'SELECT * FROM watchlists WHERE user_id = $1 ORDER BY created_at',
    [userId]
  );

  const watchlists = await Promise.all(
    result.rows.map(async (watchlist) => {
      const items = await pool.query(
        'SELECT symbol FROM watchlist_items WHERE watchlist_id = $1',
        [watchlist.id]
      );
      return { ...watchlist, symbols: items.rows.map(i => i.symbol) };
    })
  );

  return watchlists;
};

const createWatchlist = async (userId, name) => {
  const result = await pool.query(
    'INSERT INTO watchlists (user_id, name) VALUES ($1, $2) RETURNING *',
    [userId, name]
  );
  return result.rows[0];
};

const deleteWatchlist = async (userId, watchlistId) => {
  const result = await pool.query(
    'DELETE FROM watchlists WHERE id = $1 AND user_id = $2 RETURNING *',
    [watchlistId, userId]
  );
  if (result.rows.length === 0) {
    throw { status: 404, message: 'Watchlist not found' };
  }
  return true;
};

const addToWatchlist = async (userId, watchlistId, symbol) => {
  const watchlist = await pool.query(
    'SELECT * FROM watchlists WHERE id = $1 AND user_id = $2',
    [watchlistId, userId]
  );

  if (watchlist.rows.length === 0) {
    throw { status: 404, message: 'Watchlist not found' };
  }

  await pool.query(
    'INSERT INTO watchlist_items (watchlist_id, symbol) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [watchlistId, symbol]
  );
  return true;
};

const removeFromWatchlist = async (userId, watchlistId, symbol) => {
  const result = await pool.query(
    `DELETE FROM watchlist_items w 
     USING watchlists wl 
     WHERE w.watchlist_id = wl.id AND wl.id = $1 AND wl.user_id = $2 AND w.symbol = $3`,
    [watchlistId, userId, symbol]
  );
  return true;
};

module.exports = { getWatchlists, createWatchlist, deleteWatchlist, addToWatchlist, removeFromWatchlist };