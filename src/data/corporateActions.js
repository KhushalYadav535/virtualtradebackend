/**
 * Simulated corporate-action calendar for education (not live NSE feed).
 */
const ACTIONS = [
  { symbol: 'RELIANCE', type: 'dividend', title: 'Interim dividend ₹9/share', exDate: '2026-06-15', recordDate: '2026-06-16', impact: 'Cash credit on record date; LTP may adjust on ex-date' },
  { symbol: 'TCS', type: 'buyback', title: 'Buyback up to ₹18,000 cr', exDate: '2026-07-01', recordDate: '2026-07-05', impact: 'Open offer; holding qty unchanged until tender' },
  { symbol: 'HDFCBANK', type: 'dividend', title: 'Final dividend ₹19.50/share', exDate: '2026-05-28', recordDate: '2026-05-29', impact: 'Dividend on eligible CNC qty' },
  { symbol: 'INFY', type: 'bonus', title: 'Bonus 1:1', exDate: '2026-08-10', recordDate: '2026-08-11', impact: 'Qty doubles; avg price halves after credit' },
  { symbol: 'ITC', type: 'dividend', title: 'Final dividend ₹6.75/share', exDate: '2026-06-02', recordDate: '2026-06-03', impact: 'Cash dividend on delivery holdings' },
  { symbol: 'SBIN', type: 'split', title: 'Stock split 1:5', exDate: '2026-09-01', recordDate: '2026-09-02', impact: 'Qty ×5; price ÷5; lot size may change' },
  { symbol: 'BHARTIARTL', type: 'dividend', title: 'Interim dividend ₹12/share', exDate: '2026-05-20', recordDate: '2026-05-21', impact: 'Ex-date price adjustment typical' },
  { symbol: 'ICICIBANK', type: 'dividend', title: 'Final dividend ₹10/share', exDate: '2026-06-18', recordDate: '2026-06-19', impact: 'Eligible for CNC holdings on record date' },
  { symbol: 'KOTAKBANK', type: 'rights', title: 'Rights issue 1:10 @ ₹1,500', exDate: '2026-07-15', recordDate: '2026-07-16', impact: 'Optional; fractional entitlements possible' },
  { symbol: 'MARUTI', type: 'dividend', title: 'Final dividend ₹125/share', exDate: '2026-05-30', recordDate: '2026-05-31', impact: 'Large cash flow for full-lot holders' },
  { symbol: 'SUNPHARMA', type: 'bonus', title: 'Bonus 1:2', exDate: '2026-08-22', recordDate: '2026-08-23', impact: 'Partial bonus may leave fractional shares' },
  { symbol: 'BAJFINANCE', type: 'split', title: 'Stock split 1:10', exDate: '2026-10-01', recordDate: '2026-10-02', impact: 'F&O lot size often revised after split' },
  { symbol: 'WIPRO', type: 'dividend', title: 'Interim dividend ₹5/share', exDate: '2026-06-08', recordDate: '2026-06-09', impact: 'Standard dividend on CNC qty' },
  { symbol: 'HCLTECH', type: 'dividend', title: 'Interim dividend ₹18/share', exDate: '2026-05-25', recordDate: '2026-05-26', impact: 'Watch MIS lot alignment after ex-date' },
  { symbol: 'TATAMOTORS', type: 'rights', title: 'Rights 1:6 @ ₹450', exDate: '2026-07-20', recordDate: '2026-07-21', impact: 'Non-traded fractional rights in books' }
];

const bySymbol = () => {
  const map = {};
  for (const a of ACTIONS) {
    if (!map[a.symbol]) map[a.symbol] = [];
    map[a.symbol].push(a);
  }
  return map;
};

const SYMBOL_MAP = bySymbol();

const getActionsForSymbol = (symbol) => {
  const sym = String(symbol || '').toUpperCase();
  try {
    const feeds = require('../services/nseLiveFeeds');
    const hit = feeds.getCachedActionsForSymbol(sym);
    if (hit?.length) return hit;
  } catch {
    /* static fallback */
  }
  return SYMBOL_MAP[sym] || [];
};

const getActionsForSymbols = (symbols) => {
  const out = {};
  for (const s of symbols || []) {
    const sym = String(s).toUpperCase();
    const list = getActionsForSymbol(sym);
    if (list.length) out[sym] = list;
  }
  return out;
};

const getUpcomingForSymbols = (symbols, limit = 3) => {
  const today = new Date().toISOString().slice(0, 10);
  const items = [];
  for (const s of symbols || []) {
    for (const a of getActionsForSymbol(s)) {
      if (a.exDate >= today) items.push({ ...a, symbol: String(s).toUpperCase() });
    }
  }
  return items.sort((a, b) => a.exDate.localeCompare(b.exDate)).slice(0, limit);
};

module.exports = {
  ACTIONS,
  getActionsForSymbol,
  getActionsForSymbols,
  getUpcomingForSymbols
};
