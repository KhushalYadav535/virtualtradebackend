/**
 * Live NSE feeds via stock-nse-india (FII/DII, corporate actions).
 * Cached to limit upstream load on remote DB hosts.
 */

const { NIFTY_50 } = require('../data/stockMetadata');

let nseIndia = null;
try {
  const { NseIndia } = require('stock-nse-india');
  nseIndia = new NseIndia();
} catch {
  console.warn('nseLiveFeeds: stock-nse-india unavailable');
}

const fiiDiiCache = { data: null, at: 0 };
const corpCache = { data: null, at: 0 };

const FII_DII_TTL_MS = 5 * 60 * 1000;
const CORP_TTL_MS = 2 * 60 * 60 * 1000;
const CORP_SYMBOLS = NIFTY_50.slice(0, 40);

const parseNseDate = (raw) => {
  if (!raw) return null;
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
};

const inferActionType = (purpose = '') => {
  const p = String(purpose).toLowerCase();
  if (p.includes('dividend')) return 'dividend';
  if (p.includes('bonus')) return 'bonus';
  if (p.includes('split')) return 'split';
  if (p.includes('rights')) return 'rights';
  if (p.includes('buyback')) return 'buyback';
  if (p.includes('merger') || p.includes('demerger')) return 'merger';
  return 'other';
};

const mapCorpRow = (row) => {
  const exDate = parseNseDate(row.exdate);
  return {
    symbol: String(row.symbol || '').toUpperCase(),
    type: inferActionType(row.purpose),
    title: row.purpose || 'Corporate action',
    exDate: exDate || row.exdate,
    recordDate: exDate,
    impact: 'Live from NSE corporate actions feed',
    source: 'nse_live',
    purpose: row.purpose
  };
};

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const fetchCorporateActionsForSymbols = async (symbols) => {
  if (!nseIndia) return [];
  const all = [];
  const batches = chunk(symbols, 6);

  for (const batch of batches) {
    const results = await Promise.all(
      batch.map(async (symbol) => {
        try {
          const info = await nseIndia.getEquityCorporateInfo(symbol);
          const rows = info?.corporate_actions?.data || [];
          return rows.map(mapCorpRow).filter((a) => a.exDate);
        } catch {
          return [];
        }
      })
    );
    results.forEach((list) => all.push(...list));
  }

  const today = new Date().toISOString().slice(0, 10);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  return all
    .filter((a) => {
      const ex = a.exDate;
      return ex >= cutoffStr || ex >= today;
    })
    .sort((a, b) => String(b.exDate).localeCompare(String(a.exDate)))
    .slice(0, 80);
};

const getFiiDii = async () => {
  const now = Date.now();
  if (fiiDiiCache.data && now - fiiDiiCache.at < FII_DII_TTL_MS) {
    return { ...fiiDiiCache.data, cached: true };
  }

  if (!nseIndia) {
    return {
      available: false,
      source: 'none',
      note: 'NSE client not configured',
      latest: null,
      history: []
    };
  }

  try {
    const raw = await nseIndia.getDataByEndpoint('/api/fiidiiTradeReact');
    const rows = Array.isArray(raw) ? raw : [];
    const latest = rows.map((r) => ({
      category: r.category,
      date: r.date,
      buyValueCr: parseFloat(r.buyValue) || 0,
      sellValueCr: parseFloat(r.sellValue) || 0,
      netValueCr: parseFloat(r.netValue) || 0
    }));

    const fii = latest.find((r) => /fii|fpi/i.test(r.category));
    const dii = latest.find((r) => /dii/i.test(r.category) && !/fii/i.test(r.category));

    const payload = {
      available: latest.length > 0,
      source: 'nse_live',
      asOf: fii?.date || dii?.date || new Date().toISOString().slice(0, 10),
      note: 'Daily FII/FPI and DII cash activity on NSE (₹ crore).',
      latest: { fii, dii },
      history: latest,
      cached: false
    };

    fiiDiiCache.data = payload;
    fiiDiiCache.at = now;
    return payload;
  } catch (err) {
    return {
      available: false,
      source: 'error',
      note: err.message || 'Failed to fetch FII/DII',
      latest: null,
      history: []
    };
  }
};

const staticUpcomingActions = () => {
  const { ACTIONS } = require('../data/corporateActions');
  const today = new Date().toISOString().slice(0, 10);
  return ACTIONS.filter((a) => a.exDate >= today).map((a) => ({
    ...a,
    source: 'education_calendar'
  }));
};

const refreshCorporateCache = async (extraSymbols = []) => {
  const symbols = [...new Set([...CORP_SYMBOLS, ...(extraSymbols || [])])].slice(0, 50);
  let live = [];
  if (nseIndia) {
    try {
      live = await fetchCorporateActionsForSymbols(symbols);
    } catch (err) {
      console.warn('Live corp actions fetch failed:', err.message);
    }
  }
  const staticUpcoming = staticUpcomingActions();
  const byKey = new Map();
  for (const a of [...live, ...staticUpcoming]) {
    const key = `${a.symbol}-${a.exDate}-${a.type}`;
    if (!byKey.has(key) || a.source === 'nse_live') byKey.set(key, a);
  }
  corpCache.data = [...byKey.values()].sort((a, b) => String(a.exDate).localeCompare(String(b.exDate)));
  corpCache.at = Date.now();
  return { liveCount: live.length };
};

const getLiveCorporateActions = async (extraSymbols = [], { forceRefresh = false } = {}) => {
  const now = Date.now();
  if (corpCache.data && now - corpCache.at < CORP_TTL_MS && !forceRefresh) {
    return { actions: corpCache.data, source: corpCache.data.some((a) => a.source === 'nse_live') ? 'nse_live' : 'education_calendar', cached: true };
  }

  if (!forceRefresh && !corpCache.data) {
    setImmediate(() => refreshCorporateCache(extraSymbols).catch(() => {}));
    const staticUpcoming = staticUpcomingActions();
    return { actions: staticUpcoming, source: 'education_calendar', liveCount: 0, cached: false };
  }

  const { liveCount } = await refreshCorporateCache(extraSymbols);

  return {
    actions: corpCache.data,
    source: corpCache.data.some((a) => a.source === 'nse_live') ? 'nse_live' : 'education_calendar',
    liveCount,
    cached: false
  };
};

const getCachedActionsForSymbol = (symbol) => {
  const sym = String(symbol || '').toUpperCase();
  if (!corpCache.data) return null;
  return corpCache.data.filter((a) => a.symbol === sym);
};

module.exports = {
  getFiiDii,
  getLiveCorporateActions,
  fetchCorporateActionsForSymbols,
  getCachedActionsForSymbol
};
