const crypto = require('crypto');
const { pool } = require('../config/database');
const { createNotification } = require('./notifications');

const hashFingerprint = (raw) =>
  crypto.createHash('sha256').update(String(raw || 'unknown')).digest('hex').slice(0, 64);

const ensureSecurityTables = async () => {
  if (!pool) return;
  await pool.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`).catch(() => {});
  await pool.query(`
    CREATE TABLE IF NOT EXISTS login_attempts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255),
      ip_address VARCHAR(45),
      success BOOLEAN DEFAULT false,
      attempted_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email, attempted_at DESC);

    CREATE TABLE IF NOT EXISTS user_devices (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      fingerprint_hash VARCHAR(64) NOT NULL,
      device_label VARCHAR(255),
      first_seen TIMESTAMP DEFAULT NOW(),
      last_seen TIMESTAMP DEFAULT NOW(),
      is_trusted BOOLEAN DEFAULT false,
      UNIQUE(user_id, fingerprint_hash)
    );
    CREATE INDEX IF NOT EXISTS idx_user_devices_user ON user_devices(user_id);

    ALTER TABLE users ADD COLUMN IF NOT EXISTS user_segment VARCHAR(30) DEFAULT 'beginner';
  `);
};

const recordLoginAttempt = async (email, success, ip = null) => {
  if (!pool) return;
  try {
    await ensureSecurityTables();
  } catch (e) {
    console.warn('recordLoginAttempt ensureSecurityTables:', e.message);
    return;
  }
  await pool.query(
    `INSERT INTO login_attempts (email, ip_address, success) VALUES ($1, $2, $3)`,
    [email?.toLowerCase() || null, ip, !!success]
  );
};

const checkSuspiciousLogin = async (email) => {
  if (!pool) return { failures: 0, suspicious: false };
  try {
    await ensureSecurityTables();
  } catch (e) {
    console.warn('checkSuspiciousLogin ensureSecurityTables:', e.message);
    return { failures: 0, suspicious: false };
  }
  const res = await pool.query(
    `SELECT COUNT(*)::int AS cnt FROM login_attempts
     WHERE email = $1 AND success = false AND attempted_at > NOW() - INTERVAL '15 minutes'`,
    [email?.toLowerCase()]
  );
  const failures = res.rows[0]?.cnt || 0;
  if (failures >= 5) {
    throw { status: 429, message: 'Too many failed login attempts. Try again in 15 minutes.' };
  }
  return { failures, suspicious: failures >= 3 };
};

const registerDevice = async (userId, fingerprint, deviceLabel = 'Unknown device') => {
  if (!fingerprint) return null;
  await ensureSecurityTables();
  const hash = hashFingerprint(fingerprint);
  const existing = await pool.query(
    `SELECT id, is_trusted FROM user_devices WHERE user_id = $1 AND fingerprint_hash = $2`,
    [userId, hash]
  );
  if (existing.rows.length) {
    await pool.query(`UPDATE user_devices SET last_seen = NOW(), device_label = $1 WHERE id = $2`, [
      deviceLabel,
      existing.rows[0].id
    ]);
    return { known: true, trusted: existing.rows[0].is_trusted };
  }
  await pool.query(
    `INSERT INTO user_devices (user_id, fingerprint_hash, device_label) VALUES ($1, $2, $3)`,
    [userId, hash, deviceLabel]
  );
  await createNotification(userId, {
    type: 'security',
    title: 'New device sign-in',
    body: `Signed in from ${deviceLabel}. If this wasn't you, change your password.`,
    metadata: { kind: 'new_device' }
  }).catch(() => {});
  return { known: false, trusted: false };
};

const listDevices = async (userId) => {
  await ensureSecurityTables();
  const res = await pool.query(
    `SELECT id, device_label, first_seen, last_seen, is_trusted
     FROM user_devices WHERE user_id = $1 ORDER BY last_seen DESC`,
    [userId]
  );
  return res.rows;
};

module.exports = {
  ensureSecurityTables,
  hashFingerprint,
  recordLoginAttempt,
  checkSuspiciousLogin,
  registerDevice,
  listDevices
};
