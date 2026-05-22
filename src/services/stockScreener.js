const { getStockList } = require('./marketData');
const { enrichStock, filterBySector, SECTOR_MAP } = require('../data/stockMetadata');

const runScreener = async (filters = {}, userId = null) => {
  let stocks = (await getStockList()).map(enrichStock);

  const {
    sector,
    minLtp, maxLtp,
    minChangePct, maxChangePct,
    minVolume, maxVolume,
    minLotValue, maxLotValue,
    minPe, maxPe,
    minPb, maxPb,
    minDivYield,
    minMarketCap,
    minLotsTraded,
    lotFilter,
    sortBy = 'changePercent',
    sortDir = 'desc',
    limit = 50
  } = filters;

  if (sector && sector !== 'ALL') stocks = filterBySector(stocks, sector);

  if (minLtp != null) stocks = stocks.filter((s) => (s.ltp || 0) >= parseFloat(minLtp));
  if (maxLtp != null) stocks = stocks.filter((s) => (s.ltp || 0) <= parseFloat(maxLtp));
  if (minChangePct != null) stocks = stocks.filter((s) => (s.changePercent || 0) >= parseFloat(minChangePct));
  if (maxChangePct != null) stocks = stocks.filter((s) => (s.changePercent || 0) <= parseFloat(maxChangePct));
  if (minVolume != null) stocks = stocks.filter((s) => (s.volume || 0) >= parseFloat(minVolume));
  if (maxVolume != null) stocks = stocks.filter((s) => (s.volume || 0) <= parseFloat(maxVolume));
  if (minPe != null) stocks = stocks.filter((s) => s.peRatio != null && s.peRatio >= parseFloat(minPe));
  if (maxPe != null) stocks = stocks.filter((s) => s.peRatio != null && s.peRatio <= parseFloat(maxPe));
  if (minPb != null) stocks = stocks.filter((s) => s.pbRatio != null && s.pbRatio >= parseFloat(minPb));
  if (maxPb != null) stocks = stocks.filter((s) => s.pbRatio != null && s.pbRatio <= parseFloat(maxPb));
  if (minDivYield != null) stocks = stocks.filter((s) => (s.dividendYield || 0) >= parseFloat(minDivYield));
  if (minMarketCap != null) stocks = stocks.filter((s) => (s.marketCap || 0) >= parseFloat(minMarketCap));

  if (minLotsTraded != null) stocks = stocks.filter((s) => {
    const vol = s.volume || 0;
    const ls = s.lotSize || 1;
    return ls > 0 && (vol / ls) >= parseFloat(minLotsTraded);
  });

  if (lotFilter === 'gt1') stocks = stocks.filter((s) => (s.lotSize || 1) > 1);
  else if (lotFilter === 'eq1') stocks = stocks.filter((s) => (s.lotSize || 1) === 1);

  stocks.forEach((s) => {
    const ls = s.lotSize || 1;
    s.lotValue = parseFloat(((s.ltp || 0) * ls).toFixed(2));
  });

  if (minLotValue != null) stocks = stocks.filter((s) => (s.lotValue || 0) >= parseFloat(minLotValue));
  if (maxLotValue != null) stocks = stocks.filter((s) => (s.lotValue || 0) <= parseFloat(maxLotValue));

  const dir = sortDir === 'asc' ? 1 : -1;
  stocks.sort((a, b) => {
    const key = sortBy === 'ltp' ? 'ltp'
      : sortBy === 'symbol' ? 'symbol'
      : sortBy === 'lotValue' ? 'lotValue'
      : sortBy === 'volume' ? 'volume'
      : sortBy === 'lotSize' ? (s) => s.lotSize || 1
      : 'changePercent';
    if (typeof key === 'function') return dir * (key(a) - key(b));
    const av = a[key] ?? 0;
    const bv = b[key] ?? 0;
    if (typeof av === 'string') return dir * av.localeCompare(bv);
    return dir * (av - bv);
  });

  const results = stocks.slice(0, Math.min(100, parseInt(limit, 10) || 50)).map((s) => ({
    symbol: s.symbol,
    name: s.name || s.symbol,
    ltp: s.ltp,
    changePercent: s.changePercent,
    sector: s.sector || SECTOR_MAP[s.symbol] || 'Other',
    lotSize: s.lotSize || 1,
    lotValue: s.lotValue,
    volume: s.volume,
    peRatio: s.peRatio,
    pbRatio: s.pbRatio,
    dividendYield: s.dividendYield,
    marketCap: s.marketCap
  }));

  return {
    count: results.length,
    filters: { sector, minLtp, maxLtp, minChangePct, maxChangePct, minVolume, maxVolume,
      minLotValue, maxLotValue, minPe, maxPe, minPb, maxPb, minDivYield, minMarketCap, minLotsTraded,
      lotFilter, sortBy, sortDir, limit },
    sectors: [...new Set(stocks.map((s) => s.sector || 'Other'))].sort(),
    results
  };
};

const getPool = () => require('../config/database').pool;

const saveScan = async (userId, name, filters) => {
  const p = getPool();
  if (!p) throw { status: 503, message: 'Database not available' };
  const { rows } = await p.query(
    `INSERT INTO saved_scans (user_id, name, filters) VALUES ($1, $2, $3) RETURNING id, name, created_at`,
    [userId, name, JSON.stringify(filters)]
  );
  return rows[0];
};

const listScans = async (userId) => {
  const p = getPool();
  if (!p) return [];
  const { rows } = await p.query(
    'SELECT id, name, filters, created_at FROM saved_scans WHERE user_id = $1 ORDER BY created_at DESC',
    [userId]
  );
  return rows.map((r) => ({ ...r, filters: typeof r.filters === 'string' ? JSON.parse(r.filters) : r.filters }));
};

const getScan = async (scanId, userId) => {
  const p = getPool();
  if (!p) throw { status: 503, message: 'Database not available' };
  const { rows } = await p.query(
    'SELECT id, name, filters, created_at FROM saved_scans WHERE id = $1 AND user_id = $2',
    [scanId, userId]
  );
  if (!rows.length) throw { status: 404, message: 'Scan not found' };
  const r = rows[0];
  r.filters = typeof r.filters === 'string' ? JSON.parse(r.filters) : r.filters;
  return r;
};

const deleteScan = async (scanId, userId) => {
  const p = getPool();
  if (!p) return;
  await p.query('DELETE FROM saved_scans WHERE id = $1 AND user_id = $2', [scanId, userId]);
};

const PRESET_SCANS = [
  {
    id: 'breakouts',
    name: 'Breakouts (gainers)',
    description: 'Stocks up 2%+ today with volume',
    filters: { minChangePct: 2, minVolume: 100000, sortBy: 'changePercent', sortDir: 'desc', limit: 40 }
  },
  {
    id: 'volume_surge',
    name: 'Volume surge',
    description: 'High volume + positive momentum',
    filters: { minChangePct: 0.5, minLotsTraded: 500, sortBy: 'volume', sortDir: 'desc', limit: 40 }
  },
  {
    id: 'low_lot_value',
    name: 'Low lot value (< ₹5k)',
    description: 'Affordable 1-lot for beginners',
    filters: { maxLotValue: 5000, lotFilter: 'gt1', sortBy: 'lotValue', sortDir: 'asc', limit: 40 }
  },
  {
    id: 'value_pb',
    name: 'Value (P/B < 2)',
    description: 'Lower price-to-book names',
    filters: { maxPb: 2, minMarketCap: 'Large', sortBy: 'pbRatio', sortDir: 'asc', limit: 40 }
  },
  {
    id: 'dividend',
    name: 'Dividend yield',
    description: 'Yield-focused screen',
    filters: { minDivYield: 1, sortBy: 'changePercent', sortDir: 'desc', limit: 40 }
  }
];

const getPresetScans = () => PRESET_SCANS;

module.exports = { runScreener, saveScan, listScans, getScan, deleteScan, getPresetScans, PRESET_SCANS };
