const { pool } = require('../config/database');
const { getMarketPhase } = require('./marketData');
const { getFundsDetail } = require('./wallet');
const { getIstClock } = require('../utils/positionUtils');
const {
  notifyLowMargin,
  notifyAutoSquareOffWarning,
  notifyMarketSession,
  notifyCorporateAction,
  notifyFractionalLot
} = require('./alertNotifications');
const { getActionsForSymbol } = require('../data/corporateActions');
const { getEffectiveLotSize } = require('../utils/lotUtils');
const { getStockQuote } = require('./marketData');

let lastOpenReminderDate = null;
let lastCloseReminderDate = null;
let lastSquareOffWarnDate = null;
const lowMarginCooldown = new Map();

const listUsersWithMisPositions = async () => {
  const r = await pool.query(
    `SELECT DISTINCT user_id FROM intraday_positions WHERE qty > 0`
  );
  return r.rows.map((row) => row.user_id);
};

const checkMarketSessionReminders = async () => {
  const { day, minutes, dateKey } = getIstClock();
  if (day === 0 || day === 6) return;

  const users = await pool.query('SELECT id FROM users WHERE is_active IS NOT FALSE LIMIT 500');
  const ids = users.rows.map((r) => r.id);

  if (minutes >= 9 * 60 + 10 && minutes < 9 * 60 + 20 && lastOpenReminderDate !== dateKey) {
    lastOpenReminderDate = dateKey;
    for (const uid of ids) {
      await notifyMarketSession(uid, 'open');
    }
  }

  if (minutes >= 15 * 60 + 20 && minutes < 15 * 60 + 30 && lastCloseReminderDate !== dateKey) {
    lastCloseReminderDate = dateKey;
    for (const uid of ids) {
      await notifyMarketSession(uid, 'close');
    }
  }
};

const checkAutoSquareOffWarnings = async () => {
  const { day, minutes, dateKey } = getIstClock();
  if (day === 0 || day === 6) return;
  const warnStart = 15 * 60 + 12;
  const warnEnd = 15 * 60 + 19;
  if (minutes < warnStart || minutes > warnEnd) return;
  if (lastSquareOffWarnDate === dateKey) return;
  lastSquareOffWarnDate = dateKey;

  const userIds = await listUsersWithMisPositions();
  for (const userId of userIds) {
    const pos = await pool.query(
      `SELECT symbol, qty FROM intraday_positions WHERE user_id = $1 AND qty > 0`,
      [userId]
    );
    const positions = [];
    for (const row of pos.rows) {
      const quote = await getStockQuote(row.symbol).catch(() => null);
      positions.push({
        symbol: row.symbol,
        qty: row.qty,
        lotSize: quote ? getEffectiveLotSize(quote, 'MIS') : 1
      });
    }
    if (positions.length) await notifyAutoSquareOffWarning(userId, positions);
  }
};

const checkLowMarginAlerts = async () => {
  if (getMarketPhase() === 'closed') return;
  const users = await pool.query('SELECT id FROM users WHERE is_active IS NOT FALSE LIMIT 300');
  const now = Date.now();

  for (const { id: userId } of users.rows) {
    try {
      const last = lowMarginCooldown.get(userId) || 0;
      if (now - last < 30 * 60 * 1000) continue;

      const funds = await getFundsDetail(userId);
      if (!funds?.lowMarginAlert) continue;

      await notifyLowMargin(userId, {
        utilizationPercent: funds.marginUtilizationPercent,
        usedMargin: funds.usedMargin,
        availableCash: funds.availableCash
      });
      lowMarginCooldown.set(userId, now);
    } catch {
      /* skip user */
    }
  }
};

const checkCorporateActionReminders = async () => {
  const today = new Date().toISOString().slice(0, 10);
  const in7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  const holdings = await pool.query(
    `SELECT DISTINCT user_id, symbol FROM holdings WHERE qty > 0`
  );
  const sent = new Set();

  for (const row of holdings.rows) {
    const actions = getActionsForSymbol(row.symbol).filter(
      (a) => a.exDate >= today && a.exDate <= in7
    );
    for (const action of actions) {
      const key = `${row.user_id}-${action.symbol}-${action.exDate}-${action.type}`;
      if (sent.has(key)) continue;
      sent.add(key);
      await notifyCorporateAction(row.user_id, action, row.symbol);
    }
  }
};

const checkFractionalLotHoldings = async () => {
  const holdings = await pool.query(`SELECT user_id, symbol, qty FROM holdings WHERE qty > 0`);
  const cooldown = new Map();

  for (const row of holdings.rows) {
    const quote = await getStockQuote(row.symbol).catch(() => null);
    const lotSize = quote ? getEffectiveLotSize(quote, 'CNC') : 1;
    if (lotSize <= 1) continue;
    if (row.qty % lotSize === 0) continue;

    const key = `${row.user_id}-${row.symbol}`;
    if (cooldown.has(key)) continue;
    cooldown.set(key, true);
    await notifyFractionalLot(row.user_id, row.symbol, row.qty, lotSize);
  }
};

const runScheduledNotificationChecks = async () => {
  await checkMarketSessionReminders();
  await checkAutoSquareOffWarnings();
  await checkLowMarginAlerts();
};

let lastCorpCheckDate = null;
const runDailyNotificationChecks = async () => {
  const { dateKey } = getIstClock();
  if (lastCorpCheckDate === dateKey) return;
  lastCorpCheckDate = dateKey;
  await checkCorporateActionReminders();
  await checkFractionalLotHoldings();
};

module.exports = {
  runScheduledNotificationChecks,
  runDailyNotificationChecks,
  checkMarketSessionReminders,
  checkAutoSquareOffWarnings,
  checkLowMarginAlerts
};
