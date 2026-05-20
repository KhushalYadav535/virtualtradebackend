/**
 * Live NSE option chain via stock-nse-india (indices + equity).
 * Short TTL cache to respect NSE rate limits.
 */

const INDEX_SYMBOLS = new Set(['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'NIFTYIT']);

const LOT_SIZES = {
  NIFTY: 50,
  BANKNIFTY: 15,
  FINNIFTY: 40,
  MIDCPNIFTY: 75,
  RELIANCE: 250,
  TCS: 175,
  HDFCBANK: 400,
  INFY: 400,
  ICICIBANK: 700
};

const getLotSize = (symbol) => {
  const sym = symbol.toUpperCase();
  if (sym.startsWith('NIFTY') && sym !== 'NIFTYIT') return LOT_SIZES.NIFTY || 50;
  if (sym.startsWith('BANKNIFTY')) return 15;
  return LOT_SIZES[sym] || 1;
};

let nseIndia = null;
try {
  const { NseIndia } = require('stock-nse-india');
  nseIndia = new NseIndia();
} catch (e) {
  console.log('optionChain: stock-nse-india unavailable');
}

const cache = new Map();
const CACHE_TTL_MS = 30 * 1000;

const getCached = async (key, fetcher) => {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return { ...hit.data, cached: true };
  }
  const data = await fetcher();
  cache.set(key, { data, at: Date.now() });
  return { ...data, cached: false };
};

const parseStrike = (strikePrice) => {
  const n = parseFloat(String(strikePrice).trim());
  return Number.isFinite(n) ? n : 0;
};

const mapContract = (details, lotSize) => {
  if (!details) return null;
  const ltp = Number(details.lastPrice) || 0;
  const prev = Number(details.prevClose ?? details.closePrice);
  const changePercent =
    details.pChange ?? details.pchange ??
    (prev ? ((ltp - prev) / prev) * 100 : 0);

  return {
    symbol: details.identifier || null,
    ltp: parseFloat(ltp.toFixed(2)),
    change: Number(details.change) || 0,
    changePercent: parseFloat(Number(changePercent).toFixed(2)),
    oi: Number(details.openInterest) || 0,
    oiChange: Number(details.changeinOpenInterest) || 0,
    volume: Number(details.totalTradedVolume) || 0,
    iv: details.impliedVolatility != null ? parseFloat(Number(details.impliedVolatility).toFixed(2)) : null,
    bid: details.buyPrice1 ?? null,
    ask: details.sellPrice1 ?? null,
    delta: null,
    lotSize
  };
};

const normalizeIndexChain = (raw, symbol, expiry) => {
  const records = raw?.records;
  if (!records?.data?.length) {
    throw new Error('NSE returned empty index option chain');
  }

  const lotSize = getLotSize(symbol);
  const options = records.data
    .filter((row) => row.CE || row.PE)
    .map((row) => ({
      strike: row.strikePrice,
      call: mapContract(row.CE, lotSize),
      put: mapContract(row.PE, lotSize)
    }))
    .sort((a, b) => a.strike - b.strike);

  return {
    symbol: symbol.toUpperCase(),
    type: 'index',
    underlyingValue: records.underlyingValue,
    expiry: expiry || records.expiryDates?.[0] || null,
    expiryDates: records.expiryDates || [],
    timestamp: records.timestamp || new Date().toISOString(),
    source: 'nse',
    options
  };
};

const normalizeEquityChain = (raw, symbol) => {
  const items = raw?.data;
  if (!items?.length) {
    throw new Error('NSE returned empty equity option chain');
  }

  const lotSize = getLotSize(symbol);
  const byStrike = new Map();
  let underlyingValue = 0;

  for (const item of items) {
    if (item.optionType !== 'CE' && item.optionType !== 'PE') continue;
    const strike = parseStrike(item.strikePrice);
    if (!strike) continue;

    underlyingValue = item.underlyingValue || underlyingValue;
    if (!byStrike.has(strike)) {
      byStrike.set(strike, { strike, call: null, put: null });
    }
    const row = byStrike.get(strike);
    const contract = {
      symbol: item.identifier,
      ltp: parseFloat((Number(item.lastPrice) || 0).toFixed(2)),
      change: Number(item.change) || 0,
      changePercent: parseFloat((Number(item.pchange) || 0).toFixed(2)),
      oi: Number(item.openInterest) || 0,
      oiChange: Number(item.changeinOpenInterest) || 0,
      volume: Number(item.totalTradedVolume) || 0,
      iv: null,
      bid: null,
      ask: null,
      delta: null,
      lotSize
    };
    if (item.optionType === 'CE') row.call = contract;
    else row.put = contract;
  }

  const expiryDates = [...new Set(items.map((d) => d.expiryDate).filter(Boolean))];

  return {
    symbol: symbol.toUpperCase(),
    type: 'equity',
    underlyingValue,
    expiry: expiryDates[0] || null,
    expiryDates,
    timestamp: raw.timestamp || new Date().toISOString(),
    source: 'nse',
    options: [...byStrike.values()].sort((a, b) => a.strike - b.strike)
  };
};

/** Simulated fallback when NSE is down */
const buildMockChain = (symbol, underlyingValue) => {
  const sym = symbol.toUpperCase();
  const ltp = underlyingValue || (sym === 'BANKNIFTY' ? 48000 : 22000);
  const step = sym === 'BANKNIFTY' ? 100 : 50;
  const atmStrike = Math.round(ltp / step) * step;
  const lotSize = getLotSize(sym);
  const strikes = [];
  for (let i = -10; i <= 10; i++) strikes.push(atmStrike + i * step);

  const options = strikes.map((strike) => {
    const diff = strike - ltp;
    const cePremium = Math.max(0.5, 300 - diff * 0.5);
    const pePremium = Math.max(0.5, 300 + diff * 0.5);
    const mk = (premium, type) => ({
      symbol: `${sym}MOCK${strike}${type}`,
      ltp: parseFloat(premium.toFixed(2)),
      change: 0,
      changePercent: 0,
      oi: 0,
      oiChange: 0,
      volume: 0,
      iv: null,
      bid: null,
      ask: null,
      delta: null,
      lotSize
    });
    return { strike, call: mk(cePremium, 'CE'), put: mk(pePremium, 'PE') };
  });

  return {
    symbol: sym,
    type: INDEX_SYMBOLS.has(sym) ? 'index' : 'equity',
    underlyingValue: ltp,
    expiry: null,
    expiryDates: [],
    timestamp: new Date().toISOString(),
    source: 'simulated',
    options
  };
};

const fetchIndexChain = async (symbol, expiry) => {
  if (!nseIndia) throw new Error('NSE client not configured');
  const raw = await nseIndia.getIndexOptionChain(symbol, expiry || undefined);
  const usedExpiry =
    expiry ||
    raw?.records?.expiryDates?.[0] ||
    (await nseIndia.getIndexOptionChainContractInfo(symbol).catch(() => null))?.expiryDates?.[0];
  return normalizeIndexChain(raw, symbol, usedExpiry);
};

const fetchEquityChain = async (symbol) => {
  if (!nseIndia) throw new Error('NSE client not configured');
  const raw = await nseIndia.getEquityOptionChain(symbol);
  return normalizeEquityChain(raw, symbol);
};

const getOptionChain = async (symbol, expiry = null) => {
  const sym = symbol.toUpperCase().replace(/\s+/g, '');
  const cacheKey = `oc:${sym}:${expiry || 'nearest'}`;

  try {
    return await getCached(cacheKey, async () => {
      if (INDEX_SYMBOLS.has(sym)) {
        return await fetchIndexChain(sym, expiry);
      }
      return await fetchEquityChain(sym);
    });
  } catch (err) {
    console.error(`optionChain NSE fetch failed (${sym}):`, err.message);
    const fallback = buildMockChain(sym);
    return { ...fallback, source: 'simulated', error: err.message };
  }
};

const getOptionExpiries = async (symbol) => {
  const sym = symbol.toUpperCase();
  if (!nseIndia || !INDEX_SYMBOLS.has(sym)) {
    return { symbol: sym, expiryDates: [] };
  }
  const info = await nseIndia.getIndexOptionChainContractInfo(sym);
  return { symbol: sym, expiryDates: info?.expiryDates || [] };
};

module.exports = { getOptionChain, getOptionExpiries, INDEX_SYMBOLS };
