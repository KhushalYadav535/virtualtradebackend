const { getEffectiveLotSize } = require('./lotUtils');
const { calculateOrderCharges } = require('./orderCharges');

const getIstClock = () => {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const ist = new Date(now.getTime() + now.getTimezoneOffset() * 60000 + istOffset);
  return {
    day: ist.getDay(),
    minutes: ist.getHours() * 60 + ist.getMinutes(),
    dateKey: ist.toISOString().slice(0, 10)
  };
};

const getAutoSquareOffStatus = () => {
  const { day, minutes } = getIstClock();
  if (day === 0 || day === 6) {
    return { phase: 'closed', warning: false, executing: false, message: 'Weekend — no auto square-off' };
  }
  const warnStart = 15 * 60 + 15;
  const execStart = 15 * 60 + 20;
  const marketEnd = 15 * 60 + 30;
  if (minutes >= warnStart && minutes < execStart) {
    return {
      phase: 'warning',
      warning: true,
      executing: false,
      message: '3:15 PM — MIS positions will be auto squared-off at 3:20 PM IST'
    };
  }
  if (minutes >= execStart && minutes <= marketEnd) {
    return {
      phase: 'executing',
      warning: false,
      executing: true,
      message: '3:20 PM — System auto square-off window is active'
    };
  }
  return { phase: 'normal', warning: false, executing: false, message: null };
};

const enrichPosition = (row, quote) => {
  const lotSize = quote ? getEffectiveLotSize(quote, 'MIS') : 1;
  const qty = parseInt(row.qty, 10) || 0;
  const lots = lotSize > 0 ? Math.floor(qty / lotSize) : qty;
  const fractionalShares = lotSize > 1 ? qty % lotSize : 0;
  const avg = parseFloat(row.avg_buy_price) || 0;
  const ltp = parseFloat(row.currentPrice ?? quote?.ltp ?? 0);
  const invested = avg * qty;
  const currentValue = ltp * qty;
  const pnl = currentValue - invested;
  const pnlPercent = invested > 0 ? (pnl / invested) * 100 : 0;
  const pnlPerLot = lots > 0 ? pnl / lots : pnl;
  const prevClose = quote?.prevClose || ltp;
  const dayChange = (ltp - prevClose) * qty;

  const exitCharges = calculateOrderCharges({
    orderType: 'SELL',
    productType: 'MIS',
    notional: currentValue
  });
  const netPnl = pnl - exitCharges.total;

  return {
    id: row.id,
    symbol: row.symbol,
    exchange: row.exchange || 'NSE',
    name: quote?.companyName || quote?.name || row.symbol,
    qty,
    lotSize,
    lots,
    fractionalShares,
    lotsLabel: lotSize > 1 ? `${lots} × ${lotSize}` : `${qty} share(s)`,
    avg_buy_price: avg,
    avgBuyPrice: avg,
    currentPrice: ltp,
    currentValue: parseFloat(currentValue.toFixed(2)),
    investedValue: parseFloat(invested.toFixed(2)),
    margin_blocked: parseFloat(row.margin_blocked) || 0,
    marginBlocked: parseFloat(row.margin_blocked) || 0,
    pnl: parseFloat(pnl.toFixed(2)),
    pnlPercent: parseFloat(pnlPercent.toFixed(2)),
    pnlPerLot: parseFloat(pnlPerLot.toFixed(2)),
    dayChange: parseFloat(dayChange.toFixed(2)),
    charges: exitCharges,
    netPnl: parseFloat(netPnl.toFixed(2)),
    opened_at: row.opened_at,
    last_updated: row.last_updated
  };
};

const buildTotals = (positions) => {
  const totalPnl = positions.reduce((s, p) => s + (p.pnl || 0), 0);
  const totalNetPnl = positions.reduce((s, p) => s + (p.netPnl || 0), 0);
  const totalMargin = positions.reduce((s, p) => s + (p.marginBlocked || 0), 0);
  const totalLots = positions.reduce((s, p) => s + (p.lots || 0), 0);
  const invested = positions.reduce((s, p) => s + (p.investedValue || 0), 0);
  return {
    count: positions.length,
    totalPnl: parseFloat(totalPnl.toFixed(2)),
    totalPnlPercent: invested > 0 ? parseFloat(((totalPnl / invested) * 100).toFixed(2)) : 0,
    totalNetPnl: parseFloat(totalNetPnl.toFixed(2)),
    totalMargin: parseFloat(totalMargin.toFixed(2)),
    totalLots
  };
};

module.exports = {
  enrichPosition,
  buildTotals,
  getAutoSquareOffStatus,
  getIstClock
};
