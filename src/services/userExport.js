const { pool } = require('../config/database');
const { mergeTradingPrefs } = require('../utils/tradingPrefs');

const exportUserData = async (userId) => {
  const [userRes, orders, holdings, trades, alerts, notifications] = await Promise.all([
    pool.query(
      `SELECT id, name, email, phone, date_of_birth, role, locale, notification_prefs, trading_prefs, created_at
       FROM users WHERE id = $1`,
      [userId]
    ),
    pool.query(`SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT 500`, [userId]),
    pool.query(`SELECT * FROM holdings WHERE user_id = $1`, [userId]),
    pool.query(`SELECT * FROM trade_history WHERE user_id = $1 ORDER BY timestamp DESC LIMIT 500`, [userId]),
    pool.query(`SELECT * FROM price_alerts WHERE user_id = $1 ORDER BY created_at DESC`, [userId]),
    pool.query(`SELECT * FROM in_app_notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200`, [
      userId
    ])
  ]);

  const user = userRes.rows[0];
  if (!user) throw { status: 404, message: 'User not found' };

  return {
    exportedAt: new Date().toISOString(),
    profile: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      dateOfBirth: user.date_of_birth,
      locale: user.locale,
      createdAt: user.created_at
    },
    tradingPrefs: mergeTradingPrefs(user.trading_prefs),
    notificationPrefs: user.notification_prefs || {},
    orders: orders.rows,
    holdings: holdings.rows,
    tradeHistory: trades.rows,
    priceAlerts: alerts.rows,
    notifications: notifications.rows
  };
};

module.exports = { exportUserData };
