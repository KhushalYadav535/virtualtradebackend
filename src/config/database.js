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

      ALTER TABLE orders ADD COLUMN IF NOT EXISTS product_type VARCHAR(10) DEFAULT 'CNC';
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS trigger_price DECIMAL(10,2);
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS target_price DECIMAL(10,2);
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS stoploss_price DECIMAL(10,2);
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS validity VARCHAR(10) DEFAULT 'DAY';
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS parent_order_id UUID REFERENCES orders(id);

      CREATE TABLE IF NOT EXISTS holdings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        symbol VARCHAR(20) NOT NULL,
        qty INTEGER NOT NULL,
        avg_buy_price DECIMAL(10,2) NOT NULL,
        last_updated TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, symbol)
      );

      CREATE TABLE IF NOT EXISTS intraday_positions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        symbol VARCHAR(20) NOT NULL,
        exchange VARCHAR(10) DEFAULT 'NSE',
        qty INTEGER NOT NULL,
        avg_buy_price DECIMAL(10,2) NOT NULL,
        margin_blocked DECIMAL(15,2) NOT NULL DEFAULT 0,
        opened_at TIMESTAMP DEFAULT NOW(),
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
      ALTER TABLE refresh_tokens ALTER COLUMN token TYPE TEXT;

      CREATE TABLE IF NOT EXISTS user_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        device_info VARCHAR(255),
        browser VARCHAR(255),
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

      CREATE TABLE IF NOT EXISTS achievements (
        id VARCHAR(50) PRIMARY KEY,
        title VARCHAR(100) NOT NULL,
        description TEXT NOT NULL,
        icon VARCHAR(50) NOT NULL,
        points INTEGER DEFAULT 10
      );

      CREATE TABLE IF NOT EXISTS user_achievements (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        achievement_id VARCHAR(50) REFERENCES achievements(id) ON DELETE CASCADE,
        unlocked_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, achievement_id)
      );

      INSERT INTO achievements (id, title, description, icon, points) VALUES
        ('first_trade', 'First Trade', 'Placed your very first order', 'rocket', 50),
        ('first_profit', 'First Profit', 'Closed a trade with positive P&L', 'trending-up', 100),
        ('lot_master', 'Lot Master', 'Traded a total of 100 lots', 'layers', 150),
        ('diversity', 'Diverse Portfolio', 'Held 5 different stocks at once', 'pie-chart', 75),
        ('diamond_hands', 'Diamond Hands', 'Held a position for more than 7 days', 'diamond', 200)
      ON CONFLICT (id) DO NOTHING;

      CREATE TABLE IF NOT EXISTS price_alerts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        symbol VARCHAR(20) NOT NULL,
        exchange VARCHAR(10) DEFAULT 'NSE',
        condition_type VARCHAR(20) NOT NULL,
        target_price DECIMAL(12,2),
        target_pct DECIMAL(8,2),
        baseline_price DECIMAL(12,2),
        status VARCHAR(20) DEFAULT 'active',
        triggered_at TIMESTAMP,
        triggered_price DECIMAL(12,2),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS in_app_notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        body TEXT,
        metadata JSONB DEFAULT '{}',
        is_read BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_price_alerts_user ON price_alerts(user_id);
      CREATE INDEX IF NOT EXISTS idx_price_alerts_status ON price_alerts(status);
      CREATE INDEX IF NOT EXISTS idx_notifications_user ON in_app_notifications(user_id);

      CREATE TABLE IF NOT EXISTS symbol_lot_cache (
        symbol VARCHAR(20) PRIMARY KEY,
        lot_size INTEGER NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS lot_change_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        symbol VARCHAR(20) NOT NULL,
        old_lot_size INTEGER NOT NULL,
        new_lot_size INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );

      ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(15) UNIQUE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth DATE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_prefs JSONB DEFAULT '{"orders":true,"alerts":true,"achievements":true,"marketing":false}'::jsonb;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS locale VARCHAR(10) DEFAULT 'en';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS trading_prefs JSONB DEFAULT '{}'::jsonb;

      ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_amo BOOLEAN DEFAULT false;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS disclosed_qty INTEGER;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS reject_reason VARCHAR(255);

      ALTER TABLE price_alerts ADD COLUMN IF NOT EXISTS alert_kind VARCHAR(20) DEFAULT 'price';
      ALTER TABLE price_alerts ADD COLUMN IF NOT EXISTS min_volume BIGINT;

      ALTER TABLE watchlist_items ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
      ALTER TABLE watchlists ADD COLUMN IF NOT EXISTS share_token VARCHAR(36) UNIQUE;

      ALTER TABLE otp_verification ADD COLUMN IF NOT EXISTS phone VARCHAR(15);

      CREATE TABLE IF NOT EXISTS user_recent_searches (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        query VARCHAR(100) NOT NULL,
        symbol VARCHAR(20),
        exchange VARCHAR(10) DEFAULT 'NSE',
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_recent_search_user ON user_recent_searches(user_id);

      ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code VARCHAR(12) UNIQUE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS bonus_points INTEGER DEFAULT 0;

      CREATE TABLE IF NOT EXISTS referrals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        referrer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        referred_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        points_awarded INTEGER DEFAULT 500,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id);

      CREATE TABLE IF NOT EXISTS user_challenge_claims (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        challenge_key VARCHAR(80) NOT NULL,
        points INTEGER DEFAULT 0,
        claimed_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, challenge_key)
      );

      CREATE TABLE IF NOT EXISTS order_baskets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL DEFAULT 'My Basket',
        share_token VARCHAR(32) UNIQUE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS order_basket_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        basket_id UUID NOT NULL REFERENCES order_baskets(id) ON DELETE CASCADE,
        symbol VARCHAR(20) NOT NULL,
        lots INTEGER NOT NULL DEFAULT 1,
        qty INTEGER,
        order_type VARCHAR(10) DEFAULT 'BUY',
        product_type VARCHAR(10) DEFAULT 'MIS',
        order_mode VARCHAR(20) DEFAULT 'market',
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_order_baskets_user ON order_baskets(user_id);
      CREATE INDEX IF NOT EXISTS idx_basket_items_basket ON order_basket_items(basket_id);

      CREATE TABLE IF NOT EXISTS saved_scans (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        filters JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_saved_scans_user ON saved_scans(user_id);

      CREATE TABLE IF NOT EXISTS user_feedback (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        subject VARCHAR(200) NOT NULL,
        message TEXT NOT NULL,
        category VARCHAR(50) DEFAULT 'general',
        status VARCHAR(20) DEFAULT 'open',
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_user_feedback_user ON user_feedback(user_id);

      CREATE TABLE IF NOT EXISTS offline_orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        symbol VARCHAR(20) NOT NULL,
        exchange VARCHAR(10) DEFAULT 'NSE',
        qty INTEGER NOT NULL,
        order_type VARCHAR(20) NOT NULL,
        order_mode VARCHAR(20) DEFAULT 'market',
        price DECIMAL(10,2),
        product_type VARCHAR(10) DEFAULT 'CNC',
        trigger_price DECIMAL(10,2),
        queued_at TIMESTAMP DEFAULT NOW(),
        synced_at TIMESTAMP,
        status VARCHAR(20) DEFAULT 'queued',
        error_message TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_offline_orders_user ON offline_orders(user_id);

      ALTER TABLE users ADD COLUMN IF NOT EXISTS biometric_enabled BOOLEAN DEFAULT false;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS order_pin_hash VARCHAR(255);

      CREATE TABLE IF NOT EXISTS app_settings (
        key VARCHAR(50) PRIMARY KEY,
        value JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_at TIMESTAMP DEFAULT NOW()
      );

      INSERT INTO app_settings (key, value) VALUES (
        'feature_flags',
        '{"maintenanceMode":false,"allowNewRegistrations":true,"optionsTradingEnabled":true,"misTradingEnabled":true,"showLeaderboard":true,"basketOrdersEnabled":true}'::jsonb
      ) ON CONFLICT (key) DO NOTHING;

      CREATE TABLE IF NOT EXISTS portfolios (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        starting_capital DECIMAL(15,2) DEFAULT 100000,
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_portfolios_user ON portfolios(user_id);

      ALTER TABLE holdings ADD COLUMN IF NOT EXISTS portfolio_id UUID REFERENCES portfolios(id) ON DELETE SET NULL;
      ALTER TABLE intraday_positions ADD COLUMN IF NOT EXISTS portfolio_id UUID REFERENCES portfolios(id) ON DELETE SET NULL;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS portfolio_id UUID REFERENCES portfolios(id) ON DELETE SET NULL;
      ALTER TABLE trade_history ADD COLUMN IF NOT EXISTS portfolio_id UUID REFERENCES portfolios(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS idx_holdings_portfolio ON holdings(portfolio_id);
      CREATE INDEX IF NOT EXISTS idx_positions_portfolio ON intraday_positions(portfolio_id);
      CREATE INDEX IF NOT EXISTS idx_orders_portfolio ON orders(portfolio_id);

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
    await client.query(`
      ALTER TABLE user_sessions ALTER COLUMN browser TYPE VARCHAR(255);
    `).catch(() => {});
    console.log('✓ Database tables initialized');
  } finally {
    client.release();
  }
};

module.exports = { pool, initDatabase };