const { pool } = require('../config/database');
const { getStockQuote } = require('./marketData');

const getHoldings = async (userId) => {
  const result = await pool.query(
    'SELECT * FROM holdings WHERE user_id = $1 ORDER BY symbol',
    [userId]
  );

  const holdingsWithLivePrice = await Promise.all(
    result.rows.map(async (holding) => {
      const quote = await getStockQuote(holding.symbol);
      const currentValue = quote ? quote.ltp * holding.qty : 0;
      const investedValue = holding.avg_buy_price * holding.qty;
      const pnl = currentValue - investedValue;
      const pnlPercent = investedValue > 0 ? ((pnl / investedValue) * 100).toFixed(2) : 0;

      return {
        ...holding,
        currentPrice: quote?.ltp || 0,
        currentValue,
        investedValue,
        pnl: parseFloat(pnl.toFixed(2)),
        pnlPercent: parseFloat(pnlPercent)
      };
    })
  );

  return holdingsWithLivePrice;
};

const getPortfolioSummary = async (userId) => {
  const walletResult = await pool.query(
    'SELECT * FROM wallets WHERE user_id = $1',
    [userId]
  );

  const wallet = walletResult.rows[0] || { balance: 0, total_invested: 0, total_profit: 0 };

  const batchResult = await pool.query(
    `SELECT b.start_balance FROM users u
     LEFT JOIN batches b ON u.batch_id = b.id WHERE u.id = $1`,
    [userId]
  );
  const startBalance = parseFloat(batchResult.rows[0]?.start_balance || 1000000);

  const holdings = await getHoldings(userId);
  const holdingsValue = holdings.reduce((sum, h) => sum + h.currentValue, 0);
  const investedValue = holdings.reduce((sum, h) => sum + h.investedValue, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

const dayPnLResult = await pool.query(
    `SELECT COALESCE(SUM(
       CASE WHEN trade_type = 'SELL' THEN pnl
            WHEN trade_type = 'BUY' THEN 0
       END
     ), 0) as day_realized
    FROM trade_history
    WHERE user_id = $1 AND timestamp >= $2`,
    [userId, today]
  );

  const dayPnL = parseFloat(dayPnLResult.rows[0]?.day_realized || 0);
  const dayUnrealizedPnL = holdings.reduce((sum, h) => {
    const prevClose = h.prevClose || h.currentPrice;
    return sum + (h.currentPrice - prevClose) * h.qty;
  }, 0);

  const totalValue = parseFloat(wallet.balance) + holdingsValue;
  const totalReturns = totalValue - startBalance;
  const totalReturnsPercent = ((totalReturns / startBalance) * 100).toFixed(2);

  const realizedPnL = parseFloat(wallet.total_profit || 0);
  const unrealizedPnL = holdings.reduce((sum, h) => sum + h.pnl, 0);

  return {
    cashBalance: parseFloat(wallet.balance),
    holdingsValue: parseFloat(holdingsValue.toFixed(2)),
    totalValue: parseFloat(totalValue.toFixed(2)),
    investedValue: parseFloat(investedValue.toFixed(2)),
    totalReturns: parseFloat(totalReturns.toFixed(2)),
    totalReturnsPercent: parseFloat(totalReturnsPercent),
    realizedPnL: realizedPnL,
    unrealizedPnL: parseFloat(unrealizedPnL.toFixed(2)),
    dayPnL: parseFloat((dayPnL + dayUnrealizedPnL).toFixed(2)),
    holdings: holdings
  };
};

const getTradeHistory = async (userId, limit = 100) => {
  const result = await pool.query(
    `SELECT * FROM trade_history WHERE user_id = $1 ORDER BY timestamp DESC LIMIT $2`,
    [userId, limit]
  );
  return result.rows;
};

const getPortfolioPerformance = async (userId, days = 30) => {
  const trades = await pool.query(
    `SELECT DATE(timestamp) as date, SUM(CASE WHEN trade_type = 'SELL' THEN pnl ELSE 0 END) as daily_pnl,
            COUNT(*) as trade_count
     FROM trade_history
     WHERE user_id = $1 AND timestamp >= NOW() - INTERVAL '${days} days'
     GROUP BY DATE(timestamp)
     ORDER BY date`,
    [userId]
  );

  const portfolioSnapshots = await pool.query(
    `SELECT DATE(created_at) as date, balance
     FROM wallets
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 100`,
    [userId]
  );

  const startBalance = 1000000;
  let cumulative = startBalance;
  const performance = trades.rows.map(trade => {
    cumulative += parseFloat(trade.daily_pnl || 0);
    return {
      date: trade.date,
      value: cumulative,
      pnl: parseFloat(trade.daily_pnl || 0),
      tradeCount: parseInt(trade.trade_count || 0)
    };
  });

  if (performance.length === 0) {
    return [{
      date: new Date().toISOString().split('T')[0],
      value: startBalance,
      pnl: 0,
      tradeCount: 0
    }];
  }

  return performance;
};

const sumLossGain = (rows, field = 'pnl') => {
  let totalLoss = 0;
  let totalGain = 0;
  for (const row of rows) {
    const v = parseFloat(row[field] || 0);
    if (v < 0) totalLoss += v;
    else if (v > 0) totalGain += v;
  }
  return {
    totalLoss: parseFloat(totalLoss.toFixed(2)),
    totalGain: parseFloat(totalGain.toFixed(2)),
    netPnl: parseFloat((totalLoss + totalGain).toFixed(2))
  };
};

const getTimeLossAnalytics = async (userId, period = 'month') => {
  const validPeriods = ['today', 'week', 'month', 'quarter', 'all'];
  const safePeriod = validPeriods.includes(period) ? period : 'month';

  const periodDays = {
    today: 0,
    week: 7,
    month: 30,
    quarter: 90,
    all: null
  };

  const summaryResult = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN trade_type = 'SELL' AND timestamp >= CURRENT_DATE THEN pnl ELSE 0 END), 0) AS today_realized,
       COALESCE(SUM(CASE WHEN trade_type = 'SELL' AND timestamp >= CURRENT_DATE - INTERVAL '7 days' THEN pnl ELSE 0 END), 0) AS week_realized,
       COALESCE(SUM(CASE WHEN trade_type = 'SELL' AND timestamp >= CURRENT_DATE - INTERVAL '30 days' THEN pnl ELSE 0 END), 0) AS month_realized,
       COALESCE(SUM(CASE WHEN trade_type = 'SELL' AND timestamp >= CURRENT_DATE - INTERVAL '90 days' THEN pnl ELSE 0 END), 0) AS quarter_realized,
       COALESCE(SUM(CASE WHEN trade_type = 'SELL' THEN pnl ELSE 0 END), 0) AS all_realized,
       COUNT(*) FILTER (WHERE trade_type = 'SELL' AND pnl < 0 AND timestamp >= CURRENT_DATE) AS today_loss_trades,
       COUNT(*) FILTER (WHERE trade_type = 'SELL' AND pnl < 0 AND timestamp >= CURRENT_DATE - INTERVAL '7 days') AS week_loss_trades,
       COUNT(*) FILTER (WHERE trade_type = 'SELL' AND pnl < 0 AND timestamp >= CURRENT_DATE - INTERVAL '30 days') AS month_loss_trades
     FROM trade_history
     WHERE user_id = $1`,
    [userId]
  );

  const s = summaryResult.rows[0];
  const summary = await getPortfolioSummary(userId);
  const todayWithUnrealized = parseFloat(summary.dayPnL ?? s.today_realized ?? 0);

  const buildPeriod = (realized, lossTrades = 0) => {
    const r = parseFloat(realized || 0);
    return {
      netPnl: parseFloat(r.toFixed(2)),
      loss: parseFloat((r < 0 ? r : 0).toFixed(2)),
      gain: parseFloat((r > 0 ? r : 0).toFixed(2)),
      lossTradeCount: parseInt(lossTrades, 10) || 0,
      isLoss: r < 0
    };
  };

  const periods = {
    today: buildPeriod(todayWithUnrealized, s.today_loss_trades),
    week: buildPeriod(s.week_realized, s.week_loss_trades),
    month: buildPeriod(s.month_realized, s.month_loss_trades),
    quarter: buildPeriod(s.quarter_realized),
    all: buildPeriod(s.all_realized)
  };

  const days = periodDays[safePeriod];
  const dailyParams = [userId];
  let dailyFilter = '';
  if (days !== null) {
    dailyFilter = ` AND timestamp >= CURRENT_DATE - make_interval(days => $2)`;
    dailyParams.push(days === 0 ? 0 : days);
  }

  const dailyResult = await pool.query(
    `SELECT DATE(timestamp) AS date,
            SUM(CASE WHEN trade_type = 'SELL' THEN pnl ELSE 0 END) AS realized_pnl,
            COUNT(*) FILTER (WHERE trade_type = 'SELL' AND pnl < 0) AS loss_trades,
            COUNT(*) FILTER (WHERE trade_type = 'SELL' AND pnl > 0) AS profit_trades,
            COUNT(*) AS total_trades
     FROM trade_history
     WHERE user_id = $1${safePeriod === 'today' ? ' AND timestamp >= CURRENT_DATE' : dailyFilter}
     GROUP BY DATE(timestamp)
     ORDER BY date DESC
     LIMIT 90`,
    safePeriod === 'today' ? [userId] : dailyParams
  );

  const losingTradesParams = [userId];
  let losingFilter = ` AND trade_type = 'SELL' AND pnl < 0`;
  if (safePeriod === 'today') {
    losingFilter += ` AND timestamp >= CURRENT_DATE`;
  } else if (days !== null) {
    losingFilter += ` AND timestamp >= CURRENT_DATE - make_interval(days => $2)`;
    losingTradesParams.push(days);
  }

  const losingResult = await pool.query(
    `SELECT id, symbol, qty, trade_price, pnl, timestamp
     FROM trade_history
     WHERE user_id = $1${losingFilter}
     ORDER BY timestamp DESC
     LIMIT 100`,
    losingTradesParams
  );

  const dailyTimeline = dailyResult.rows.map((row) => {
    const pnl = parseFloat(row.realized_pnl || 0);
    return {
      date: row.date,
      pnl: parseFloat(pnl.toFixed(2)),
      loss: pnl < 0 ? parseFloat(pnl.toFixed(2)) : 0,
      gain: pnl > 0 ? parseFloat(pnl.toFixed(2)) : 0,
      lossTrades: parseInt(row.loss_trades, 10) || 0,
      profitTrades: parseInt(row.profit_trades, 10) || 0,
      totalTrades: parseInt(row.total_trades, 10) || 0
    };
  });

  const statsFromTimeline = sumLossGain(dailyTimeline, 'pnl');
  let worstDay = null;
  for (const day of dailyTimeline) {
    if (!worstDay || day.pnl < worstDay.pnl) worstDay = { date: day.date, pnl: day.pnl };
  }

  return {
    period: safePeriod,
    periods,
    activeSummary: periods[safePeriod],
    dailyTimeline,
    losingTrades: losingResult.rows.map((t) => ({
      id: t.id,
      symbol: t.symbol,
      qty: t.qty,
      tradePrice: parseFloat(t.trade_price),
      pnl: parseFloat(t.pnl),
      timestamp: t.timestamp
    })),
    stats: {
      ...statsFromTimeline,
      lossTradeCount: losingResult.rows.length,
      worstDay,
      tradingDays: dailyTimeline.length
    },
    unrealizedPnL: summary.unrealizedPnL,
    dayPnL: summary.dayPnL
  };
};

module.exports = {
  getHoldings,
  getPortfolioSummary,
  getTradeHistory,
  getPortfolioPerformance,
  getTimeLossAnalytics
};