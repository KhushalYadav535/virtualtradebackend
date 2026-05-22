const { pool } = require('../config/database');
const { runScreener } = require('./stockScreener');
const { createNotification } = require('./notifications');

const ensureScanAlertTables = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS scan_alert_subscriptions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      scan_id UUID REFERENCES saved_scans(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      filters JSONB NOT NULL DEFAULT '{}'::jsonb,
      last_match_count INTEGER DEFAULT 0,
      enabled BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_scan_alerts_user ON scan_alert_subscriptions(user_id);
  `);
};

const subscribeScanAlert = async (userId, { scanId, name, filters }) => {
  await ensureScanAlertTables();
  const res = await pool.query(
    `INSERT INTO scan_alert_subscriptions (user_id, scan_id, name, filters)
     VALUES ($1, $2, $3, $4::jsonb) RETURNING *`,
    [userId, scanId || null, name, JSON.stringify(filters || {})]
  );
  return res.rows[0];
};

const listScanAlerts = async (userId) => {
  await ensureScanAlertTables();
  const res = await pool.query(
    `SELECT id, scan_id, name, filters, last_match_count, enabled, created_at
     FROM scan_alert_subscriptions WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  return res.rows;
};

const deleteScanAlert = async (userId, id) => {
  await pool.query(`DELETE FROM scan_alert_subscriptions WHERE id = $1 AND user_id = $2`, [id, userId]);
};

const runScanAlertCron = async () => {
  await ensureScanAlertTables();
  const subs = await pool.query(
    `SELECT * FROM scan_alert_subscriptions WHERE enabled = true LIMIT 200`
  );
  for (const sub of subs.rows) {
    try {
      const filters = typeof sub.filters === 'object' ? sub.filters : JSON.parse(sub.filters || '{}');
      const result = await runScreener(filters);
      const count = result.count || 0;
      const prev = sub.last_match_count || 0;
      if (count > 0 && count !== prev) {
        await createNotification(sub.user_id, {
          type: 'screener',
          title: `Scan alert: ${sub.name}`,
          body: `${count} stock(s) match your saved scan (was ${prev}).`,
          metadata: { scanAlertId: sub.id, count }
        });
      }
      await pool.query(
        `UPDATE scan_alert_subscriptions SET last_match_count = $1 WHERE id = $2`,
        [count, sub.id]
      );
    } catch (err) {
      console.error('Scan alert error:', sub.id, err.message);
    }
  }
};

module.exports = {
  ensureScanAlertTables,
  subscribeScanAlert,
  listScanAlerts,
  deleteScanAlert,
  runScanAlertCron
};
