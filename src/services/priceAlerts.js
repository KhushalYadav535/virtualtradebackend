const { pool } = require('../config/database');
const { getStockQuote } = require('./marketData');
const notificationService = require('./notifications');
const { sendNotification } = require('./pushNotifications');

const CONDITION_TYPES = ['above', 'below', 'pct_up', 'pct_down', 'volume_above', 'lot_value_above'];
const ALERT_KINDS = ['price', 'volume', 'lot_value'];

const mapAlert = (row) => ({
  ...row,
  target_price: row.target_price != null ? parseFloat(row.target_price) : null,
  target_pct: row.target_pct != null ? parseFloat(row.target_pct) : null,
  baseline_price: row.baseline_price != null ? parseFloat(row.baseline_price) : null,
  triggered_price: row.triggered_price != null ? parseFloat(row.triggered_price) : null
});

const listActiveAlerts = async (userId) => {
  const result = await pool.query(
    `SELECT * FROM price_alerts WHERE user_id = $1 AND status = 'active' ORDER BY created_at DESC`,
    [userId]
  );
  return result.rows.map(mapAlert);
};

const listAlertHistory = async (userId, limit = 50) => {
  const result = await pool.query(
    `SELECT * FROM price_alerts WHERE user_id = $1 AND status = 'triggered'
     ORDER BY triggered_at DESC NULLS LAST LIMIT $2`,
    [userId, limit]
  );
  return result.rows.map(mapAlert);
};

const normalizeSymbol = (value) => {
  const raw = String(value ?? '').trim().toUpperCase();
  const token = raw.split(/[\s,]+/)[0].replace(/[^A-Z0-9.-]/g, '');
  return token.slice(0, 20);
};

const createAlert = async (userId, data) => {
  const symbol = normalizeSymbol(data.symbol);
  if (!symbol) throw { status: 400, message: 'Invalid symbol' };
  const exchange = data.exchange || 'NSE';
  const conditionType = data.conditionType;
  const alertKind =
    data.alertKind ||
    (conditionType === 'volume_above' ? 'volume' : conditionType === 'lot_value_above' ? 'lot_value' : 'price');

  if (!CONDITION_TYPES.includes(conditionType)) {
    throw { status: 400, message: 'Invalid condition type' };
  }

  const quote = await getStockQuote(symbol);
  const ltp = quote?.ltp;
  if (!ltp) throw { status: 400, message: 'Unable to fetch price for symbol' };

  let targetPrice = data.targetPrice != null ? parseFloat(data.targetPrice) : null;
  let targetPct = data.targetPct != null ? parseFloat(data.targetPct) : null;
  let minVolume = data.minVolume != null ? parseInt(data.minVolume, 10) : null;
  let baselinePrice = ltp;

  if (conditionType === 'volume_above') {
    if (!minVolume || minVolume <= 0) throw { status: 400, message: 'Minimum volume required' };
    targetPrice = null;
    targetPct = null;
  } else if (conditionType === 'lot_value_above') {
    if (!targetPrice || targetPrice <= 0) throw { status: 400, message: 'Minimum lot value (₹) required' };
    targetPct = null;
    minVolume = null;
  } else if (conditionType === 'above' || conditionType === 'below') {
    if (!targetPrice || targetPrice <= 0) throw { status: 400, message: 'Target price required' };
    if (conditionType === 'above' && targetPrice <= ltp) {
      throw { status: 400, message: 'Target price should be above current LTP' };
    }
    if (conditionType === 'below' && targetPrice >= ltp) {
      throw { status: 400, message: 'Target price should be below current LTP' };
    }
    baselinePrice = ltp;
    targetPct = null;
  } else {
    if (!targetPct || targetPct <= 0) throw { status: 400, message: 'Percentage required' };
    targetPrice = null;
    baselinePrice = ltp;
  }

  const activeCount = await pool.query(
    `SELECT COUNT(*)::int AS c FROM price_alerts WHERE user_id = $1 AND status = 'active'`,
    [userId]
  );
  if (activeCount.rows[0].c >= 25) {
    throw { status: 400, message: 'Maximum 25 active alerts allowed' };
  }

  const result = await pool.query(
    `INSERT INTO price_alerts (user_id, symbol, exchange, condition_type, target_price, target_pct, baseline_price, alert_kind, min_volume)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [userId, symbol, exchange, conditionType, targetPrice, targetPct, baselinePrice, alertKind, minVolume]
  );
  return mapAlert(result.rows[0]);
};

const updateAlert = async (userId, alertId, data) => {
  const existing = await pool.query(
    `SELECT * FROM price_alerts WHERE id = $1 AND user_id = $2 AND status = 'active'`,
    [alertId, userId]
  );
  if (!existing.rows.length) throw { status: 404, message: 'Alert not found' };
  const row = existing.rows[0];

  const targetPrice = data.targetPrice != null ? parseFloat(data.targetPrice) : parseFloat(row.target_price);
  const targetPct = data.targetPct != null ? parseFloat(data.targetPct) : parseFloat(row.target_pct);

  const result = await pool.query(
    `UPDATE price_alerts SET
       target_price = COALESCE($1, target_price),
       target_pct = COALESCE($2, target_pct),
       updated_at = NOW()
     WHERE id = $3 AND user_id = $4 RETURNING *`,
    [data.targetPrice != null ? targetPrice : null, data.targetPct != null ? targetPct : null, alertId, userId]
  );
  return mapAlert(result.rows[0]);
};

const deleteAlert = async (userId, alertId) => {
  const result = await pool.query(
    `DELETE FROM price_alerts WHERE id = $1 AND user_id = $2 AND status = 'active' RETURNING id`,
    [alertId, userId]
  );
  if (!result.rows.length) throw { status: 404, message: 'Alert not found' };
  return { message: 'Alert deleted' };
};

const isTriggered = (alert, quote) => {
  const ltp = quote?.ltp;
  if (!ltp) return false;
  const type = alert.condition_type;
  if (type === 'above') return ltp >= parseFloat(alert.target_price);
  if (type === 'below') return ltp <= parseFloat(alert.target_price);
  if (type === 'volume_above') return (quote.volume || 0) >= parseInt(alert.min_volume, 10);
  if (type === 'lot_value_above') {
    const lotVal = ltp * (quote.lotSize || 1);
    return lotVal >= parseFloat(alert.target_price);
  }
  const base = parseFloat(alert.baseline_price);
  const pct = parseFloat(alert.target_pct);
  if (type === 'pct_up') return ltp >= base * (1 + pct / 100);
  if (type === 'pct_down') return ltp <= base * (1 - pct / 100);
  return false;
};

const describeAlert = (alert) => {
  const sym = alert.symbol;
  if (alert.condition_type === 'above') return `${sym} crossed above ₹${alert.target_price}`;
  if (alert.condition_type === 'below') return `${sym} fell below ₹${alert.target_price}`;
  if (alert.condition_type === 'volume_above') return `${sym} volume exceeded ${alert.min_volume}`;
  if (alert.condition_type === 'lot_value_above') return `${sym} lot value exceeded ₹${alert.target_price}`;
  if (alert.condition_type === 'pct_up') return `${sym} moved up ${alert.target_pct}%`;
  return `${sym} moved down ${alert.target_pct}%`;
};

const checkAllPriceAlerts = async () => {
  const result = await pool.query(`SELECT * FROM price_alerts WHERE status = 'active'`);
  if (!result.rows.length) return;

  const quoteCache = new Map();

  for (const alert of result.rows) {
    try {
      let quote = quoteCache.get(alert.symbol);
      if (!quote) {
        quote = await getStockQuote(alert.symbol);
        if (quote?.ltp) quoteCache.set(alert.symbol, quote);
      }
      const ltp = quote?.ltp;
      if (!ltp) continue;

      if (!isTriggered(alert, quote)) continue;

      await pool.query(
        `UPDATE price_alerts SET status = 'triggered', triggered_at = NOW(), triggered_price = $1, updated_at = NOW()
         WHERE id = $2 AND status = 'active'`,
        [ltp, alert.id]
      );

      const title = `Alert: ${alert.symbol}`;
      const body = `${describeAlert(alert)}. LTP ₹${ltp.toFixed(2)}`;

      await notificationService.createNotification(alert.user_id, {
        type: 'price_alert',
        title,
        body,
        metadata: { symbol: alert.symbol, alertId: alert.id, ltp }
      });

      sendNotification(alert.user_id, { title, body, url: '/dashboard/alerts' }).catch(() => {});
    } catch (err) {
      console.error(`Price alert check ${alert.id}:`, err.message);
    }
  }
};

module.exports = {
  listActiveAlerts,
  listAlertHistory,
  createAlert,
  updateAlert,
  deleteAlert,
  checkAllPriceAlerts
};
