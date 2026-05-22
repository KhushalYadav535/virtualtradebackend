const { pool } = require('../config/database');

const createNotification = async (userId, { type, title, body, metadata = {} }) => {
  const result = await pool.query(
    `INSERT INTO in_app_notifications (user_id, type, title, body, metadata)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [userId, type, title, body || null, JSON.stringify(metadata)]
  );
  return result.rows[0];
};

const listNotifications = async (userId, { limit = 50, unreadOnly = false, type } = {}) => {
  const params = [userId];
  let sql = `SELECT * FROM in_app_notifications WHERE user_id = $1`;
  if (unreadOnly) sql += ` AND is_read = false`;
  if (type && type !== 'all') {
    params.push(type);
    sql += ` AND type = $${params.length}`;
  }
  sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
  params.push(limit);
  const result = await pool.query(sql, params);
  return result.rows.map((row) => ({
    ...row,
    metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata || '{}') : row.metadata || {}
  }));
};

const getUnreadCount = async (userId) => {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS count FROM in_app_notifications WHERE user_id = $1 AND is_read = false`,
    [userId]
  );
  return result.rows[0].count;
};

const markRead = async (userId, notificationId) => {
  const result = await pool.query(
    `UPDATE in_app_notifications SET is_read = true
     WHERE id = $1 AND user_id = $2 RETURNING *`,
    [notificationId, userId]
  );
  if (!result.rows.length) throw { status: 404, message: 'Notification not found' };
  return result.rows[0];
};

const markAllRead = async (userId) => {
  await pool.query(
    `UPDATE in_app_notifications SET is_read = true WHERE user_id = $1 AND is_read = false`,
    [userId]
  );
  return { message: 'All notifications marked as read' };
};

const clearAll = async (userId) => {
  await pool.query(`DELETE FROM in_app_notifications WHERE user_id = $1`, [userId]);
  return { message: 'All notifications cleared' };
};

module.exports = {
  createNotification,
  listNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
  clearAll
};
