/**
 * Create demo admin, trainer, and student users (or update if emails exist).
 * Usage: node scripts/create-test-users.js
 *
 * Optional env:
 *   TRAINER_EMAIL, TRAINER_PASSWORD, TRAINER_NAME
 *   STUDENT_EMAIL, STUDENT_PASSWORD, STUDENT_NAME
 *   (extra students: STUDENT2_EMAIL, STUDENT3_EMAIL — same STUDENT_PASSWORD)
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const { initDatabase } = require('../src/config/database');

const { buildDatabasePoolConfig } = require('../src/config/dbPool');
const built = buildDatabasePoolConfig();
if (!built) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}
const pool = new Pool(built.config);

const DEFAULT_PASSWORD = process.env.STUDENT_PASSWORD || 'Student123!';

const users = [
  {
    name: process.env.ADMIN_NAME || 'Admin User',
    email: process.env.ADMIN_EMAIL || 'admin@virtualtrade.com',
    password: process.env.ADMIN_PASSWORD || 'Admin123!',
    role: 'admin'
  },
  {
    name: process.env.TRAINER_NAME || 'Trainer Sharma',
    email: process.env.TRAINER_EMAIL || 'trainer@virtualtrade.com',
    password: process.env.TRAINER_PASSWORD || 'Trainer123!',
    role: 'trainer'
  },
  {
    name: process.env.STUDENT_NAME || 'Student Amit',
    email: process.env.STUDENT_EMAIL || 'amit@virtualtrade.com',
    password: DEFAULT_PASSWORD,
    role: 'student'
  },
  {
    name: 'Student Priya',
    email: process.env.STUDENT2_EMAIL || 'priya@virtualtrade.com',
    password: DEFAULT_PASSWORD,
    role: 'student'
  },
  {
    name: 'Student Rahul',
    email: process.env.STUDENT3_EMAIL || 'rahul@virtualtrade.com',
    password: DEFAULT_PASSWORD,
    role: 'student'
  }
];

async function upsertUser(client, user) {
  const passwordHash = await bcrypt.hash(user.password, 12);
  const result = await client.query(
    `INSERT INTO users (name, email, password_hash, role, is_verified, is_active)
     VALUES ($1, $2, $3, $4, true, true)
     ON CONFLICT (email) DO UPDATE SET
       name = EXCLUDED.name,
       password_hash = EXCLUDED.password_hash,
       role = EXCLUDED.role,
       is_verified = true,
       is_active = true
     RETURNING id, name, email, role`,
    [user.name, user.email, passwordHash, user.role]
  );
  const dbUser = result.rows[0];

  await client.query(
    `INSERT INTO wallets (user_id, balance, total_invested, total_profit)
     VALUES ($1, 1000000, 0, 0)
     ON CONFLICT (user_id) DO UPDATE SET
       balance = 1000000,
       total_invested = 0,
       total_profit = 0`,
    [dbUser.id]
  );

  return { ...dbUser, password: user.password };
}

async function linkTrainerBatch(client, trainerId, studentIds) {
  const batchName = process.env.DEMO_BATCH_NAME || 'Demo Batch 2026';
  const startBalance = Number(process.env.DEMO_BATCH_BALANCE) || 1000000;

  const existing = await client.query(
    'SELECT id FROM batches WHERE trainer_id = $1 AND name = $2 LIMIT 1',
    [trainerId, batchName]
  );

  let batchId = existing.rows[0]?.id;
  if (!batchId) {
    const batchResult = await client.query(
      `INSERT INTO batches (name, trainer_id, start_balance)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [batchName, trainerId, startBalance]
    );
    batchId = batchResult.rows[0]?.id;
  }

  if (!batchId) return null;

  for (const studentId of studentIds) {
    await client.query('UPDATE users SET batch_id = $1 WHERE id = $2', [batchId, studentId]);
  }

  return { id: batchId, name: batchName, startBalance };
}

async function createTestUsers() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set in backend/.env');
    process.exit(1);
  }

  console.log('Initializing tables (if needed)...');
  await initDatabase();

  const client = await pool.connect();
  const created = [];

  try {
    await client.query('BEGIN');
    console.log('Creating / updating users...\n');

    for (const user of users) {
      const row = await upsertUser(client, user);
      created.push(row);
      console.log(`✓ ${row.role.toUpperCase()}: ${row.email}`);
      console.log(`  Password: ${user.password}\n`);
    }

    const trainer = created.find((u) => u.role === 'trainer');
    const students = created.filter((u) => u.role === 'student');

    if (trainer && students.length > 0) {
      const batch = await linkTrainerBatch(
        client,
        trainer.id,
        students.map((s) => s.id)
      );
      if (batch) {
        console.log(`✓ Batch "${batch.name}" linked to trainer + ${students.length} students\n`);
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  console.log('========================================');
  console.log('LOGIN CREDENTIALS');
  console.log('========================================\n');
  for (const row of created) {
    console.log(`${row.role.padEnd(8)} ${row.email.padEnd(28)} / ${row.password}`);
  }
  console.log('\n========================================\n');

  await pool.end();
}

createTestUsers().catch((err) => {
  console.error('Script failed:', err.message);
  process.exit(1);
});
