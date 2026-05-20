/**
 * Create the first admin user (or reset password if email exists).
 * Usage: node scripts/seed-admin.js
 * Env: DATABASE_URL, optional ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL || 'admin@virtualtrade.com';
  const password = process.env.ADMIN_PASSWORD || 'Admin123!';
  const name = process.env.ADMIN_NAME || 'Platform Admin';

  const hash = await bcrypt.hash(password, 12);
  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);

  if (existing.rows.length > 0) {
    await pool.query(
      `UPDATE users SET password_hash = $1, role = 'admin', is_verified = true, is_active = true WHERE email = $2`,
      [hash, email]
    );
    console.log(`Updated admin: ${email}`);
  } else {
    const user = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, is_verified, is_active)
       VALUES ($1, $2, $3, 'admin', true, true) RETURNING id`,
      [name, email, hash]
    );
    const userId = user.rows[0].id;
    await pool.query(
      `INSERT INTO wallets (user_id, balance, total_invested, total_profit)
       VALUES ($1, 1000000, 0, 0) ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    );
    console.log(`Created admin: ${email}`);
  }

  console.log('Default password (change after login):', password);
  await pool.end();
}

seedAdmin().catch((err) => {
  console.error(err);
  process.exit(1);
});
