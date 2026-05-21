const { pool } = require('../config/database');
const { createNotification } = require('./notifications');
const { sendLotChangeNotification } = require('./pushNotifications');

/** In-memory lot cache — avoids per-symbol DB hits on every price poll */
const memoryLotCache = new Map();
let cacheLoaded = false;
let lastProcessAt = 0;
let processing = false;
let lastErrorLogAt = 0;

const MIN_INTERVAL_MS = 120_000;
const ERROR_LOG_COOLDOWN_MS = 60_000;

const logErrorOnce = (msg) => {
  const now = Date.now();
  if (now - lastErrorLogAt < ERROR_LOG_COOLDOWN_MS) return;
  lastErrorLogAt = now;
  console.error('Lot change check:', msg);
};

const loadMemoryCache = async () => {
  if (cacheLoaded || !pool) return;
  try {
    const result = await pool.query('SELECT symbol, lot_size FROM symbol_lot_cache');
    for (const row of result.rows) {
      memoryLotCache.set(row.symbol, parseInt(row.lot_size, 10));
    }
  } catch (err) {
    logErrorOnce(err.message);
  } finally {
    cacheLoaded = true;
  }
};

const persistLotSizesBatch = async (entries) => {
  if (!entries.length || !pool) return;
  const symbols = entries.map((e) => e.symbol);
  const sizes = entries.map((e) => e.lotSize);
  await pool.query(
    `INSERT INTO symbol_lot_cache (symbol, lot_size, updated_at)
     SELECT s, l, NOW() FROM unnest($1::varchar[], $2::int[]) AS t(s, l)
     ON CONFLICT (symbol) DO UPDATE SET lot_size = EXCLUDED.lot_size, updated_at = NOW()`,
    [symbols, sizes]
  );
};

const getUsersAffectedBySymbol = async (symbol) => {
  const result = await pool.query(
    `SELECT DISTINCT user_id FROM (
       SELECT user_id FROM holdings WHERE symbol = $1
       UNION
       SELECT w.user_id FROM watchlist_items wi
       JOIN watchlists w ON w.id = wi.watchlist_id
       WHERE wi.symbol = $1
     ) u`,
    [symbol]
  );
  return result.rows.map((r) => r.user_id);
};

const notifyLotSizeChange = async (symbol, oldLot, newLot) => {
  const userIds = await getUsersAffectedBySymbol(symbol);
  const title = `Lot size changed: ${symbol}`;
  const body = `Exchange lot size updated from ${oldLot} to ${newLot} shares. Review open MIS orders and holdings.`;
  const metadata = { symbol, oldLotSize: oldLot, newLotSize: newLot, type: 'lot_change' };

  for (const userId of userIds) {
    try {
      await createNotification(userId, { type: 'lot_change', title, body, metadata });
      await sendLotChangeNotification(userId, { symbol, oldLot, newLot });
    } catch (err) {
      console.error('Lot change notify error:', err.message);
    }
  }
};

/**
 * Compare quote lot sizes with in-memory cache; DB only on seed/change (max ~every 2 min).
 */
const processQuotesForLotChanges = async (quotes) => {
  if (!Array.isArray(quotes) || quotes.length === 0 || !pool) return;

  const now = Date.now();
  if (processing || now - lastProcessAt < MIN_INTERVAL_MS) return;

  processing = true;
  lastProcessAt = now;

  try {
    await loadMemoryCache();

    const toPersist = [];
    const changes = [];

    for (const q of quotes) {
      if (!q?.symbol) continue;
      const sym = q.symbol.toUpperCase();
      const newLot = parseInt(q.lotSize || q.lotSizeMis || 1, 10) || 1;
      const oldLot = memoryLotCache.has(sym) ? memoryLotCache.get(sym) : null;

      if (oldLot === null) {
        memoryLotCache.set(sym, newLot);
        toPersist.push({ symbol: sym, lotSize: newLot });
        continue;
      }
      if (oldLot !== newLot) {
        changes.push({ sym, oldLot, newLot });
        memoryLotCache.set(sym, newLot);
        toPersist.push({ symbol: sym, lotSize: newLot });
      }
    }

    if (toPersist.length) {
      await persistLotSizesBatch(toPersist);
    }

    for (const { sym, oldLot, newLot } of changes) {
      await pool.query(
        `INSERT INTO lot_change_events (symbol, old_lot_size, new_lot_size) VALUES ($1, $2, $3)`,
        [sym, oldLot, newLot]
      );
      await notifyLotSizeChange(sym, oldLot, newLot);
      console.log(`Lot size change: ${sym} ${oldLot} → ${newLot}`);
    }
  } catch (err) {
    logErrorOnce(err.message);
  } finally {
    processing = false;
  }
};

const getCachedLotSize = async (symbol) => {
  const sym = String(symbol || '').toUpperCase();
  if (memoryLotCache.has(sym)) return memoryLotCache.get(sym);
  if (!pool) return null;
  const result = await pool.query(
    'SELECT lot_size FROM symbol_lot_cache WHERE symbol = $1',
    [sym]
  );
  const size = result.rows[0] ? parseInt(result.rows[0].lot_size, 10) : null;
  if (size != null) memoryLotCache.set(sym, size);
  return size;
};

const simulateLotChange = async (symbol, newLotSize) => {
  const sym = String(symbol || '').toUpperCase();
  let newLot = parseInt(newLotSize, 10) || 1;
  await loadMemoryCache();
  const oldLot = memoryLotCache.get(sym) ?? 1;
  if (oldLot === newLot) newLot = oldLot <= 1 ? 10 : 1;
  memoryLotCache.set(sym, newLot);
  await persistLotSizesBatch([{ symbol: sym, lotSize: newLot }]);
  await pool.query(
    `INSERT INTO lot_change_events (symbol, old_lot_size, new_lot_size) VALUES ($1, $2, $3)`,
    [sym, oldLot, newLot]
  );
  await notifyLotSizeChange(sym, oldLot, newLot);
  return { symbol: sym, oldLot, newLot, notified: true };
};

module.exports = {
  processQuotesForLotChanges,
  simulateLotChange,
  getCachedLotSize
};
