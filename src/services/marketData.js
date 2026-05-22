let yahooFinance = null;
let yahooFinanceLoading = null;
let nseIndia = null;

const loadYahooFinance = async () => {
  if (yahooFinance) return yahooFinance;
  if (yahooFinanceLoading) return yahooFinanceLoading;

  yahooFinanceLoading = (async () => {
    try {
      const mod = await import('yahoo-finance2');
      const YahooFinance = mod.default || mod;
      yahooFinance = new YahooFinance({
        suppressNotices: ['ripHistorical', 'yahooSurvey']
      });
      return yahooFinance;
    } catch (e) {
      console.log('yahoo-finance2 not available:', e.message);
      return null;
    } finally {
      yahooFinanceLoading = null;
    }
  })();

  return yahooFinanceLoading;
};

const getChartRange = (period) => {
  const now = new Date();
  const ranges = {
    '1m': { days: 1, interval: '1m' },
    '5m': { days: 5, interval: '5m' },
    '15m': { days: 5, interval: '15m' },
    '1d': { days: 30, interval: '1d' },
    '1D': { days: 30, interval: '1d' },
    '1w': { days: 90, interval: '1wk' },
    '1W': { days: 90, interval: '1wk' },
    '1mo': { days: 365, interval: '1mo' },
    '1M': { days: 365, interval: '1mo' }
  };
  const cfg = ranges[period] || ranges['1d'];
  const period1 = new Date(now.getTime() - cfg.days * 24 * 60 * 60 * 1000);
  return { period1, period2: now, interval: cfg.interval };
};

const mapChartQuotes = (quotes) =>
  (quotes || [])
    .filter((item) => item?.close != null && item?.date)
    .map((item) => {
      const close = Number(item.close);
      const open = Number(item.open ?? close);
      const high = Number(item.high ?? Math.max(open, close));
      const low = Number(item.low ?? Math.min(open, close));
      return {
        time: Math.floor(new Date(item.date).getTime() / 1000),
        open: Number.isFinite(open) ? open : close,
        high: Number.isFinite(high) ? high : Math.max(open, close),
        low: Number.isFinite(low) ? low : Math.min(open, close),
        close,
        volume: Number(item.volume) || 0
      };
    })
    .filter(
      (item) =>
        Number.isFinite(item.open) &&
        Number.isFinite(item.high) &&
        Number.isFinite(item.low) &&
        Number.isFinite(item.close)
    );

try {
  const { NseIndia } = require('stock-nse-india');
  nseIndia = new NseIndia();
} catch (e) {
  console.log('stock-nse-india not available');
}

const { cachePrice, getCachedPrice, cacheStockList, getCachedStockList } = require('../config/redis');

const POLL_SYMBOLS = [
  'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'SBIN', 'BHARTIARTL', 'KOTAKBANK',
  'LT', 'HINDUNILVR', 'BAJFINANCE', 'ASIANPAINT', 'MARUTI', 'WIPRO', 'TITAN', 'SUNPHARMA',
  'TATASTEEL', 'ADANIPORTS', 'NTPC', 'POWERGRID', 'ONGC', 'COALINDIA', 'AXISBANK', 'HCLTECH'
];

let memoryStockList = null;
let memoryStockListAt = 0;
const MEMORY_LIST_TTL_MS = 60 * 60 * 1000;

const NSE_SYMBOLS = [
  'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'SBIN', 'BHARTIARTL', 'KOTAKBANK',
  'LT', 'HINDUNILVR', 'BAJFINANCE', 'ASIANPAINT', 'MARUTI', 'WIPRO', 'TITAN', 'SUNPHARMA',
  'TATASTEEL', 'HDFC', 'ADANIPORTS', 'NTPC', 'POWERGRID', 'ONGC', 'COALINDIA', 'GRASIM',
  'SBILIFE', 'BPCL', 'CIPLA', 'EICHERMOT', 'DRREDDY', 'INDUSINDBK', 'AXISBANK', 'HCLTECH',
  'TECHM', 'ULTRACEMCO', 'NESTLEIND', 'BAJAJFINSV', 'M&M', 'TATAMOTORS', 'DIVISLAB', 'JSWSTEEL'
];

const BSE_SYMBOLS = ['RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ITC'];

const STOCK_NAMES = {
  RELIANCE: 'Reliance Industries', TCS: 'Tata Consultancy Services', HDFCBANK: 'HDFC Bank',
  INFY: 'Infosys', ICICIBANK: 'ICICI Bank', SBIN: 'State Bank of India', BHARTIARTL: 'Bharti Airtel',
  ITC: 'ITC Limited', WIPRO: 'Wipro', MARUTI: 'Maruti Suzuki'
};

const BASE_PRICES = {
  RELIANCE: 2800, TCS: 3800, HDFCBANK: 1700, INFY: 1800, ICICIBANK: 1100,
  SBIN: 800, BHARTIARTL: 950, KOTAKBANK: 1800, LT: 3500, HINDUNILVR: 2500,
  BAJFINANCE: 6500, ASIANPAINT: 3000, MARUTI: 10000, WIPRO: 500, TITAN: 3500,
  SUNPHARMA: 1400, TATASTEEL: 150, HDFC: 2800, ADANIPORTS: 1200, NTPC: 350,
  POWERGRID: 280, ONGC: 250, COALINDIA: 350, GRASIM: 2800, SBILIFE: 1400,
  BPCL: 400, CIPLA: 1300, EICHERMOT: 3800, DRREDDY: 5500, INDUSINDBK: 1400,
  ITC: 450, NIFTY: 22000, BANKNIFTY: 48000
};

const LOT_SIZES = {
  RELIANCE: 250, TCS: 175, HDFCBANK: 400, INFY: 400, ICICIBANK: 700,
  SBIN: 1500, BHARTIARTL: 950, KOTAKBANK: 400, LT: 300, NIFTY: 50, BANKNIFTY: 15,
  MARUTI: 50, BAJFINANCE: 125, ASIANPAINT: 200, TITAN: 175
};

const getLotSize = (symbol) => {
  if (symbol.startsWith('NIFTY')) return 50;
  if (symbol.startsWith('BANKNIFTY')) return 15;
  return LOT_SIZES[symbol] || 1;
};

const TIMEFRAME_MAP = {
  '1m': { period: '1d', interval: '1m' },
  '5m': { period: '5d', interval: '5m' },
  '15m': { period: '5d', interval: '15m' },
  '1d': { period: '1mo', interval: '1d' },
  '1D': { period: '1mo', interval: '1d' },
  '1w': { period: '3mo', interval: '1wk' },
  '1W': { period: '3mo', interval: '1wk' },
  '1mo': { period: '1y', interval: '1mo' },
  '1M': { period: '1y', interval: '1mo' },
  '1mo_legacy': { period: '1mo', interval: '1d' },
  '5d': { period: '5d', interval: '5m' },
  '3mo': { period: '3mo', interval: '1d' },
  '1y': { period: '1y', interval: '1wk' }
};

const getYahooSymbol = (symbol, exchange = 'NSE') => {
  const sym = symbol.toUpperCase().replace(/\.(NS|BO)$/, '');
  return exchange === 'BSE' ? `${sym}.BO` : `${sym}.NS`;
};

const { enrichStock, SECTORS, filterBySector, filterByMarketCap, findByIsin, WATCHLIST_TEMPLATES } = require('../data/stockMetadata');

const enrichQuote = (data) => {
  if (!data) return data;
  const meta = enrichStock({ symbol: data.symbol });
  const prev = data.prevClose || data.previousClose || data.ltp || 0;
  const lotSizeFo = data.lotSize || getLotSize(data.symbol);
  const ltp = data.ltp || 0;
  const freezeLots = 100;
  return {
    ...data,
    name: data.name || meta.name || data.symbol,
    companyName: data.name || meta.name || data.symbol,
    sector: meta.sector,
    isin: meta.isin,
    marketCap: data.marketCapLabel || meta.marketCap,
    peRatio: data.peRatio ?? null,
    dividendYield: data.dividendYield ?? null,
    upperCircuit: data.upperCircuit || parseFloat((prev * 1.2).toFixed(2)),
    lowerCircuit: data.lowerCircuit || parseFloat((prev * 0.8).toFixed(2)),
    lotSize: lotSizeFo,
    lotSizeCnc: 1,
    lotSizeMis: lotSizeFo,
    lotSizeNrml: lotSizeFo,
    lotValue: parseFloat((ltp * lotSizeFo).toFixed(2)),
    lotValueCnc: parseFloat(ltp.toFixed(2)),
    freezeQtyLots: freezeLots,
    freezeQtyShares: freezeLots * lotSizeFo
  };
};

const getMockQuote = (symbol, exchange = 'NSE') => {
  let basePrice = BASE_PRICES[symbol] || 1000;
  if (symbol.includes('CE') || symbol.includes('PE')) {
     basePrice = 150; // Mock premium for options
  }
  const variation = (Math.random() - 0.5) * 0.02 * basePrice;
  const ltp = basePrice + variation;
  const change = variation;
  const changePercent = (change / basePrice) * 100;

  return {
    symbol,
    exchange,
    ltp: parseFloat(ltp.toFixed(2)),
    open: parseFloat((basePrice * 0.99).toFixed(2)),
    high: parseFloat((ltp * 1.01).toFixed(2)),
    low: parseFloat((ltp * 0.99).toFixed(2)),
    volume: Math.floor(Math.random() * 10000000) + 1000000,
    prevClose: parseFloat((basePrice * 0.998).toFixed(2)),
    change: parseFloat(change.toFixed(2)),
    changePercent: parseFloat(changePercent.toFixed(2)),
    week52High: parseFloat((basePrice * 1.2).toFixed(2)),
    week52Low: parseFloat((basePrice * 0.8).toFixed(2)),
    lotSize: getLotSize(symbol),
    timestamp: new Date().toISOString()
  };
};

const fetchNseQuote = async (symbol) => {
  if (!nseIndia) return null;
  try {
    const details = await nseIndia.getEquityDetails(symbol);
    const priceInfo = details?.priceInfo || details?.metadata || {};
    const ltp = parseFloat(priceInfo.lastPrice || priceInfo.lp || 0);
    if (!ltp) return null;

    return {
      symbol,
      exchange: 'NSE',
      ltp,
      open: parseFloat(priceInfo.open || ltp),
      high: parseFloat(priceInfo.intraDayHighLow?.max || priceInfo.dayHigh || ltp),
      low: parseFloat(priceInfo.intraDayHighLow?.min || priceInfo.dayLow || ltp),
      volume: parseInt(priceInfo.totalTradedVolume || 0, 10),
      prevClose: parseFloat(priceInfo.previousClose || ltp),
      change: parseFloat(priceInfo.change || 0),
      changePercent: parseFloat(priceInfo.pChange || 0),
      week52High: parseFloat(priceInfo.weekHighLow?.max || ltp * 1.2),
      week52Low: parseFloat(priceInfo.weekHighLow?.min || ltp * 0.8),
      lotSize: getLotSize(symbol),
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    return null;
  }
};

const fetchYahooQuote = async (symbol, exchange = 'NSE') => {
  const yf = await loadYahooFinance();
  if (!yf?.quote) return null;
  try {
    const quote = await yf.quote(getYahooSymbol(symbol, exchange));
    return {
      symbol: symbol.toUpperCase(),
      exchange,
      ltp: quote.regularMarketPrice || 0,
      open: quote.regularMarketOpen || 0,
      high: quote.regularMarketDayHigh || 0,
      low: quote.regularMarketDayLow || 0,
      volume: quote.regularMarketVolume || 0,
      prevClose: quote.regularMarketPreviousClose || 0,
      change: quote.regularMarketChange || 0,
      changePercent: quote.regularMarketChangePercent || 0,
      week52High: quote.fiftyTwoWeekHigh || 0,
      week52Low: quote.fiftyTwoWeekLow || 0,
      lotSize: getLotSize(symbol),
      peRatio: quote.trailingPE != null ? parseFloat(Number(quote.trailingPE).toFixed(2)) : null,
      dividendYield:
        quote.dividendYield != null ? parseFloat((Number(quote.dividendYield) * 100).toFixed(2)) : null,
      marketCapLabel: quote.marketCap ? 'Large' : null,
      timestamp: new Date().toISOString()
    };
  } catch {
    return null;
  }
};

const getStockQuote = async (symbol, exchange = 'NSE') => {
  const sym = symbol.toUpperCase().replace(/\.(NS|BO)$/, '');
  const cacheKey = `${exchange}:${sym}`;

  const cached = await getCachedPrice(cacheKey);
  if (cached) return cached;

  let data = null;
  if (exchange === 'NSE') {
    data = await fetchNseQuote(sym);
  }
  if (!data) {
    data = await fetchYahooQuote(sym, exchange);
  }
  if (!data && exchange === 'NSE') {
    data = await fetchYahooQuote(sym, 'BSE');
    if (data) data.exchange = 'BSE';
  }
  if (!data) {
    data = getMockQuote(sym, exchange);
  }

  data = enrichQuote(data);
  await cachePrice(cacheKey, data);
  return data;
};

const getMultipleQuotes = async (symbols, exchange = 'NSE') => {
  const results = await Promise.all(
    symbols.slice(0, 50).map((symbol) => getStockQuote(symbol, exchange))
  );
  return results.filter(Boolean);
};

const fetchNseStockList = async () => {
  if (!nseIndia) {
    return NSE_SYMBOLS.map((symbol) => ({
      symbol,
      name: STOCK_NAMES[symbol] || symbol,
      exchange: 'NSE',
      lotSize: getLotSize(symbol)
    }));
  }

  try {
    const preOpen = await nseIndia.getPreOpenMarketData();
    const rows = (preOpen?.data || [])
      .filter((item) => {
        const series = item?.metadata?.series;
        return item?.metadata?.symbol && (!series || series === 'EQ');
      })
      .map((item) => ({
        symbol: item.metadata.symbol.toUpperCase(),
        name: item.metadata.companyName || item.metadata.symbol,
        exchange: 'NSE',
        lotSize: getLotSize(item.metadata.symbol.toUpperCase())
      }));

    if (rows.length > 0) return rows;
  } catch (err) {
    console.error('NSE stock list fetch failed:', err.message);
  }

  try {
    const symbols = await nseIndia.getAllStockSymbols();
    return symbols.map((symbol) => ({
      symbol: symbol.toUpperCase(),
      name: STOCK_NAMES[symbol] || symbol,
      exchange: 'NSE',
      lotSize: getLotSize(symbol)
    }));
  } catch (err) {
    console.error('NSE symbols fallback failed:', err.message);
    return NSE_SYMBOLS.map((symbol) => ({
      symbol,
      name: STOCK_NAMES[symbol] || symbol,
      exchange: 'NSE',
      lotSize: getLotSize(symbol)
    }));
  }
};

const fetchBseStockList = async () => {
  try {
    const url = new URL('https://api.bseindia.com/BseIndiaAPI/api/ListofScripData/w');
    url.searchParams.set('Group', '');
    url.searchParams.set('Scripcode', '');
    url.searchParams.set('industry', '');
    url.searchParams.set('segment', 'Equity');
    url.searchParams.set('status', 'Active');

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Referer: 'https://www.bseindia.com/'
      },
      signal: AbortSignal.timeout(45000)
    });

    if (!response.ok) throw new Error(`BSE API ${response.status}`);
    const data = await response.json();

    if (!Array.isArray(data)) return [];

    const seen = new Set();
    const stocks = [];

    for (const item of data) {
      const rawSymbol = (item.scrip_id || item.SCRIP_CD || '').toString().trim().toUpperCase();
      if (!rawSymbol || seen.has(rawSymbol)) continue;
      seen.add(rawSymbol);

      stocks.push({
        symbol: rawSymbol,
        name: (item.Scrip_Name || item.Issuer_Name || rawSymbol).trim(),
        exchange: 'BSE',
        bseCode: item.SCRIP_CD,
        lotSize: getLotSize(rawSymbol)
      });
    }

    return stocks;
  } catch (err) {
    console.error('BSE stock list fetch failed:', err.message);
    return BSE_SYMBOLS.map((symbol) => ({
      symbol,
      name: STOCK_NAMES[symbol] || symbol,
      exchange: 'BSE',
      lotSize: getLotSize(symbol)
    }));
  }
};

const buildFullStockList = async () => {
  const [nseStocks, bseStocks] = await Promise.all([
    fetchNseStockList(),
    fetchBseStockList()
  ]);
  return [...nseStocks, ...bseStocks];
};

const searchStocks = async (query, options = {}) => {
  const { exchange, limit = 50, offset = 0, sector, marketCap, isin, lotFilter } = options;
  const queryLower = (query || '').toLowerCase().trim();
  let symbols = (await getStockList()).map(enrichStock);

  if (exchange && exchange !== 'ALL') {
    const ex = exchange.toUpperCase();
    symbols = symbols.filter((s) => s.exchange === ex);
  }
  if (sector) symbols = filterBySector(symbols, sector);
  if (marketCap) symbols = filterByMarketCap(symbols, marketCap);

  let filtered = symbols;
  if (isin) {
    filtered = findByIsin(symbols, isin);
  } else if (queryLower) {
    filtered = symbols.filter(
      (s) =>
        s.symbol.toLowerCase().includes(queryLower) ||
        (s.name && s.name.toLowerCase().includes(queryLower)) ||
        (s.isin && s.isin.toLowerCase().includes(queryLower))
    );
  }

  if (lotFilter === 'eq1') {
    filtered = filtered.filter((s) => (s.lotSize || 1) === 1);
  } else if (lotFilter === 'gt1') {
    filtered = filtered.filter((s) => (s.lotSize || 1) > 1);
  }

  const start = Math.max(0, offset);
  const end = start + limit;
  const items = filtered.slice(start, end);

  return {
    items,
    total: filtered.length,
    offset: start,
    limit,
    hasMore: end < filtered.length
  };
};

const getSectorList = () => SECTORS;

const getWatchlistTemplates = () =>
  Object.entries(WATCHLIST_TEMPLATES).map(([key, t]) => ({ key, name: t.name, count: t.symbols.length }));

const { INDEX_CONSTITUENTS } = require('../data/stockMetadata');

const getIndexConstituents = async (key) => {
  const pack = INDEX_CONSTITUENTS[key];
  if (!pack) return null;
  const quotes = await getMultipleQuotes(pack.symbols);
  const constituents = pack.symbols.map((symbol) => {
    const meta = enrichStock({ symbol, exchange: 'NSE' });
    const q = quotes.find((row) => row?.symbol === symbol);
    return {
      ...meta,
      ltp: q?.ltp ?? null,
      change: q?.change ?? null,
      changePercent: q?.changePercent ?? null
    };
  });
  return { key, name: pack.name, constituents };
};

const POPULAR_SEARCHES = ['RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'NIFTY', 'SBIN', 'ITC', 'ICICIBANK'];

const getPopularSearches = () => POPULAR_SEARCHES;

const getStockList = async () => {
  const cached = await getCachedStockList();
  if (cached?.length) return cached;

  if (memoryStockList?.length && Date.now() - memoryStockListAt < MEMORY_LIST_TTL_MS) {
    return memoryStockList;
  }

  const stocks = await buildFullStockList();
  memoryStockList = stocks;
  memoryStockListAt = Date.now();
  await cacheStockList(stocks);
  return stocks;
};

const getHistoricalData = async (symbol, period = '1mo', interval = null) => {
  const sym = symbol.toUpperCase().replace(/\.(NS|BO)$/, '');
  const config = TIMEFRAME_MAP[period] || TIMEFRAME_MAP['1d'];
  const useInterval = interval || config.interval;
  const usePeriod = config.period;

  const yf = await loadYahooFinance();
  if (!yf?.chart) {
    return getMockHistoricalData(sym, period);
  }

  try {
    const { period1, period2, interval } = getChartRange(period);
    const result = await yf.chart(getYahooSymbol(sym, 'NSE'), {
      period1,
      period2,
      interval: interval || useInterval
    });

    const mapped = mapChartQuotes(result?.quotes);
    if (mapped.length > 0) return mapped;

    return getMockHistoricalData(sym, usePeriod);
  } catch (err) {
    console.error(`Historical data error for ${sym}:`, err.message);
    return getMockHistoricalData(sym, usePeriod);
  }
};

const getMockHistoricalData = (symbol, period) => {
  const basePrice = BASE_PRICES[symbol] || 1000;
  const periodDays = { '1d': 390, '5d': 75, '1mo': 22, '3mo': 66, '1y': 252 };
  const points = periodDays[period] || 90;

  const data = [];
  let currentDate = new Date();
  currentDate.setDate(currentDate.getDate() - Math.min(points, 90));

  for (let i = 0; i < points; i++) {
    const price = basePrice + (Math.random() - 0.5) * 0.1 * basePrice;
    const open = price - Math.random() * 0.02 * basePrice;
    const close = price + (Math.random() - 0.5) * 0.02 * basePrice;
    const high = Math.max(open, close) + Math.random() * 0.01 * basePrice;
    const low = Math.min(open, close) - Math.random() * 0.01 * basePrice;

    const timeSec = Math.floor(new Date(currentDate).getTime() / 1000);
    const o = parseFloat(open.toFixed(2));
    const c = parseFloat(close.toFixed(2));
    const h = parseFloat(Math.max(high, o, c).toFixed(2));
    const l = parseFloat(Math.min(low, o, c).toFixed(2));

    data.push({
      time: timeSec,
      open: o,
      high: h,
      low: l,
      close: c,
      volume: Math.floor(Math.random() * 5000000) + 500000
    });

    const intraday = ['1m', '5m', '15m', '1d', '5d'].includes(period);
    if (intraday) {
      currentDate = new Date(currentDate.getTime() + 5 * 60 * 1000);
    } else {
      currentDate.setDate(currentDate.getDate() + 1);
      while (currentDate.getDay() === 0 || currentDate.getDay() === 6) {
        currentDate.setDate(currentDate.getDate() + 1);
      }
    }
  }

  return data;
};

const getUniverseQuotes = async () => {
  const { NIFTY_50 } = require('../data/stockMetadata');
  const symbols = [...new Set([...NIFTY_50, ...NSE_SYMBOLS])];
  return (await getMultipleQuotes(symbols)).filter(Boolean);
};

const getTopGainers = async () => {
  const quotes = await getUniverseQuotes();
  return quotes
    .filter((q) => q.changePercent > 0)
    .sort((a, b) => b.changePercent - a.changePercent)
    .slice(0, 10);
};

const getTopLosers = async () => {
  const quotes = await getUniverseQuotes();
  return quotes
    .filter((q) => q.changePercent < 0)
    .sort((a, b) => a.changePercent - b.changePercent)
    .slice(0, 10);
};

const mapMoverRow = (q, tag) => ({
  symbol: q.symbol,
  name: q.name || q.companyName || q.symbol,
  ltp: q.ltp,
  changePercent: q.changePercent,
  week52High: q.week52High,
  week52Low: q.week52Low,
  upperCircuit: q.upperCircuit,
  lowerCircuit: q.lowerCircuit,
  lotSize: q.lotSize || 1,
  tag
});

const getWeek52Movers = (quotes) => {
  const high = quotes
    .filter((q) => q.week52High && q.ltp >= q.week52High * 0.985)
    .sort((a, b) => b.ltp / b.week52High - a.ltp / a.week52High)
    .slice(0, 15)
    .map((q) => mapMoverRow(q, '52w_high'));
  const low = quotes
    .filter((q) => q.week52Low && q.ltp <= q.week52Low * 1.015)
    .sort((a, b) => a.ltp / a.week52Low - b.ltp / b.week52Low)
    .slice(0, 15)
    .map((q) => mapMoverRow(q, '52w_low'));
  return {
    week52High: high,
    week52Low: low,
    counts: { high: high.length, low: low.length }
  };
};

const getCircuitStocks = (quotes) => {
  const upper = quotes
    .filter((q) => q.upperCircuit && q.ltp >= q.upperCircuit * 0.995)
    .sort((a, b) => b.changePercent - a.changePercent)
    .slice(0, 15)
    .map((q) => mapMoverRow(q, 'upper_circuit'));
  const lower = quotes
    .filter((q) => q.lowerCircuit && q.ltp <= q.lowerCircuit * 1.005)
    .sort((a, b) => a.changePercent - b.changePercent)
    .slice(0, 15)
    .map((q) => mapMoverRow(q, 'lower_circuit'));
  return {
    upperCircuit: upper,
    lowerCircuit: lower,
    counts: { upper: upper.length, lower: lower.length }
  };
};

const getCorporateActionsCalendar = async (extraSymbols = [], { forceRefresh = false } = {}) => {
  const { getLiveCorporateActions } = require('./nseLiveFeeds');
  const { actions } = await getLiveCorporateActions(extraSymbols, { forceRefresh });
  const today = new Date().toISOString().slice(0, 10);
  return actions.filter((a) => a.exDate >= today).sort((a, b) => a.exDate.localeCompare(b.exDate));
};

const getMarketDataHub = async () => {
  const quotes = await getUniverseQuotes();
  const [status, indices, gainers, losers, overview] = await Promise.all([
    Promise.resolve(getMarketStatus()),
    getIndices(),
    getTopGainers(),
    getTopLosers(),
    getMarketOverview()
  ]);

  const week52 = getWeek52Movers(quotes);
  const circuits = getCircuitStocks(quotes);
  const calendars = require('../data/marketCalendars').getAllCalendars();
  const [corporateActions, fiiDii] = await Promise.all([
    getCorporateActionsCalendar(),
    require('./nseLiveFeeds').getFiiDii()
  ]);
  const sectoralIndices = indices.filter((idx) =>
    SECTORAL_INDEX_LABELS.includes(idx.symbol)
  );

  return {
    status,
    indices,
    sectoralIndices,
    gainers,
    losers,
    overview,
    week52,
    circuits,
    corporateActions,
    calendars,
    bulkDeals: calendars.bulkDeals,
    fiiDii,
    corporateActionsSource: corporateActions[0]?.source || 'education_calendar',
    disclaimer:
      'Market data hub uses Nifty universe quotes with live/simulated indices. FII/DII and corp actions from NSE when available; IPO/lot calendars may be educational.'
  };
};

const getMarketOverview = async () => {
  const quotes = await getUniverseQuotes();
  let advances = 0;
  let declines = 0;
  let unchanged = 0;
  for (const q of quotes) {
    const ch = q.changePercent || 0;
    if (ch > 0.05) advances += 1;
    else if (ch < -0.05) declines += 1;
    else unchanged += 1;
  }
  const mapRow = (q) => ({
    symbol: q.symbol,
    ltp: q.ltp,
    changePercent: q.changePercent,
    volume: q.volume || 0,
    lotSize: q.lotSize || 1,
    turnover: parseFloat(((q.ltp || 0) * (q.volume || 0)).toFixed(0))
  });
  const byVolume = [...quotes].sort((a, b) => (b.volume || 0) - (a.volume || 0)).slice(0, 12).map(mapRow);
  const byValue = [...quotes]
    .sort((a, b) => (b.ltp || 0) * (b.volume || 0) - (a.ltp || 0) * (a.volume || 0))
    .slice(0, 12)
    .map(mapRow);
  const byLots = [...quotes]
    .filter((q) => (q.lotSize || 1) > 1)
    .sort((a, b) => (b.volume || 0) - (a.volume || 0))
    .slice(0, 12)
    .map(mapRow);
  return {
    breadth: { advances, declines, unchanged, total: quotes.length },
    mostActiveByVolume: byVolume,
    mostActiveByValue: byValue,
    mostActiveByLots: byLots,
    disclaimer: 'Breadth and most-active are computed from Nifty 50 universe (paper trading).'
  };
};

const INDEX_TARGETS = [
  { label: 'NIFTY 50', nseKeys: ['NIFTY 50', 'NIFTY50'], yahoo: '^NSEI', base: 22500 },
  { label: 'NIFTY BANK', nseKeys: ['NIFTY BANK', 'NIFTYBANK'], yahoo: '^NSEBANK', base: 48000 },
  { label: 'SENSEX', nseKeys: ['SENSEX', 'BSE SENSEX'], yahoo: '^BSESN', base: 74000 },
  { label: 'NIFTY MIDCAP', nseKeys: ['NIFTY MIDCAP', 'NIFTY MIDCAP 100', 'NIFTYMIDCAP'], yahoo: null, base: 11800 },
  { label: 'NIFTY SMALLCAP', nseKeys: ['NIFTY SMALLCAP', 'NIFTY SMALLCAP 250'], yahoo: null, base: 17500 },
  { label: 'NIFTY IT', nseKeys: ['NIFTY IT'], yahoo: null, base: 35200 },
  { label: 'NIFTY AUTO', nseKeys: ['NIFTY AUTO'], yahoo: null, base: 21800 },
  { label: 'NIFTY PHARMA', nseKeys: ['NIFTY PHARMA'], yahoo: null, base: 20500 },
  { label: 'NIFTY FMCG', nseKeys: ['NIFTY FMCG'], yahoo: null, base: 56000 },
  { label: 'NIFTY METAL', nseKeys: ['NIFTY METAL'], yahoo: null, base: 9200 }
];

const SECTORAL_INDEX_LABELS = [
  'NIFTY IT',
  'NIFTY BANK',
  'NIFTY AUTO',
  'NIFTY PHARMA',
  'NIFTY FMCG',
  'NIFTY METAL'
];

const stableSimulatedIndex = ({ label, base }) => {
  const hourSeed = Math.floor(Date.now() / (15 * 60 * 1000));
  const drift = Math.sin(hourSeed + label.length) * 0.004;
  const ltp = parseFloat((base * (1 + drift)).toFixed(2));
  const change = parseFloat((ltp - base).toFixed(2));
  const changePercent = parseFloat((drift * 100).toFixed(2));
  return { symbol: label, ltp, change, changePercent, source: 'simulated' };
};

const fetchIndicesFromNse = async () => {
  if (!nseIndia?.getAllIndices) return null;
  try {
    const payload = await nseIndia.getAllIndices();
    const rows = payload?.data || payload || [];
    if (!Array.isArray(rows) || rows.length === 0) return null;

    const findRow = (keys) =>
      rows.find((r) => {
        const name = String(r.index || r.indexSymbol || r.symbol || r.key || '').toUpperCase();
        return keys.some((k) => name.includes(k.replace(/\s/g, '')) || name === k.toUpperCase());
      });

    const mapped = INDEX_TARGETS.map((target) => {
      const row = findRow(target.nseKeys);
      if (!row) return null;
      const ltp = parseFloat(row.last ?? row.lastPrice ?? row.ltp ?? row.current ?? 0);
      if (!ltp) return null;
      const change = parseFloat(row.variation ?? row.change ?? row.pChange ?? 0);
      const changePercent = parseFloat(
        row.percentChange ?? row.pChange ?? row.changePercent ?? (ltp ? (change / ltp) * 100 : 0)
      );
      return {
        symbol: target.label,
        ltp,
        change,
        changePercent,
        source: 'nse'
      };
    }).filter(Boolean);

    return mapped.length >= 2 ? mapped : null;
  } catch {
    return null;
  }
};

const fetchIndicesFromYahoo = async () => {
  const yf = await loadYahooFinance();
  if (!yf?.quote) return null;

  const results = await Promise.all(
    INDEX_TARGETS.map(async ({ yahoo, label }) => {
      try {
        const quote = await yf.quote(yahoo);
        if (!quote?.regularMarketPrice) return null;
        return {
          symbol: label,
          ltp: quote.regularMarketPrice,
          change: quote.regularMarketChange ?? 0,
          changePercent: quote.regularMarketChangePercent ?? 0,
          source: 'live'
        };
      } catch {
        return null;
      }
    })
  );
  const filtered = results.filter(Boolean);
  return filtered.length >= 2 ? filtered : null;
};

const getIndices = async () => {
  const fromNse = await fetchIndicesFromNse();
  if (fromNse?.length) return fromNse;

  const fromYahoo = await fetchIndicesFromYahoo();
  if (fromYahoo?.length) return fromYahoo;

  return INDEX_TARGETS.map(stableSimulatedIndex);
};

const getIstMinutes = () => {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + now.getTimezoneOffset() * 60000 + istOffset);
  return {
    day: istTime.getDay(),
    currentMins: istTime.getHours() * 60 + istTime.getMinutes()
  };
};

const getMarketPhase = () => {
  const { day, currentMins } = getIstMinutes();
  if (day === 0 || day === 6) return 'closed';
  const preOpenStart = 9 * 60;
  const marketStart = 9 * 60 + 15;
  const marketEnd = 15 * 60 + 30;
  if (currentMins >= preOpenStart && currentMins < marketStart) return 'pre-open';
  if (currentMins >= marketStart && currentMins <= marketEnd) return 'open';
  return 'closed';
};

const isMarketOpen = () => getMarketPhase() === 'open';

const getMarketStatus = () => {
  const phase = getMarketPhase();
  const open = phase === 'open';
  const preOpen = phase === 'pre-open';
  const message = open
    ? 'Market is open'
    : preOpen
      ? 'Pre-open session'
      : 'Market is closed';

  return {
    isOpen: open,
    phase,
    preOpen,
    message,
    nextOpen: getNextMarketOpen(),
    nextClose: getNextMarketClose()
  };
};

const getNextMarketOpen = () => {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const ist = new Date(now.getTime() + (now.getTimezoneOffset() * 60000) + istOffset);

  ist.setHours(9, 15, 0, 0);
  if (ist <= now || ist.getDay() === 0 || ist.getDay() === 6) {
    ist.setDate(ist.getDate() + 1);
    while (ist.getDay() === 0 || ist.getDay() === 6) ist.setDate(ist.getDate() + 1);
  }
  return ist.toISOString();
};

const getNextMarketClose = () => {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const ist = new Date(now.getTime() + (now.getTimezoneOffset() * 60000) + istOffset);

  ist.setHours(15, 30, 0, 0);
  if (ist <= now) {
    ist.setDate(ist.getDate() + 1);
    while (ist.getDay() === 0 || ist.getDay() === 6) ist.setDate(ist.getDate() + 1);
  }
  return ist.toISOString();
};

let priceUpdateInterval = null;
const startMarketDataCron = (io) => {
  if (priceUpdateInterval) return;

  priceUpdateInterval = setInterval(async () => {
    try {
      const quotes = await getMultipleQuotes(POLL_SYMBOLS);

      try {
        const { processQuotesForLotChanges } = require('./lotChangeAlerts');
        await processQuotesForLotChanges(quotes);
      } catch {
        /* errors logged inside lotChangeAlerts with cooldown */
      }

      io.emit('priceUpdate', { quotes, timestamp: new Date().toISOString(), marketStatus: getMarketStatus() });

      const indices = await getIndices();
      io.emit('indexUpdate', { indices, timestamp: new Date().toISOString(), marketStatus: getMarketStatus() });
    } catch (err) {
      console.error('Price update error:', err.message);
    }
  }, 15000);

  console.log('✓ Market data cron started (15s interval)');

  setTimeout(() => {
    const { getLiveCorporateActions, getFiiDii } = require('./nseLiveFeeds');
    getFiiDii().catch(() => {});
    getLiveCorporateActions([], { forceRefresh: true }).catch((err) =>
      console.warn('Corp actions warm cache:', err.message)
    );
  }, 15000);
};


const { getOptionChain, getOptionExpiries } = require('./optionChain');

const getSectorAnalytics = async () => {
  const { NIFTY_50 } = require('../data/stockMetadata');
  const quotes = await getMultipleQuotes(NIFTY_50);
  const grouped = {};

  for (const q of quotes.filter(Boolean)) {
    const meta = enrichStock({ symbol: q.symbol });
    const sector = meta.sector || 'Other';
    if (!grouped[sector]) {
      grouped[sector] = { sector, stocks: [], totalChange: 0, count: 0 };
    }
    grouped[sector].stocks.push({
      symbol: q.symbol,
      ltp: q.ltp,
      changePercent: q.changePercent || 0,
      volume: q.volume || 0
    });
    grouped[sector].totalChange += q.changePercent || 0;
    grouped[sector].count += 1;
  }

  return Object.values(grouped)
    .map((g) => {
      const sorted = g.stocks.sort((a, b) => (b.changePercent || 0) - (a.changePercent || 0));
      return {
        sector: g.sector,
        count: g.count,
        avgChangePercent: g.count ? parseFloat((g.totalChange / g.count).toFixed(2)) : 0,
        topGainer: sorted[0] || null,
        topLoser: sorted[sorted.length - 1] || null,
        stocks: sorted
      };
    })
    .sort((a, b) => b.avgChangePercent - a.avgChangePercent);
};

module.exports = {
  getOptionChain,
  getOptionExpiries,
  getStockQuote,
  getMultipleQuotes,
  searchStocks,
  getStockList,
  getHistoricalData,
  getTopGainers,
  getTopLosers,
  getIndices,
  startMarketDataCron,
  isMarketOpen,
  getMarketPhase,
  getMarketStatus,
  getSectorList,
  getWatchlistTemplates,
  getIndexConstituents,
  getPopularSearches,
  getSectorAnalytics,
  getMarketOverview,
  getMarketDataHub,
  getWeek52Movers,
  getCircuitStocks,
  getCorporateActionsCalendar,
  getLotSize
};
