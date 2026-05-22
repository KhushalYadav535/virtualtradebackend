const { pool } = require('../config/database');

const ensureAdminExtendedTables = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS support_tickets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subject VARCHAR(200) NOT NULL,
      body TEXT NOT NULL,
      status VARCHAR(20) DEFAULT 'open',
      priority VARCHAR(10) DEFAULT 'normal',
      admin_reply TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON support_tickets(user_id);
    CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);

    CREATE TABLE IF NOT EXISTS revenue_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      event_type VARCHAR(50) NOT NULL,
      amount DECIMAL(12,2) DEFAULT 0,
      meta JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP DEFAULT NOW()
    );

    ALTER TABLE users ADD COLUMN IF NOT EXISTS user_segment VARCHAR(30) DEFAULT 'beginner';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS ab_variant VARCHAR(20) DEFAULT 'control';
  `);
};

const createTicket = async (userId, subject, body) => {
  await ensureAdminExtendedTables();
  const res = await pool.query(
    `INSERT INTO support_tickets (user_id, subject, body) VALUES ($1, $2, $3) RETURNING *`,
    [userId, subject, body]
  );
  return res.rows[0];
};

const listUserTickets = async (userId) => {
  await ensureAdminExtendedTables();
  const res = await pool.query(
    `SELECT * FROM support_tickets WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [userId]
  );
  return res.rows;
};

const listAllTickets = async (status = 'all') => {
  await ensureAdminExtendedTables();
  let q = `SELECT t.*, u.name AS user_name, u.email AS user_email
           FROM support_tickets t JOIN users u ON u.id = t.user_id`;
  const params = [];
  if (status && status !== 'all') {
    params.push(status);
    q += ` WHERE t.status = $${params.length}`;
  }
  q += ' ORDER BY t.created_at DESC LIMIT 100';
  const res = await pool.query(q, params);
  return res.rows;
};

const replyTicket = async (ticketId, adminReply, status = 'resolved') => {
  const res = await pool.query(
    `UPDATE support_tickets SET admin_reply = $1, status = $2, updated_at = NOW() WHERE id = $3 RETURNING *`,
    [adminReply, status, ticketId]
  );
  return res.rows[0];
};

const getRevenueSummary = async () => {
  await ensureAdminExtendedTables();
  const res = await pool.query(
    `SELECT
       COALESCE(SUM(amount) FILTER (WHERE event_type = 'subscription'), 0)::numeric AS subscriptions,
       COALESCE(SUM(amount) FILTER (WHERE event_type = 'premium_feature'), 0)::numeric AS premium,
       COALESCE(SUM(amount), 0)::numeric AS total,
       COUNT(DISTINCT user_id)::int AS paying_users
     FROM revenue_events
     WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'`
  );
  return res.rows[0] || { subscriptions: 0, premium: 0, total: 0, paying_users: 0 };
};

const setUserSegment = async (userId, segment) => {
  const allowed = ['beginner', 'intermediate', 'advanced', 'inactive'];
  if (!allowed.includes(segment)) throw { status: 400, message: 'Invalid segment' };
  await pool.query(`UPDATE users SET user_segment = $1 WHERE id = $2 AND role = 'student'`, [segment, userId]);
};

const getSegmentationStats = async () => {
  const res = await pool.query(
    `SELECT COALESCE(user_segment, 'beginner') AS segment, COUNT(*)::int AS count
     FROM users WHERE role = 'student' GROUP BY user_segment ORDER BY count DESC`
  );
  return res.rows;
};

const getAbTestStats = async () => {
  const res = await pool.query(
    `SELECT COALESCE(ab_variant, 'control') AS variant, COUNT(*)::int AS users
     FROM users WHERE role = 'student' GROUP BY ab_variant`
  );
  const flags = await pool.query(`SELECT value FROM app_settings WHERE key = 'ab_tests'`);
  return { variants: res.rows, config: flags.rows[0]?.value || { enabled: false, variants: ['control', 'variant_a'] } };
};

const updateAbTests = async (config) => {
  await pool.query(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ('ab_tests', $1::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [JSON.stringify(config)]
  );
};

module.exports = {
  ensureAdminExtendedTables,
  createTicket,
  listUserTickets,
  listAllTickets,
  replyTicket,
  getRevenueSummary,
  setUserSegment,
  getSegmentationStats,
  getAbTestStats,
  updateAbTests
};
