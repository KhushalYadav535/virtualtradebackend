const { getEffectiveLotSize } = require('./lotUtils');
const { enrichStock } = require('../data/stockMetadata');

const buildHoldingRow = (holding, quote, pendingSellQty = 0) => {
  const qty = parseInt(holding.qty, 10) || 0;
  const avgBuyPrice = parseFloat(holding.avg_buy_price) || 0;
  const lotSizeMis = quote ? getEffectiveLotSize(quote, 'MIS') : 1;
  const completeLotsMis = lotSizeMis > 0 ? Math.floor(qty / lotSizeMis) : qty;
  const fractionalShares = lotSizeMis > 0 ? qty % lotSizeMis : 0;
  const hasFractional = fractionalShares > 0 && lotSizeMis > 1;

  const availableQty = Math.max(0, qty - pendingSellQty);
  const tradableQtyCnc = availableQty;
  const tradableLotsMis = lotSizeMis > 0 ? Math.floor(availableQty / lotSizeMis) : availableQty;
  const tradableQtyMis = tradableLotsMis * lotSizeMis;

  const currentPrice = quote?.ltp || 0;
  const prevClose = quote?.prevClose || quote?.previousClose || currentPrice;
  const investedValue = avgBuyPrice * qty;
  const currentValue = currentPrice * qty;
  const pnl = currentValue - investedValue;
  const pnlPercent = investedValue > 0 ? parseFloat(((pnl / investedValue) * 100).toFixed(2)) : 0;
  const dayChangePerShare = currentPrice - prevClose;
  const dayChange = parseFloat((dayChangePerShare * qty).toFixed(2));
  const dayChangePercent = prevClose > 0
    ? parseFloat(((dayChangePerShare / prevClose) * 100).toFixed(2))
    : 0;

  const meta = enrichStock({ symbol: holding.symbol });

  return {
    id: holding.id,
    symbol: holding.symbol,
    name: quote?.companyName || quote?.name || holding.symbol,
    sector: quote?.sector || meta.sector || 'Other',
    qty,
    avgBuyPrice,
    avg_buy_price: avgBuyPrice,
    lotSizeMis,
    lotSizeCnc: 1,
    completeLots: completeLotsMis,
    completeLotsLabel: lotSizeMis > 1
      ? `${completeLotsMis} lot(s) × ${lotSizeMis}`
      : `${qty} share(s)`,
    fractionalShares,
    hasFractional,
    tradableQtyCnc,
    tradableQtyMis,
    tradableLotsMis,
    pendingSellQty,
    currentPrice,
    prevClose,
    investedValue: parseFloat(investedValue.toFixed(2)),
    currentValue: parseFloat(currentValue.toFixed(2)),
    pnl: parseFloat(pnl.toFixed(2)),
    pnlPercent,
    dayChange,
    dayChangePercent,
    last_updated: holding.last_updated
  };
};

const buildTotals = (holdings) => {
  const holdingsValue = holdings.reduce((s, h) => s + h.currentValue, 0);
  const investedValue = holdings.reduce((s, h) => s + h.investedValue, 0);
  const totalPnL = holdings.reduce((s, h) => s + h.pnl, 0);
  const totalDayChange = holdings.reduce((s, h) => s + h.dayChange, 0);
  const totalLotsHeld = holdings.reduce((s, h) => s + (h.completeLots || 0), 0);
  const fractionalCount = holdings.filter((h) => h.hasFractional).length;

  return {
    holdingsValue: parseFloat(holdingsValue.toFixed(2)),
    investedValue: parseFloat(investedValue.toFixed(2)),
    totalPnL: parseFloat(totalPnL.toFixed(2)),
    totalPnLPercent: investedValue > 0
      ? parseFloat(((totalPnL / investedValue) * 100).toFixed(2))
      : 0,
    totalDayChange: parseFloat(totalDayChange.toFixed(2)),
    totalLotsHeld,
    holdingsCount: holdings.length,
    fractionalHoldingsCount: fractionalCount
  };
};

const buildAnalytics = (holdings) => {
  const byPnlPct = [...holdings].sort((a, b) => b.pnlPercent - a.pnlPercent);
  const topGainers = byPnlPct.filter((h) => h.pnl > 0).slice(0, 5);
  const topLosers = [...holdings]
    .filter((h) => h.pnl < 0)
    .sort((a, b) => a.pnl - b.pnl)
    .slice(0, 5);

  const sectorMap = {};
  for (const h of holdings) {
    const sec = h.sector || 'Other';
    if (!sectorMap[sec]) sectorMap[sec] = { sector: sec, value: 0, invested: 0, count: 0 };
    sectorMap[sec].value += h.currentValue;
    sectorMap[sec].invested += h.investedValue;
    sectorMap[sec].count += 1;
  }
  const totalVal = holdings.reduce((s, h) => s + h.currentValue, 0) || 1;
  const sectorBreakdown = Object.values(sectorMap)
    .map((s) => ({
      ...s,
      value: parseFloat(s.value.toFixed(2)),
      invested: parseFloat(s.invested.toFixed(2)),
      weightPercent: parseFloat(((s.value / totalVal) * 100).toFixed(1))
    }))
    .sort((a, b) => b.value - a.value);

  const lotConcentration = [...holdings]
    .map((h) => ({
      symbol: h.symbol,
      lots: h.completeLots,
      lotSize: h.lotSizeMis,
      value: h.currentValue,
      weightPercent: parseFloat(((h.currentValue / totalVal) * 100).toFixed(1))
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  const fractionalHoldings = holdings
    .filter((h) => h.hasFractional)
    .map((h) => ({
      symbol: h.symbol,
      qty: h.qty,
      fractionalShares: h.fractionalShares,
      lotSize: h.lotSizeMis,
      tradableQtyMis: h.tradableQtyMis
    }));

  return { topGainers, topLosers, sectorBreakdown, lotConcentration, fractionalHoldings };
};

const sortHoldings = (holdings, sortBy = 'pnlPercent') => {
  const key = sortBy || 'pnlPercent';
  const sorted = [...holdings];
  const cmp = {
    pnlPercent: (a, b) => b.pnlPercent - a.pnlPercent,
    alphabetical: (a, b) => a.symbol.localeCompare(b.symbol),
    value: (a, b) => b.currentValue - a.currentValue,
    lots: (a, b) => b.completeLots - a.completeLots,
    dayChange: (a, b) => b.dayChange - a.dayChange
  };
  sorted.sort(cmp[key] || cmp.pnlPercent);
  return sorted;
};

const filterHoldings = (holdings, filter = 'all') => {
  if (!filter || filter === 'all') return holdings;
  if (filter === 'profit') return holdings.filter((h) => h.pnl > 0);
  if (filter === 'loss') return holdings.filter((h) => h.pnl < 0);
  if (filter === 'fractional') return holdings.filter((h) => h.hasFractional);
  if (filter === 'tradable_lots') return holdings.filter((h) => h.tradableLotsMis > 0);
  return holdings;
};

module.exports = {
  buildHoldingRow,
  buildTotals,
  buildAnalytics,
  sortHoldings,
  filterHoldings
};
