const { pool } = require('../config/database');

const ALLOWED_TYPES = new Set([
  'order',
  'trade',
  'wallet',
  'achievement',
  'alert',
  'notification'
]);

const formatInr = (n) => {
  const v = parseFloat(n);
  if (Number.isNaN(v)) return '₹0';
  return `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
};

const orderStatusLabel = (status) => {
  const map = {
    pending: 'Pending',
    executed: 'Executed',
    cancelled: 'Cancelled',
    rejected: 'Rejected'
  };
  return map[status] || status;
};

const mapOrder = (o) => {
  const ts = o.executed_at || o.created_at;
  const side = o.order_type === 'SELL' ? 'Sell' : 'Buy';
  const status = orderStatusLabel(o.status);
  const price =
    o.executed_price != null
      ? formatInr(o.executed_price)
      : o.price != null
        ? formatInr(o.price)
        : 'market';

  return {
    id: `order-${o.id}`,
    type: 'order',
    title: `${side} ${o.symbol}`,
    description: `${o.qty} qty · ${o.product_type || 'CNC'} · ${o.order_mode} · ${status} · ${price}`,
    timestamp: ts,
    metadata: {
      symbol: o.symbol,
      status: o.status,
      qty: o.qty,
      orderId: o.id
    }
  };
};

const mapTrade = (t) => {
  const pnl = parseFloat(t.pnl);
  const pnlPart =
    t.trade_type === 'SELL' && !Number.isNaN(pnl)
      ? ` · P&L ${pnl >= 0 ? '+' : ''}${formatInr(pnl)}`
      : '';

  return {
    id: `trade-${t.id}`,
    type: 'trade',
    title: `${t.trade_type === 'SELL' ? 'Sell' : 'Buy'} ${t.symbol}`,
    description: `${t.qty} @ ${formatInr(t.trade_price)}${pnlPart}`,
    timestamp: t.timestamp,
    metadata: {
      symbol: t.symbol,
      pnl: Number.isNaN(pnl) ? 0 : pnl,
      orderId: t.order_id
    }
  };
};

const mapWallet = (w) => {
  const isCredit = w.type === 'credit';
  return {
    id: `wallet-${w.id}`,
    type: 'wallet',
    title: isCredit ? 'Funds credited' : 'Funds debited',
    description: w.description || formatInr(w.amount),
    timestamp: w.created_at,
    metadata: { amount: parseFloat(w.amount), type: w.type }
  };
};

const mapAchievement = (a) => ({
  id: `achievement-${a.id}`,
  type: 'achievement',
  title: `Badge unlocked: ${a.title}`,
  description: a.description,
  timestamp: a.unlocked_at,
  metadata: { points: a.points, achievementId: a.achievement_id }
});

const mapAlert = (al) => ({
  id: `alert-${al.id}`,
  type: 'alert',
  title: `Price alert: ${al.symbol}`,
  description: `${al.condition_type} triggered @ ${formatInr(al.triggered_price || 0)}`,
  timestamp: al.triggered_at,
  metadata: { symbol: al.symbol, conditionType: al.condition_type }
});

const mapNotification = (n) => ({
  id: `notification-${n.id}`,
  type: 'notification',
  title: n.title,
  description: n.body || n.type,
  timestamp: n.created_at,
  metadata: { notificationType: n.type, isRead: n.is_read }
});

/**
 * Unified activity feed: trades, non-executed orders, standalone wallet txns,
 * achievements, triggered alerts, and in-app notifications.
 * Deduplicates trade-linked wallet rows and executed orders (shown via trades).
 */
const getActivityFeed = async (userId, options = {}) => {
  const limit =
    typeof options === 'number'
      ? options
      : Math.min(Math.max(parseInt(options.limit, 10) || 30, 1), 100);

  const typeFilter = options.types
    ? options.types.filter((t) => ALLOWED_TYPES.has(t))
    : null;

  const perSource = Math.ceil(limit / 3);

  const [
    ordersRes,
    tradesRes,
    walletRes,
    achievementsRes,
    alertsRes,
    notificationsRes
  ] = await Promise.all([
    pool.query(
      `SELECT id, symbol, order_type, order_mode, product_type, qty, status, price, executed_price, created_at, executed_at
       FROM orders
       WHERE user_id = $1 AND status != 'executed'
       ORDER BY COALESCE(executed_at, created_at) DESC
       LIMIT $2`,
      [userId, perSource]
    ),
    pool.query(
      `SELECT id, order_id, symbol, qty, trade_type, trade_price, pnl, timestamp
       FROM trade_history
       WHERE user_id = $1
       ORDER BY timestamp DESC
       LIMIT $2`,
      [userId, perSource]
    ),
    pool.query(
      `SELECT id, type, amount, description, created_at
       FROM wallet_transactions
       WHERE user_id = $1 AND order_id IS NULL
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, perSource]
    ),
    pool.query(
      `SELECT ua.id, ua.achievement_id, ua.unlocked_at, a.title, a.description, a.points
       FROM user_achievements ua
       JOIN achievements a ON a.id = ua.achievement_id
       WHERE ua.user_id = $1
       ORDER BY ua.unlocked_at DESC
       LIMIT $2`,
      [userId, perSource]
    ),
    pool.query(
      `SELECT id, symbol, condition_type, triggered_price, triggered_at
       FROM price_alerts
       WHERE user_id = $1 AND status = 'triggered' AND triggered_at IS NOT NULL
       ORDER BY triggered_at DESC
       LIMIT $2`,
      [userId, perSource]
    ),
    pool.query(
      `SELECT id, type, title, body, is_read, created_at
       FROM in_app_notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, perSource]
    )
  ]);

  let items = [
    ...ordersRes.rows.map(mapOrder),
    ...tradesRes.rows.map(mapTrade),
    ...walletRes.rows.map(mapWallet),
    ...achievementsRes.rows.map(mapAchievement),
    ...alertsRes.rows.map(mapAlert),
    ...notificationsRes.rows.map(mapNotification)
  ];

  if (typeFilter?.length) {
    const allowed = new Set(typeFilter);
    items = items.filter((item) => allowed.has(item.type));
  }

  items = items
    .filter((item) => item.timestamp)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  return items.slice(0, limit);
};

module.exports = { getActivityFeed, ALLOWED_TYPES };
