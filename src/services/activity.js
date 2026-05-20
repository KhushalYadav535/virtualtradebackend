const { pool } = require('../config/database');

const getActivityFeed = async (userId, limit = 40) => {
  const cap = Math.min(Math.max(parseInt(limit, 10) || 40, 1), 100);
  const perSource = Math.ceil(cap / 2);

  const [ordersRes, tradesRes, walletRes, achievementsRes, alertsRes] = await Promise.all([
    pool.query(
      `SELECT id, symbol, order_type, order_mode, product_type, qty, status, price, executed_price, created_at, executed_at
       FROM orders WHERE user_id = $1 ORDER BY COALESCE(executed_at, created_at) DESC LIMIT $2`,
      [userId, perSource]
    ),
    pool.query(
      `SELECT id, symbol, qty, trade_type, trade_price, pnl, timestamp FROM trade_history
       WHERE user_id = $1 ORDER BY timestamp DESC LIMIT $2`,
      [userId, perSource]
    ),
    pool.query(
      `SELECT id, type, amount, description, created_at FROM wallet_transactions
       WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [userId, perSource]
    ),
    pool.query(
      `SELECT ua.unlocked_at, a.title, a.description, a.points
       FROM user_achievements ua JOIN achievements a ON a.id = ua.achievement_id
       WHERE ua.user_id = $1 ORDER BY ua.unlocked_at DESC LIMIT $2`,
      [userId, perSource]
    ),
    pool.query(
      `SELECT id, symbol, condition_type, triggered_price, triggered_at
       FROM price_alerts WHERE user_id = $1 AND status = 'triggered' ORDER BY triggered_at DESC LIMIT $2`,
      [userId, perSource]
    )
  ]);

  const items = [];

  for (const o of ordersRes.rows) {
    const ts = o.executed_at || o.created_at;
    items.push({
      id: `order-${o.id}`,
      type: 'order',
      title: `${o.order_type} ${o.symbol}`,
      description: `${o.qty} qty · ${o.product_type || 'CNC'} · ${o.order_mode} · ${o.status}`,
      timestamp: ts,
      metadata: { symbol: o.symbol, status: o.status, qty: o.qty }
    });
  }

  for (const t of tradesRes.rows) {
    items.push({
      id: `trade-${t.id}`,
      type: 'trade',
      title: `${t.trade_type} ${t.symbol}`,
      description: `${t.qty} @ ₹${parseFloat(t.trade_price).toFixed(2)}${t.pnl ? ` · P&L ₹${parseFloat(t.pnl).toFixed(2)}` : ''}`,
      timestamp: t.timestamp,
      metadata: { symbol: t.symbol, pnl: parseFloat(t.pnl) }
    });
  }

  for (const w of walletRes.rows) {
    items.push({
      id: `wallet-${w.id}`,
      type: 'wallet',
      title: w.type === 'credit' ? 'Funds credited' : 'Funds debited',
      description: w.description || `₹${parseFloat(w.amount).toLocaleString('en-IN')}`,
      timestamp: w.created_at,
      metadata: { amount: parseFloat(w.amount), type: w.type }
    });
  }

  for (const a of achievementsRes.rows) {
    items.push({
      id: `achievement-${a.title}`,
      type: 'achievement',
      title: `Badge: ${a.title}`,
      description: a.description,
      timestamp: a.unlocked_at,
      metadata: { points: a.points }
    });
  }

  for (const al of alertsRes.rows) {
    items.push({
      id: `alert-${al.id}`,
      type: 'alert',
      title: `Alert triggered: ${al.symbol}`,
      description: `${al.condition_type} @ ₹${parseFloat(al.triggered_price || 0).toFixed(2)}`,
      timestamp: al.triggered_at,
      metadata: { symbol: al.symbol }
    });
  }

  items.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return items.slice(0, cap);
};

module.exports = { getActivityFeed };
