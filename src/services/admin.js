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

const DEFAULT_FEATURE_FLAGS = {
  maintenanceMode: false,
  allowNewRegistrations: true,
  optionsTradingEnabled: true,
  misTradingEnabled: true,
  showLeaderboard: true,
  basketOrdersEnabled: true
};

const trainerStudentFilter = (requesterId, requesterRole, alias = 'u') => {
  if (requesterRole !== 'trainer') return { clause: '', params: [] };
  return {
    clause: ` AND (${alias}.batch_id IN (SELECT id FROM batches WHERE trainer_id = $1) OR ${alias}.batch_id IS NULL)`,
    params: [requesterId]
  };
};

const getAnalytics = async (requesterId, requesterRole) => {
  const tf = trainerStudentFilter(requesterId, requesterRole, 'u');

  const usersRes = await pool.query(
    `SELECT COUNT(*)::int AS total FROM users u WHERE u.role = 'student'${tf.clause}`,
    tf.params
  );

  const tradesRes = await pool.query(
    `SELECT COUNT(*)::int AS cnt,
            COALESCE(SUM(th.qty * th.trade_price), 0)::numeric AS volume
     FROM trade_history th
     JOIN users u ON u.id = th.user_id
     WHERE th.timestamp >= CURRENT_DATE${tf.clause.replace(/\bu\./g, 'u.')}`,
    tf.params
  );

  const rejectRes = await pool.query(
    `SELECT COUNT(*)::int AS cnt FROM orders o
     JOIN users u ON u.id = o.user_id
     WHERE o.status IN ('rejected', 'cancelled')
       AND o.created_at >= CURRENT_DATE
       AND o.reject_reason IS NOT NULL${tf.clause.replace(/u\./g, 'u.')}`,
    tf.params
  );

  const pendingRes = await pool.query(
    `SELECT COUNT(*)::int AS cnt FROM orders o
     JOIN users u ON u.id = o.user_id
     WHERE o.status = 'pending'${tf.clause.replace(/u\./g, 'u.')}`,
    tf.params
  );

  return {
    totalUsers: usersRes.rows[0]?.total || 0,
    activeTradesToday: tradesRes.rows[0]?.cnt || 0,
    totalVolumeToday: parseFloat(tradesRes.rows[0]?.volume || 0),
    rejectionsToday: rejectRes.rows[0]?.cnt || 0,
    pendingOrders: pendingRes.rows[0]?.cnt || 0
  };
};

const getRecentOrders = async (requesterId, requesterRole, limit = 80) => {
  const tf = trainerStudentFilter(requesterId, requesterRole, 'u');
  const params = [...tf.params, limit];
  const limitIdx = params.length;

  const result = await pool.query(
    `SELECT o.*, u.name AS user_name, u.email AS user_email
     FROM orders o
     JOIN users u ON u.id = o.user_id
     WHERE u.role = 'student'${tf.clause}
     ORDER BY o.created_at DESC
     LIMIT $${limitIdx}`,
    params
  );

  return result.rows.map((r) => ({
    id: r.id,
    user: r.user_name,
    userEmail: r.user_email,
    symbol: r.symbol,
    type: r.order_type,
    qty: r.qty,
    status: (r.status || '').toUpperCase(),
    orderMode: r.order_mode,
    productType: r.product_type,
    rejectReason: r.reject_reason,
    time: r.created_at
  }));
};

const getLotValidationLogs = async (requesterId, requesterRole, limit = 80) => {
  const tf = trainerStudentFilter(requesterId, requesterRole, 'u');
  const halfLimit = Math.max(1, Math.floor(limit / 2));
  const ordersParams = [...tf.params, halfLimit];

  const ordersRes = await pool.query(
    `SELECT o.id, u.name AS user_name, o.symbol, o.reject_reason AS issue,
            o.status, o.created_at AS time
     FROM orders o
     JOIN users u ON u.id = o.user_id
     WHERE o.reject_reason IS NOT NULL${tf.clause}
     ORDER BY o.created_at DESC
     LIMIT $${ordersParams.length}`,
    ordersParams
  );

  const lotEvents = await pool.query(
    `SELECT id, symbol, old_lot_size, new_lot_size, created_at AS time
     FROM lot_change_events
     ORDER BY created_at DESC
     LIMIT $1`,
    [halfLimit]
  );

  const orderLogs = ordersRes.rows.map((r) => ({
    id: r.id,
    user: r.user_name,
    symbol: r.symbol,
    issue: r.issue,
    action: r.status === 'rejected' ? 'REJECTED' : 'CANCELLED',
    time: r.time
  }));

  const lotLogs = lotEvents.rows.map((r) => ({
    id: r.id,
    user: 'System',
    symbol: r.symbol,
    issue: `Lot size changed ${r.old_lot_size} → ${r.new_lot_size}`,
    action: 'LOT CHANGE',
    time: r.time
  }));

  return [...orderLogs, ...lotLogs]
    .sort((a, b) => new Date(b.time) - new Date(a.time))
    .slice(0, limit);
};

const ensureAppSettingsTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key VARCHAR(50) PRIMARY KEY,
      value JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMP DEFAULT NOW()
    )`);
  await pool.query(
    `INSERT INTO app_settings (key, value) VALUES (
      'feature_flags',
      $1::jsonb
    ) ON CONFLICT (key) DO NOTHING`,
    [JSON.stringify(DEFAULT_FEATURE_FLAGS)]
  );
};

const getFeatureFlags = async () => {
  try {
    await ensureAppSettingsTable();
    const res = await pool.query(`SELECT value FROM app_settings WHERE key = 'feature_flags'`);
    if (!res.rows.length) return { ...DEFAULT_FEATURE_FLAGS };
    return { ...DEFAULT_FEATURE_FLAGS, ...res.rows[0].value };
  } catch (err) {
    console.error('getFeatureFlags:', err.message);
    return { ...DEFAULT_FEATURE_FLAGS };
  }
};

const updateFeatureFlags = async (patch) => {
  const current = await getFeatureFlags();
  const next = {
    maintenanceMode: patch.maintenanceMode === true,
    allowNewRegistrations: patch.allowNewRegistrations !== false,
    optionsTradingEnabled: patch.optionsTradingEnabled !== false,
    misTradingEnabled: patch.misTradingEnabled !== false,
    showLeaderboard: patch.showLeaderboard !== false,
    basketOrdersEnabled: patch.basketOrdersEnabled !== false
  };
  await pool.query(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ('feature_flags', $1::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $1::jsonb, updated_at = NOW()`,
    [JSON.stringify(next)]
  );
  return next;
};

const getLotSizeMaster = async () => {
  let cache = { rows: [] };
  let events = { rows: [] };
  try {
    cache = await pool.query(
      `SELECT symbol, lot_size, updated_at FROM symbol_lot_cache ORDER BY symbol`
    );
  } catch (err) {
    console.error('getLotSizeMaster cache:', err.message);
  }
  try {
    events = await pool.query(
      `SELECT symbol, old_lot_size, new_lot_size, created_at
       FROM lot_change_events ORDER BY created_at DESC LIMIT 30`
    );
  } catch (err) {
    console.error('getLotSizeMaster events:', err.message);
  }
  const { FUTURES_UNIVERSE } = require('../data/futuresUniverse');
  const { getLotSize } = require('./marketData');
  const defaults = FUTURES_UNIVERSE.map((f) => ({
    symbol: f.symbol,
    lotSize: getLotSize(f.symbol),
    source: 'default',
    updatedAt: null
  }));
  const cacheMap = Object.fromEntries(cache.rows.map((r) => [r.symbol, r]));
  const merged = [...new Set([...defaults.map((d) => d.symbol), ...cache.rows.map((r) => r.symbol)])].map(
    (sym) => {
      const c = cacheMap[sym];
      return {
        symbol: sym,
        lotSize: c ? c.lot_size : getLotSize(sym),
        source: c ? 'cache' : 'default',
        updatedAt: c?.updated_at || null
      };
    }
  );
  return { lots: merged.sort((a, b) => a.symbol.localeCompare(b.symbol)), recentChanges: events.rows };
};

const syncLotSizes = async () => {
  const { getLotSize } = require('./marketData');
  const { FUTURES_UNIVERSE } = require('../data/futuresUniverse');
  const allSymbols = new Set();

  for (const f of FUTURES_UNIVERSE) allSymbols.add(f.symbol);
  try {
    const { getCachedLotSize } = require('./lotChangeAlerts');
    const marketData = require('./marketData');
    let stockList = [];
    try { stockList = await marketData.getStockList() || []; } catch (e) {}
    for (const s of stockList) {
      const sym = (s.symbol || s).toUpperCase().trim();
      if (sym) allSymbols.add(sym);
    }
  } catch (e) {}

  const entries = [...allSymbols].map((sym) => ({ symbol: sym, lotSize: getLotSize(sym) }));
  const uniqueEntries = [];
  const seen = new Set();
  for (const e of entries) {
    if (!seen.has(e.symbol)) { seen.add(e.symbol); uniqueEntries.push(e); }
  }

  if (!uniqueEntries.length || !pool) return { synced: 0, total: 0, message: 'No symbols to sync' };

  const chunkSize = 100;
  let synced = 0;
  for (let i = 0; i < uniqueEntries.length; i += chunkSize) {
    const chunk = uniqueEntries.slice(i, i + chunkSize);
    const symbols = chunk.map((e) => e.symbol);
    const sizes = chunk.map((e) => e.lotSize);
    await pool.query(
      `INSERT INTO symbol_lot_cache (symbol, lot_size, updated_at)
       SELECT s, l, NOW() FROM unnest($1::varchar[], $2::int[]) AS t(s, l)
       ON CONFLICT (symbol) DO UPDATE SET lot_size = EXCLUDED.lot_size, updated_at = NOW()`,
      [symbols, sizes]
    );
    synced += chunk.length;
  }

  await pool.query(
    `INSERT INTO app_settings (key, value) VALUES ('last_lot_sync', $1::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = $1::jsonb, updated_at = NOW()`,
    [JSON.stringify({ syncedAt: new Date().toISOString(), count: uniqueEntries.length })]
  );

  return { synced, total: uniqueEntries.length, message: `Synced ${synced} lot sizes` };
};

const upsertLotSize = async (symbol, lotSize) => {
  const sym = String(symbol || '').toUpperCase().trim();
  const size = parseInt(lotSize, 10);
  if (!sym || size < 1) throw { status: 400, message: 'Invalid symbol or lot size' };

  const prev = await pool.query(`SELECT lot_size FROM symbol_lot_cache WHERE symbol = $1`, [sym]);
  const oldLot = prev.rows[0]?.lot_size;

  await pool.query(
    `INSERT INTO symbol_lot_cache (symbol, lot_size, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (symbol) DO UPDATE SET lot_size = $2, updated_at = NOW()`,
    [sym, size]
  );

  if (oldLot && oldLot !== size) {
    await pool.query(
      `INSERT INTO lot_change_events (symbol, old_lot_size, new_lot_size) VALUES ($1, $2, $3)`,
      [sym, oldLot, size]
    );
  }

  return { symbol: sym, lotSize: size, previous: oldLot || null };
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
  exportTradesCSV,
  getAnalytics,
  getRecentOrders,
  getLotValidationLogs,
  getFeatureFlags,
  updateFeatureFlags,
  getLotSizeMaster,
  upsertLotSize,
  syncLotSizes,
  DEFAULT_FEATURE_FLAGS
};
