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
  ITC: 450
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

const getMockQuote = (symbol, exchange = 'NSE') => {
  const basePrice = BASE_PRICES[symbol] || 1000;
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
      exchange: 'NSE'
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
        exchange: 'NSE'
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
      exchange: 'NSE'
    }));
  } catch (err) {
    console.error('NSE symbols fallback failed:', err.message);
    return NSE_SYMBOLS.map((symbol) => ({
      symbol,
      name: STOCK_NAMES[symbol] || symbol,
      exchange: 'NSE'
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
        bseCode: item.SCRIP_CD
      });
    }

    return stocks;
  } catch (err) {
    console.error('BSE stock list fetch failed:', err.message);
    return BSE_SYMBOLS.map((symbol) => ({
      symbol,
      name: STOCK_NAMES[symbol] || symbol,
      exchange: 'BSE'
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
  const { exchange, limit = 50, offset = 0 } = options;
  const queryLower = (query || '').toLowerCase().trim();
  let symbols = await getStockList();

  if (exchange && exchange !== 'ALL') {
    const ex = exchange.toUpperCase();
    symbols = symbols.filter((s) => s.exchange === ex);
  }

  const filtered = queryLower
    ? symbols.filter(
        (s) =>
          s.symbol.toLowerCase().includes(queryLower) ||
          (s.name && s.name.toLowerCase().includes(queryLower))
      )
    : symbols;

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

const getTopGainers = async () => {
  const quotes = await getMultipleQuotes(NSE_SYMBOLS.slice(0, 25));
  return quotes
    .filter(q => q.changePercent > 0)
    .sort((a, b) => b.changePercent - a.changePercent)
    .slice(0, 10);
};

const getTopLosers = async () => {
  const quotes = await getMultipleQuotes(NSE_SYMBOLS.slice(0, 25));
  return quotes
    .filter(q => q.changePercent < 0)
    .sort((a, b) => a.changePercent - b.changePercent)
    .slice(0, 10);
};

const getIndices = async () => {
  const yf = await loadYahooFinance();
  if (!yf?.quote) {
    return [
      { symbol: 'NIFTY 50', ltp: 22500 + Math.random() * 500, change: Math.random() * 100 - 50, changePercent: Math.random() * 2 - 1 },
      { symbol: 'NIFTY BANK', ltp: 48000 + Math.random() * 1000, change: Math.random() * 200 - 100, changePercent: Math.random() * 2 - 1 }
    ];
  }

  const indices = ['^NSEI', '^NSEBANK'];
  const results = await Promise.all(
    indices.map(async (symbol) => {
      try {
        const quote = await yf.quote(symbol);
        return {
          symbol: symbol === '^NSEI' ? 'NIFTY 50' : 'NIFTY BANK',
          ltp: quote.regularMarketPrice,
          change: quote.regularMarketChange,
          changePercent: quote.regularMarketChangePercent
        };
      } catch {
        return null;
      }
    })
  );
  return results.filter(Boolean);
};

const isMarketOpen = () => {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + (now.getTimezoneOffset() * 60000) + istOffset);

  const day = istTime.getDay();
  if (day === 0 || day === 6) return false;

  const hours = istTime.getHours();
  const minutes = istTime.getMinutes();
  const currentMins = hours * 60 + minutes;

  const marketStart = 9 * 60 + 15;
  const marketEnd = 15 * 60 + 30;

  return currentMins >= marketStart && currentMins <= marketEnd;
};

const getMarketStatus = () => {
  const open = isMarketOpen();
  return {
    isOpen: open,
    message: open ? 'Market is open' : 'Market is closed',
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

      io.emit('priceUpdate', { quotes, timestamp: new Date().toISOString(), marketStatus: getMarketStatus() });

      const indices = await getIndices();
      io.emit('indexUpdate', { indices, timestamp: new Date().toISOString(), marketStatus: getMarketStatus() });
    } catch (err) {
      console.error('Price update error:', err.message);
    }
  }, 5000);

  console.log('✓ Market data cron started (5s interval)');
};

module.exports = {
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
  getMarketStatus
};
