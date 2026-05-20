const { v4: uuidv4 } = require('uuid');
const { pool } = require('../config/database');
const { WATCHLIST_TEMPLATES } = require('../data/stockMetadata');

const getWatchlistItems = async (watchlistId) => {
  const items = await pool.query(
    'SELECT symbol, sort_order FROM watchlist_items WHERE watchlist_id = $1 ORDER BY sort_order ASC, added_at ASC',
    [watchlistId]
  );
  return items.rows.map((i) => i.symbol);
};

const getWatchlists = async (userId) => {
  const result = await pool.query(
    'SELECT * FROM watchlists WHERE user_id = $1 ORDER BY created_at',
    [userId]
  );

  const watchlists = await Promise.all(
    result.rows.map(async (watchlist) => {
      const symbols = await getWatchlistItems(watchlist.id);
      return { ...watchlist, symbols };
    })
  );

  return watchlists;
};

const ensureDefaultWatchlist = async (userId) => {
  const existing = await pool.query('SELECT id FROM watchlists WHERE user_id = $1 LIMIT 1', [userId]);
  if (existing.rows.length > 0) return existing.rows[0];
  return createWatchlist(userId, 'My Watchlist');
};

const createWatchlist = async (userId, name) => {
  const result = await pool.query(
    'INSERT INTO watchlists (user_id, name) VALUES ($1, $2) RETURNING *',
    [userId, name]
  );
  return result.rows[0];
};

const renameWatchlist = async (userId, watchlistId, name) => {
  if (!name || typeof name !== 'string' || !name.trim()) {
    throw { status: 400, message: 'Watchlist name is required' };
  }
  const result = await pool.query(
    'UPDATE watchlists SET name = $1 WHERE id = $2 AND user_id = $3 RETURNING *',
    [name.trim().slice(0, 80), watchlistId, userId]
  );
  if (result.rows.length === 0) {
    throw { status: 404, message: 'Watchlist not found' };
  }
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

  const maxOrder = await pool.query(
    'SELECT COALESCE(MAX(sort_order), 0)::int AS m FROM watchlist_items WHERE watchlist_id = $1',
    [watchlistId]
  );
  const nextOrder = maxOrder.rows[0].m + 1;

  await pool.query(
    'INSERT INTO watchlist_items (watchlist_id, symbol, sort_order) VALUES ($1, $2, $3) ON CONFLICT (watchlist_id, symbol) DO NOTHING',
    [watchlistId, symbol.toUpperCase(), nextOrder]
  );
  return true;
};

const reorderWatchlist = async (userId, watchlistId, symbols) => {
  const watchlist = await pool.query(
    'SELECT id FROM watchlists WHERE id = $1 AND user_id = $2',
    [watchlistId, userId]
  );
  if (!watchlist.rows.length) throw { status: 404, message: 'Watchlist not found' };

  const list = Array.isArray(symbols) ? symbols.map((s) => String(s).toUpperCase()) : [];
  for (let i = 0; i < list.length; i++) {
    await pool.query(
      'UPDATE watchlist_items SET sort_order = $1 WHERE watchlist_id = $2 AND symbol = $3',
      [i, watchlistId, list[i]]
    );
  }
  return { symbols: list };
};

const importTemplate = async (userId, watchlistId, templateKey) => {
  const template = WATCHLIST_TEMPLATES[templateKey];
  if (!template) throw { status: 400, message: 'Unknown template' };

  for (const sym of template.symbols) {
    await addToWatchlist(userId, watchlistId, sym);
  }
  return { imported: template.symbols.length, name: template.name };
};

const shareWatchlist = async (userId, watchlistId) => {
  const wl = await pool.query(
    'SELECT * FROM watchlists WHERE id = $1 AND user_id = $2',
    [watchlistId, userId]
  );
  if (!wl.rows.length) throw { status: 404, message: 'Watchlist not found' };

  let token = wl.rows[0].share_token;
  if (!token) {
    token = uuidv4();
    await pool.query('UPDATE watchlists SET share_token = $1 WHERE id = $2', [token, watchlistId]);
  }
  return { shareToken: token, symbols: await getWatchlistItems(watchlistId) };
};

const getSharedWatchlist = async (shareToken) => {
  const wl = await pool.query('SELECT id, name FROM watchlists WHERE share_token = $1', [shareToken]);
  if (!wl.rows.length) throw { status: 404, message: 'Shared watchlist not found' };
  return { name: wl.rows[0].name, symbols: await getWatchlistItems(wl.rows[0].id) };
};

const cloneSharedWatchlist = async (userId, shareToken, name) => {
  const shared = await getSharedWatchlist(shareToken);
  const created = await createWatchlist(userId, name || `${shared.name} (copy)`);
  for (const sym of shared.symbols) {
    await addToWatchlist(userId, created.id, sym);
  }
  return created;
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

module.exports = {
  getWatchlists,
  createWatchlist,
  renameWatchlist,
  deleteWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  reorderWatchlist,
  importTemplate,
  shareWatchlist,
  getSharedWatchlist,
  cloneSharedWatchlist,
  ensureDefaultWatchlist
};