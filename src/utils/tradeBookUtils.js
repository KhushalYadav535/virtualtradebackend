const { getEffectiveLotSize } = require('./lotUtils');
const { calculateOrderCharges } = require('./orderCharges');

const enrichTrade = (row, quote) => {
  const productType = row.product_type || 'CNC';
  const lotSize = quote ? getEffectiveLotSize(quote, productType) : 1;
  const qty = parseInt(row.qty, 10) || 0;
  const price = parseFloat(row.trade_price) || 0;
  const lots = lotSize > 0 ? qty / lotSize : qty;
  const perLotValue = parseFloat((price * lotSize).toFixed(2));
  const totalValue = parseFloat((price * qty).toFixed(2));
  const pnl = row.pnl != null ? parseFloat(row.pnl) : 0;
  const pnlPerLot = lots > 0 ? parseFloat((pnl / lots).toFixed(2)) : 0;
  const tradeType = row.trade_type || 'BUY';
  const charges = calculateOrderCharges({ orderType: tradeType, productType, notional: totalValue });
  const netAmount =
    tradeType === 'BUY'
      ? parseFloat((totalValue + charges.total).toFixed(2))
      : parseFloat((totalValue - charges.total).toFixed(2));
  const isLeveraged = productType === 'MIS' || productType === 'NRML';
  const marginRate = isLeveraged ? 0.15 : 1;
  const marginUsed = parseFloat((totalValue * marginRate).toFixed(2));

  return {
    id: row.id,
    tradeId: row.id,
    orderId: row.order_id,
    symbol: row.symbol,
    exchange: row.exchange || quote?.exchange || 'NSE',
    name: quote?.companyName || quote?.name || row.symbol,
    tradeType,
    orderMode: row.order_mode || 'market',
    productType,
    qty,
    lotSize,
    lots: parseFloat(lots.toFixed(2)),
    lotsLabel: lotSize > 1 ? `${lots % 1 === 0 ? lots : lots.toFixed(2)} × ${lotSize}` : `${qty} sh`,
    price,
    perLotValue,
    totalValue,
    pnl,
    pnlPerLot,
    charges,
    netAmount,
    marginUsed,
    timestamp: row.timestamp
  };
};

const filterTrades = (trades, opts = {}) => {
  const {
    side = 'all',
    symbol = '',
    dateFilter = 'all',
    from,
    to,
    lotFilter = 'all',
    product = 'all'
  } = opts;

  let list = [...trades];
  const symQ = String(symbol || '').trim().toUpperCase();

  if (side !== 'all') list = list.filter((t) => t.tradeType === side);
  if (symQ) list = list.filter((t) => t.symbol.toUpperCase().includes(symQ));
  if (product !== 'all') list = list.filter((t) => t.productType === product);

  if (from || to) {
    const fromD = from ? new Date(from) : null;
    const toD = to ? new Date(to) : null;
    list = list.filter((t) => {
      const td = new Date(t.timestamp);
      if (fromD && td < fromD) return false;
      if (toD && td > toD) return false;
      return true;
    });
  } else if (dateFilter !== 'all') {
    const now = new Date();
    list = list.filter((t) => {
      const td = new Date(t.timestamp);
      if (dateFilter === 'today') return td.toDateString() === now.toDateString();
      if (dateFilter === 'week') return now.getTime() - td.getTime() <= 7 * 24 * 60 * 60 * 1000;
      if (dateFilter === 'month') {
        return td.getMonth() === now.getMonth() && td.getFullYear() === now.getFullYear();
      }
      return true;
    });
  }

  if (lotFilter === '1') list = list.filter((t) => t.lots === 1);
  else if (lotFilter === '2-5') list = list.filter((t) => t.lots >= 2 && t.lots <= 5);
  else if (lotFilter === '5plus') list = list.filter((t) => t.lots > 5);

  return list.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
};

const buildSummary = (trades) => {
  let buyTurnover = 0;
  let sellTurnover = 0;
  let totalLots = 0;
  let realizedPnl = 0;
  let totalCharges = 0;
  let totalMargin = 0;

  trades.forEach((t) => {
    if (t.tradeType === 'BUY') buyTurnover += t.totalValue;
    else sellTurnover += t.totalValue;
    totalLots += t.lots;
    if (t.tradeType === 'SELL') realizedPnl += t.pnl;
    totalCharges += t.charges?.total || 0;
    totalMargin += t.marginUsed || 0;
  });

  return {
    tradeCount: trades.length,
    totalLots: parseFloat(totalLots.toFixed(2)),
    buyTurnover: parseFloat(buyTurnover.toFixed(2)),
    sellTurnover: parseFloat(sellTurnover.toFixed(2)),
    turnover: parseFloat((buyTurnover + sellTurnover).toFixed(2)),
    realizedPnl: parseFloat(realizedPnl.toFixed(2)),
    totalCharges: parseFloat(totalCharges.toFixed(2)),
    totalMarginUsed: parseFloat(totalMargin.toFixed(2))
  };
};

const buildDailySummary = (trades) => {
  const byDay = {};
  trades.forEach((t) => {
    const day = String(t.timestamp).slice(0, 10);
    if (!byDay[day]) {
      byDay[day] = { date: day, tradeCount: 0, totalLots: 0, turnover: 0, realizedPnl: 0 };
    }
    byDay[day].tradeCount += 1;
    byDay[day].totalLots += t.lots;
    byDay[day].turnover += t.totalValue;
    if (t.tradeType === 'SELL') byDay[day].realizedPnl += t.pnl;
  });
  return Object.values(byDay)
    .map((d) => ({
      ...d,
      totalLots: parseFloat(d.totalLots.toFixed(2)),
      turnover: parseFloat(d.turnover.toFixed(2)),
      realizedPnl: parseFloat(d.realizedPnl.toFixed(2))
    }))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 90);
};

const buildMonthlySummary = (trades) => {
  const byMonth = {};
  trades.forEach((t) => {
    const d = new Date(t.timestamp);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!byMonth[key]) {
      byMonth[key] = { month: key, tradeCount: 0, totalLots: 0, turnover: 0, realizedPnl: 0 };
    }
    byMonth[key].tradeCount += 1;
    byMonth[key].totalLots += t.lots;
    byMonth[key].turnover += t.totalValue;
    if (t.tradeType === 'SELL') byMonth[key].realizedPnl += t.pnl;
  });
  return Object.values(byMonth)
    .map((m) => ({
      ...m,
      totalLots: parseFloat(m.totalLots.toFixed(2)),
      turnover: parseFloat(m.turnover.toFixed(2)),
      realizedPnl: parseFloat(m.realizedPnl.toFixed(2))
    }))
    .sort((a, b) => b.month.localeCompare(a.month))
    .slice(0, 24);
};

const buildLotAnalytics = (trades) => {
  const buckets = { oneLot: 0, twoToFive: 0, fivePlus: 0 };
  const bySymbol = {};
  trades.forEach((t) => {
    if (t.lots === 1) buckets.oneLot += 1;
    else if (t.lots <= 5) buckets.twoToFive += 1;
    else buckets.fivePlus += 1;
    if (!bySymbol[t.symbol]) bySymbol[t.symbol] = { symbol: t.symbol, trades: 0, totalLots: 0, turnover: 0 };
    bySymbol[t.symbol].trades += 1;
    bySymbol[t.symbol].totalLots += t.lots;
    bySymbol[t.symbol].turnover += t.totalValue;
  });
  const topByLots = Object.values(bySymbol)
    .map((s) => ({ ...s, totalLots: parseFloat(s.totalLots.toFixed(2)), turnover: parseFloat(s.turnover.toFixed(2)) }))
    .sort((a, b) => b.totalLots - a.totalLots)
    .slice(0, 10);
  return { buckets, topByLots };
};

module.exports = {
  enrichTrade,
  filterTrades,
  buildSummary,
  buildDailySummary,
  buildMonthlySummary,
  buildLotAnalytics
};
