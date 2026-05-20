const { Pool } = require('pg');
const { buildDatabasePoolConfig } = require('./dbPool');

let pool = null;
let poolMeta = null;

const createPool = () => {
  const built = buildDatabasePoolConfig();
  if (!built) {
    console.log('⚠ DATABASE_URL not set, using in-memory fallback');
    return null;
  }

  poolMeta = built;
  console.log(
    `✓ Database pool: ssl=${built.useSsl ? 'on' : 'off'}, host=${built.host}, DATABASE_SSL=${process.env.DATABASE_SSL || '(unset)'}`
  );

  return new Pool(built.config);
};

pool = createPool();

const initDatabase = async () => {
  if (!pool) {
    console.log('⚠ Database not configured, skipping table initialization');
    return;
  }
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'student',
        totp_secret VARCHAR(255),
        is_verified BOOLEAN DEFAULT false,
        is_active BOOLEAN DEFAULT true,
        batch_id UUID,
        last_activity TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS batches (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        trainer_id UUID REFERENCES users(id),
        start_balance DECIMAL(15,2) DEFAULT 1000000,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS wallets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        balance DECIMAL(15,2) DEFAULT 1000000,
        total_invested DECIMAL(15,2) DEFAULT 0,
        total_profit DECIMAL(15,2) DEFAULT 0,
        last_updated TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS wallet_transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(20) NOT NULL,
        amount DECIMAL(15,2) NOT NULL,
        balance_after DECIMAL(15,2) NOT NULL,
        description VARCHAR(255),
        order_id UUID,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        symbol VARCHAR(20) NOT NULL,
        exchange VARCHAR(10) DEFAULT 'NSE',
        qty INTEGER NOT NULL,
        order_type VARCHAR(20) NOT NULL,
        order_mode VARCHAR(20) DEFAULT 'market',
        price DECIMAL(10,2),
        status VARCHAR(20) DEFAULT 'pending',
        executed_price DECIMAL(10,2),
        created_at TIMESTAMP DEFAULT NOW(),
        executed_at TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS holdings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        symbol VARCHAR(20) NOT NULL,
        qty INTEGER NOT NULL,
        avg_buy_price DECIMAL(10,2) NOT NULL,
        last_updated TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, symbol)
      );

      CREATE TABLE IF NOT EXISTS trade_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        order_id UUID REFERENCES orders(id),
        symbol VARCHAR(20) NOT NULL,
        qty INTEGER NOT NULL,
        trade_price DECIMAL(10,2) NOT NULL,
        trade_type VARCHAR(10) NOT NULL,
        pnl DECIMAL(15,2) DEFAULT 0,
        timestamp TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS watchlists (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS watchlist_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        watchlist_id UUID REFERENCES watchlists(id) ON DELETE CASCADE,
        symbol VARCHAR(20) NOT NULL,
        added_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(watchlist_id, symbol)
      );

      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(500) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        family_id UUID,
        is_revoked BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW()
      );

      ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS family_id UUID;
      ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS is_revoked BOOLEAN DEFAULT false;

      CREATE TABLE IF NOT EXISTS user_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        device_info VARCHAR(255),
        browser VARCHAR(100),
        ip_address VARCHAR(45),
        last_active TIMESTAMP DEFAULT NOW(),
        is_current BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS otp_verification (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) NOT NULL,
        otp VARCHAR(10) NOT NULL,
        purpose VARCHAR(50) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        endpoint TEXT NOT NULL,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
      CREATE INDEX IF NOT EXISTS idx_holdings_user ON holdings(user_id);
      CREATE INDEX IF NOT EXISTS idx_trade_history_user ON trade_history(user_id);
      CREATE INDEX IF NOT EXISTS idx_watchlist_user ON watchlists(user_id);
      CREATE INDEX IF NOT EXISTS idx_wallet_txn_user ON wallet_transactions(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family ON refresh_tokens(family_id);

      CREATE OR REPLACE FUNCTION prevent_trade_history_modification()
      RETURNS TRIGGER AS $func$
      BEGIN
        RAISE EXCEPTION 'trade_history records are immutable';
      END;
      $func$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trade_history_no_update ON trade_history;
      DROP TRIGGER IF EXISTS trade_history_no_delete ON trade_history;

      CREATE TRIGGER trade_history_no_update
        BEFORE UPDATE ON trade_history
        FOR EACH ROW EXECUTE PROCEDURE prevent_trade_history_modification();

      CREATE TRIGGER trade_history_no_delete
        BEFORE DELETE ON trade_history
        FOR EACH ROW EXECUTE PROCEDURE prevent_trade_history_modification();
    `);
    console.log('✓ Database tables initialized');
  } finally {
    client.release();
  }
};

module.exports = { pool, initDatabase };