const { pool } = require('../config/database');
const { SECTOR_MAP } = require('../data/stockMetadata');

const LOT_SIZES = {
  RELIANCE: 250, TCS: 175, HDFCBANK: 400, INFY: 400, ICICIBANK: 700,
  SBIN: 1500, BHARTIARTL: 950, KOTAKBANK: 400, LT: 300, MARUTI: 50,
  BAJFINANCE: 125, ASIANPAINT: 200, TITAN: 175
};
const getLotSize = (symbol) => {
  const sym = String(symbol || '').toUpperCase();
  if (sym.startsWith('NIFTY')) return 50;
  if (sym.startsWith('BANKNIFTY')) return 15;
  return LOT_SIZES[sym] || 1;
};
const { ACHIEVEMENT_DEFINITIONS } = require('../data/achievementDefinitions');

const POINTS_PER_LEVEL = 100;
const REFERRAL_BONUS_REFERRER = 500;
const REFERRAL_BONUS_REFERRED = 200;

const skillTierFromLevel = (level) => {
  if (level >= 6) return 'Advanced';
  if (level >= 3) return 'Intermediate';
  return 'Beginner';
};

const periodKeys = () => {
  const now = new Date();
  const daily = now.toISOString().slice(0, 10);
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  const weekly = `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
  return { daily, weekly };
};

const ensureAchievementRows = async () => {
  for (const a of ACHIEVEMENT_DEFINITIONS) {
    await pool.query(
      `INSERT INTO achievements (id, title, description, icon, points)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET title = $2, description = $3, icon = $4, points = $5`,
      [a.id, a.title, a.description, a.icon, a.points]
    );
  }
};

const loadUserStats = async (userId) => {
  const [tradesRes, ordersRes, holdingsRes, walletRes, referralRes, bonusRes] = await Promise.all([
    pool.query(
      `SELECT th.*, o.product_type, o.order_mode
       FROM trade_history th
       LEFT JOIN orders o ON o.id = th.order_id
       WHERE th.user_id = $1`,
      [userId]
    ),
    pool.query(
      `SELECT DISTINCT order_mode FROM orders WHERE user_id = $1 AND status = 'executed'`,
      [userId]
    ),
    pool.query(`SELECT symbol, qty, avg_buy_price, last_updated FROM holdings WHERE user_id = $1`, [userId]),
    pool.query(`SELECT balance FROM wallets WHERE user_id = $1`, [userId]),
    pool.query(`SELECT COUNT(*)::int AS cnt FROM referrals WHERE referrer_id = $1`, [userId]),
    pool.query(`SELECT COALESCE(bonus_points, 0)::int AS bonus FROM users WHERE id = $1`, [userId])
  ]);

  const trades = tradesRes.rows;
  const tradeCount = trades.length;
  let profitCount = 0;
  let totalLots = 0;
  let lotSizedTrades = 0;
  let firstLotDone = false;
  const symbols = new Set();
  const sectors = new Set();
  const orderModes = new Set(ordersRes.rows.map((r) => r.order_mode).filter(Boolean));

  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  let todayTradeCount = 0;
  let todayLimitOrders = 0;
  let todaySlOrders = 0;
  let todayLotMultiple = 0;
  let todayMaxLots = 0;
  let todayProfit = 0;
  const todaySectors = new Set();
  let weekPnl = 0;
  let weekLots = 0;
  const tradingDaysWeek = new Set();
  const tradingDaysMonth = new Set();
  let weekTradeCount = 0;

  for (const t of trades) {
    const sym = t.symbol;
    symbols.add(sym);
    if (SECTOR_MAP[sym]) sectors.add(SECTOR_MAP[sym]);
    const lotSize = getLotSize(sym);
    const lots = lotSize > 0 ? t.qty / lotSize : t.qty;
    totalLots += lots;
    if (lots >= 1 && (t.product_type === 'MIS' || t.product_type === 'NRML' || t.qty % lotSize === 0)) {
      lotSizedTrades += 1;
      if (lots >= 1) firstLotDone = true;
    }
    if (parseFloat(t.pnl) > 0) profitCount += 1;

    const day = String(t.timestamp).slice(0, 10);
    tradingDaysMonth.add(day);
    if (day >= weekAgo) {
      tradingDaysWeek.add(day);
      weekTradeCount += 1;
      weekPnl += parseFloat(t.pnl) || 0;
      weekLots += lots;
    }
    if (day === today) {
      todayTradeCount += 1;
      if (['limit', 'sl', 'bo'].includes(t.order_mode)) todayLimitOrders += 1;
      if (['sl', 'sl-m'].includes(t.order_mode)) todaySlOrders += 1;
      if (t.qty % lotSize === 0 && lotSize > 1) todayLotMultiple += 1;
      if (lots > todayMaxLots) todayMaxLots = lots;
      if (t.trade_type === 'SELL' && parseFloat(t.pnl) > 0) todayProfit += 1;
      if (SECTOR_MAP[sym]) todaySectors.add(SECTOR_MAP[sym]);
    }
  }

  const weekStreakDays = tradingDaysWeek.size;

  const balance = parseFloat(walletRes.rows[0]?.balance) || 1000000;
  const startBalance = 1000000;
  const returnPct = ((balance - startBalance) / startBalance) * 100;

  let longHold = false;
  const weekMs = 7 * 86400000;
  for (const h of holdingsRes.rows) {
    if (h.last_updated && Date.now() - new Date(h.last_updated).getTime() >= weekMs) longHold = true;
  }

  return {
    tradeCount,
    profitCount,
    totalLots: Math.floor(totalLots),
    lotSizedTrades,
    firstLotDone,
    uniqueHoldings: holdingsRes.rows.length,
    uniqueSymbols: symbols.size,
    uniqueSectors: sectors.size,
    orderModes,
    returnPct,
    referralCount: referralRes.rows[0]?.cnt || 0,
    bonusPoints: bonusRes.rows[0]?.bonus || 0,
    todayTradeCount,
    todayLimitOrders,
    todaySlOrders,
    todayLotMultiple,
    todayMaxLots: Math.floor(todayMaxLots),
    todayProfit,
    todaySectorCount: todaySectors.size,
    weekPnl,
    weekLots: Math.floor(weekLots),
    weekStreakDays,
    weekTradeCount,
    monthTradingDays: tradingDaysMonth.size,
    longHold
  };
};

const achievementProgress = (id, stats) => {
  const map = {
    first_trade: { progress: Math.min(1, stats.tradeCount), max: 1 },
    first_lot_trade: { progress: stats.firstLotDone ? 1 : 0, max: 1 },
    trades_10: { progress: Math.min(10, stats.tradeCount), max: 10 },
    trades_100: { progress: Math.min(100, stats.tradeCount), max: 100 },
    lots_100: { progress: Math.min(100, stats.totalLots), max: 100 },
    first_profit: { progress: Math.min(1, stats.profitCount), max: 1 },
    return_1pct: { progress: Math.min(1, stats.returnPct >= 1 ? 1 : 0), max: 1 },
    return_10pct: { progress: Math.min(1, stats.returnPct >= 10 ? 1 : 0), max: 1 },
    all_order_types: {
      progress: ['market', 'limit', 'sl', 'sl-m'].filter((m) => stats.orderModes.has(m)).length,
      max: 3
    },
    lot_master: { progress: Math.min(25, stats.lotSizedTrades), max: 25 },
    diversity: { progress: Math.min(5, stats.uniqueHoldings), max: 5 },
    streak_week: { progress: Math.min(5, stats.weekStreakDays), max: 5 },
    streak_month: { progress: Math.min(15, stats.monthTradingDays), max: 15 },
    diamond_hands: { progress: stats.longHold ? 1 : 0, max: 1 },
    referral_hero: { progress: Math.min(1, stats.referralCount), max: 1 }
  };
  return map[id] || { progress: 0, max: 1 };
};

const shouldUnlock = (id, stats) => {
  const { progress, max } = achievementProgress(id, stats);
  return progress >= max;
};

const buildDailyChallenges = (stats) => [
  {
    id: 'daily_limit',
    title: 'Place a limit order',
    reward: 40,
    progress: Math.min(1, stats.todayLimitOrders),
    target: 1
  },
  {
    id: 'daily_sl',
    title: 'Use a stop-loss order',
    reward: 50,
    progress: Math.min(1, stats.todaySlOrders),
    target: 1
  },
  {
    id: 'daily_lot_multiple',
    title: 'Trade in lot multiples',
    reward: 60,
    progress: Math.min(1, stats.todayLotMultiple),
    target: 1
  },
  {
    id: 'daily_5_lot',
    title: 'Execute a 5-lot order',
    reward: 80,
    progress: Math.min(1, stats.todayMaxLots >= 5 ? 1 : 0),
    target: 1
  },
  {
    id: 'daily_profit',
    title: 'Make a profitable trade',
    reward: 70,
    progress: Math.min(1, stats.todayProfit),
    target: 1
  },
  {
    id: 'daily_3_sectors',
    title: 'Trade in 3 sectors today',
    reward: 90,
    progress: Math.min(3, stats.todaySectorCount),
    target: 3
  }
].map((c) => ({ ...c, completed: c.progress >= c.target }));

const buildWeeklyChallenges = (stats) => [
  {
    id: 'weekly_streak',
    title: 'Trade 5 days this week',
    reward: 200,
    progress: Math.min(5, stats.weekStreakDays),
    target: 5
  },
  {
    id: 'weekly_profit',
    title: 'Earn ₹5,000 virtual profit',
    reward: 300,
    progress: Math.min(5000, Math.max(0, Math.round(stats.weekPnl))),
    target: 5000
  },
  {
    id: 'weekly_lots',
    title: 'Trade 20 lots this week',
    reward: 250,
    progress: Math.min(20, stats.weekLots),
    target: 20
  },
  {
    id: 'weekly_trades',
    title: 'Complete 10 trades this week',
    reward: 150,
    progress: Math.min(10, stats.weekTradeCount),
    target: 10
  }
].map((c) => ({ ...c, completed: c.progress >= c.target }));

const claimCompletedChallenges = async (userId, challenges, periodKey) => {
  let added = 0;
  for (const c of challenges) {
    if (!c.completed) continue;
    const key = `${periodKey}:${c.id}`;
    const exists = await pool.query(
      `SELECT 1 FROM user_challenge_claims WHERE user_id = $1 AND challenge_key = $2`,
      [userId, key]
    );
    if (exists.rows.length) continue;
    await pool.query(
      `INSERT INTO user_challenge_claims (user_id, challenge_key, points) VALUES ($1, $2, $3)`,
      [userId, key, c.reward]
    );
    await pool.query(
      `UPDATE users SET bonus_points = COALESCE(bonus_points, 0) + $2 WHERE id = $1`,
      [userId, c.reward]
    );
    added += c.reward;
  }
  return added;
};

const checkAndAwardAchievements = async (userId) => {
  await ensureAchievementRows();
  const stats = await loadUserStats(userId);
  const unlockedRes = await pool.query(
    `SELECT achievement_id FROM user_achievements WHERE user_id = $1`,
    [userId]
  );
  const unlocked = new Set(unlockedRes.rows.map((r) => r.achievement_id));
  const newUnlocks = [];

  for (const def of ACHIEVEMENT_DEFINITIONS) {
    if (unlocked.has(def.id)) continue;
    if (shouldUnlock(def.id, stats)) {
      await pool.query(
        `INSERT INTO user_achievements (user_id, achievement_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [userId, def.id]
      );
      newUnlocks.push(def.id);
    }
  }

  if (newUnlocks.length) {
    const acvRes = await pool.query(`SELECT * FROM achievements WHERE id = ANY($1)`, [newUnlocks]);
    const { createNotification } = require('./notifications');
    for (const acv of acvRes.rows) {
      createNotification(userId, {
        type: 'achievement',
        title: `Achievement unlocked: ${acv.title}`,
        body: acv.description,
        metadata: { achievementId: acv.id, points: acv.points }
      }).catch(() => {});
    }
  }

  return newUnlocks;
};

const getReferralCode = async (userId) => {
  const res = await pool.query(`SELECT referral_code, name FROM users WHERE id = $1`, [userId]);
  if (!res.rows.length) return null;
  let code = res.rows[0].referral_code;
  if (!code) {
    code = `VT${String(userId).replace(/-/g, '').slice(0, 6).toUpperCase()}`;
    await pool.query(`UPDATE users SET referral_code = $1 WHERE id = $2`, [code, userId]);
  }
  const countRes = await pool.query(`SELECT COUNT(*)::int AS cnt FROM referrals WHERE referrer_id = $1`, [userId]);
  return {
    code,
    referrals: countRes.rows[0]?.cnt || 0,
    pointsPerReferral: REFERRAL_BONUS_REFERRER,
    shareMessage: `Join me on VirtualTrade (paper trading)! Use code ${code} when you sign up.`
  };
};

const applyReferralCode = async (referredUserId, code) => {
  if (!code) return null;
  const normalized = String(code).trim().toUpperCase();
  const referrerRes = await pool.query(
    `SELECT id FROM users WHERE UPPER(referral_code) = $1 AND id != $2`,
    [normalized, referredUserId]
  );
  if (!referrerRes.rows.length) return { applied: false, message: 'Invalid referral code' };

  const referrerId = referrerRes.rows[0].id;
  const existing = await pool.query(`SELECT 1 FROM referrals WHERE referred_id = $1`, [referredUserId]);
  if (existing.rows.length) return { applied: false, message: 'Referral already applied' };

  await pool.query(`INSERT INTO referrals (referrer_id, referred_id) VALUES ($1, $2)`, [
    referrerId,
    referredUserId
  ]);
  await pool.query(`UPDATE users SET bonus_points = COALESCE(bonus_points, 0) + $2 WHERE id = $1`, [
    referrerId,
    REFERRAL_BONUS_REFERRER
  ]);
  await pool.query(`UPDATE users SET bonus_points = COALESCE(bonus_points, 0) + $2 WHERE id = $1`, [
    referredUserId,
    REFERRAL_BONUS_REFERRED
  ]);

  await checkAndAwardAchievements(referrerId);

  return { applied: true, referrerId, bonusReferrer: REFERRAL_BONUS_REFERRER, bonusReferred: REFERRAL_BONUS_REFERRED };
};

const getUserGamification = async (userId) => {
  await ensureAchievementRows();
  await checkAndAwardAchievements(userId);

  const stats = await loadUserStats(userId);
  const { daily, weekly } = periodKeys();

  const dailyChallenges = buildDailyChallenges(stats);
  const weeklyChallenges = buildWeeklyChallenges(stats);
  const challengeBonus =
    (await claimCompletedChallenges(userId, dailyChallenges, daily)) +
    (await claimCompletedChallenges(userId, weeklyChallenges, weekly));

  if (challengeBonus) stats.bonusPoints += challengeBonus;

  const result = await pool.query(
    `SELECT a.*,
            CASE WHEN ua.id IS NOT NULL THEN true ELSE false END AS is_unlocked,
            ua.unlocked_at
     FROM achievements a
     LEFT JOIN user_achievements ua ON a.id = ua.achievement_id AND ua.user_id = $1
     ORDER BY a.points ASC`,
    [userId]
  );

  const achievements = result.rows.map((row) => {
    const { progress, max } = achievementProgress(row.id, stats);
    return {
      ...row,
      is_unlocked: row.is_unlocked,
      progress,
      max_progress: max
    };
  });

  const achievementPoints = achievements.reduce(
    (sum, row) => sum + (row.is_unlocked ? row.points : 0),
    0
  );
  const totalPoints = achievementPoints + stats.bonusPoints;
  const level = Math.floor(totalPoints / POINTS_PER_LEVEL) + 1;
  const progressToNextLevel = totalPoints % POINTS_PER_LEVEL;
  const nextLevelPoints = level * POINTS_PER_LEVEL;

  const referral = await getReferralCode(userId);

  return {
    achievements,
    stats: {
      totalPoints,
      achievementPoints,
      bonusPoints: stats.bonusPoints,
      level,
      skillTier: skillTierFromLevel(level),
      nextLevelPoints,
      progressToNextLevel,
      progressPercent: Math.round((progressToNextLevel / POINTS_PER_LEVEL) * 100),
      tradeCount: stats.tradeCount,
      totalLots: stats.totalLots,
      unlockedCount: achievements.filter((a) => a.is_unlocked).length,
      totalAchievements: achievements.length
    },
    dailyChallenges,
    weeklyChallenges,
    referral,
    challengeBonusAwarded: challengeBonus
  };
};

module.exports = {
  ensureAchievementRows,
  checkAndAwardAchievements,
  getUserGamification,
  getUserAchievements: getUserGamification,
  getReferralCode,
  applyReferralCode,
  loadUserStats
};
