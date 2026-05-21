const webpush = require('web-push');
const { pool } = require('../config/database');

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:admin@virtualtrade.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

const saveSubscription = async (userId, subscription) => {
  await pool.query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id) DO UPDATE SET endpoint = $2, p256dh = $3, auth = $4, updated_at = NOW()`,
    [userId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth]
  );
};

const getSubscription = async (userId) => {
  const result = await pool.query(
    'SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1',
    [userId]
  );
  return result.rows[0] || null;
};

const deleteSubscription = async (userId) => {
  await pool.query('DELETE FROM push_subscriptions WHERE user_id = $1', [userId]);
};

const defaultPrefs = { orders: true, alerts: true, achievements: true, marketing: false, lotChanges: true };

const getUserNotificationPrefs = async (userId) => {
  const result = await pool.query('SELECT notification_prefs FROM users WHERE id = $1', [userId]);
  return { ...defaultPrefs, ...(result.rows[0]?.notification_prefs || {}) };
};

const sendNotification = async (userId, payload, category = 'alerts') => {
  const prefs = await getUserNotificationPrefs(userId);
  if (category === 'orders' && prefs.orders === false) return false;
  if (category === 'alerts' && prefs.alerts === false) return false;
  if (category === 'achievements' && prefs.achievements === false) return false;
  if (category === 'marketing' && prefs.marketing === false) return false;
  if (category === 'lot_change' && prefs.lotChanges === false) return false;

  const subscription = await getSubscription(userId);
  if (!subscription) {
    console.log(`No push subscription for user ${userId}`);
    return false;
  }

  try {
    const pushSubscription = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.p256dh,
        auth: subscription.auth
      }
    };

    await webpush.sendNotification(pushSubscription, JSON.stringify(payload));
    console.log(`Push notification sent to user ${userId}`);
    return true;
  } catch (err) {
    console.error(`Push notification failed for user ${userId}:`, err.message);
    if (err.statusCode === 410) {
      await deleteSubscription(userId);
    }
    return false;
  }
};

const sendOrderNotification = async (userId, order) => {
  const payload = {
    title: order.status === 'executed' ? 'Order Executed' : 'Order Update',
    body: order.status === 'executed'
      ? `Your ${order.order_type} order for ${order.qty} ${order.symbol} has been executed at ₹${order.executed_price || order.price}`
      : `Your ${order.order_type} order for ${order.qty} ${order.symbol} is now ${order.status}`,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: `order-${order.id}`,
    data: {
      url: '/dashboard/portfolio',
      orderId: order.id,
      symbol: order.symbol,
      type: order.order_type,
      status: order.status
    }
  };

  return sendNotification(userId, payload, 'orders');
};

const sendLotChangeNotification = async (userId, { symbol, oldLot, newLot }) => {
  const payload = {
    title: `Lot size changed: ${symbol}`,
    body: `Lot size updated from ${oldLot} to ${newLot} shares. Review MIS orders and holdings.`,
    icon: '/icon-192.png',
    tag: `lot-${symbol}`,
    data: { url: '/dashboard/portfolio', symbol, oldLot, newLot }
  };
  return sendNotification(userId, payload, 'lot_change');
};

module.exports = {
  saveSubscription,
  getSubscription,
  deleteSubscription,
  sendNotification,
  sendOrderNotification,
  sendLotChangeNotification
};