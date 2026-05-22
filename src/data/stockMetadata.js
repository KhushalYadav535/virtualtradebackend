const NIFTY_50 = [
  'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'HINDUNILVR', 'ITC', 'SBIN', 'BHARTIARTL',
  'KOTAKBANK', 'LT', 'AXISBANK', 'ASIANPAINT', 'MARUTI', 'TITAN', 'SUNPHARMA', 'BAJFINANCE',
  'HCLTECH', 'WIPRO', 'ULTRACEMCO', 'NESTLEIND', 'TATAMOTORS', 'NTPC', 'POWERGRID', 'ONGC',
  'M&M', 'JSWSTEEL', 'TATASTEEL', 'ADANIENT', 'ADANIPORTS', 'COALINDIA', 'GRASIM', 'TECHM',
  'DIVISLAB', 'CIPLA', 'DRREDDY', 'EICHERMOT', 'HEROMOTOCO', 'INDUSINDBK', 'APOLLOHOSP',
  'BAJAJFINSV', 'BRITANNIA', 'HINDALCO', 'SBILIFE', 'HDFCLIFE', 'BPCL', 'TATACONSUM', 'UPL'
];

const BANK_NIFTY = [
  'HDFCBANK', 'ICICIBANK', 'KOTAKBANK', 'AXISBANK', 'SBIN', 'INDUSINDBK', 'BANDHANBNK',
  'FEDERALBNK', 'IDFCFIRSTB', 'PNB', 'AUBANK', 'BANKBARODA'
];

const SECTOR_MAP = {
  RELIANCE: 'Energy', TCS: 'IT', HDFCBANK: 'Banking', INFY: 'IT', ICICIBANK: 'Banking',
  HINDUNILVR: 'FMCG', ITC: 'FMCG', SBIN: 'Banking', BHARTIARTL: 'Telecom', KOTAKBANK: 'Banking',
  LT: 'Infrastructure', AXISBANK: 'Banking', ASIANPAINT: 'Consumer', MARUTI: 'Auto',
  TITAN: 'Consumer', SUNPHARMA: 'Pharma', BAJFINANCE: 'Finance', HCLTECH: 'IT', WIPRO: 'IT',
  ULTRACEMCO: 'Cement', NESTLEIND: 'FMCG', TATAMOTORS: 'Auto', NTPC: 'Power', POWERGRID: 'Power',
  ONGC: 'Energy', 'M&M': 'Auto', JSWSTEEL: 'Metals', TATASTEEL: 'Metals', ADANIENT: 'Conglomerate',
  ADANIPORTS: 'Infrastructure', COALINDIA: 'Mining', GRASIM: 'Chemicals', TECHM: 'IT',
  DIVISLAB: 'Pharma', CIPLA: 'Pharma', DRREDDY: 'Pharma', EICHERMOT: 'Auto', HEROMOTOCO: 'Auto',
  INDUSINDBK: 'Banking', APOLLOHOSP: 'Healthcare', BAJAJFINSV: 'Finance', BRITANNIA: 'FMCG',
  HINDALCO: 'Metals', SBILIFE: 'Insurance', HDFCLIFE: 'Insurance', BPCL: 'Energy',
  TATACONSUM: 'FMCG', UPL: 'Chemicals'
};

const ISIN_MAP = {
  RELIANCE: 'INE002A01018', TCS: 'INE467B01029', HDFCBANK: 'INE040A01034', INFY: 'INE009A01021',
  ICICIBANK: 'INE090A01021', ITC: 'INE154A01025', SBIN: 'INE062A01020', BHARTIARTL: 'INE397D01024',
  KOTAKBANK: 'INE237A01028', LT: 'INE018A01030', AXISBANK: 'INE238A01034', WIPRO: 'INE075A01022',
  HCLTECH: 'INE860A01027', TATAMOTORS: 'INE155A01022', MARUTI: 'INE585B01010', SUNPHARMA: 'INE044A01036',
  HINDUNILVR: 'INE030A01027', BAJFINANCE: 'INE296A01024', ASIANPAINT: 'INE021A01026',
  NTPC: 'INE733E01010', ONGC: 'INE213A01029', TATASTEEL: 'INE081A01020', TECHM: 'INE669C01036',
  NESTLEIND: 'INE239A01016', ULTRACEMCO: 'INE481G01011', DIVISLAB: 'INE361B01024', CIPLA: 'INE059A01026'
};

const NIFTY_100_EXTRA = [
  'LTIM', 'BANDHANBNK', 'FEDERALBNK', 'IDFCFIRSTB', 'PNB', 'BANKBARODA', 'AUBANK',
  'GODREJCP', 'DABUR', 'HAVELLS', 'PIDILITIND', 'AMBUJACEM', 'ACC', 'DLF', 'VEDL',
  'IRCTC', 'HAL', 'IOC', 'GAIL', 'TRENT', 'MARICO', 'COLPAL', 'BERGEPAINT', 'INDIGO',
  'JINDALSTEL', 'SRF', 'LUPIN', 'BIOCON', 'AUROPHARMA', 'TORNTPHARM', 'MUTHOOTFIN',
  'CHOLAFIN', 'SBICARD', 'SIEMENS', 'ABB', 'BOSCHLTD', 'UNITDSPR', 'SHREECEM'
];
const NIFTY_100 = [...new Set([...NIFTY_50, ...NIFTY_100_EXTRA])].slice(0, 100);

const WATCHLIST_TEMPLATES = {
  nifty50: { name: 'Nifty 50', symbols: NIFTY_50 },
  nifty100: { name: 'Nifty 100', symbols: NIFTY_100 },
  banknifty: { name: 'Bank Nifty', symbols: BANK_NIFTY },
  it: { name: 'IT Pack', symbols: ['TCS', 'INFY', 'WIPRO', 'HCLTECH', 'TECHM', 'LTIM'] },
  pharma: { name: 'Pharma Pack', symbols: ['SUNPHARMA', 'CIPLA', 'DRREDDY', 'DIVISLAB', 'APOLLOHOSP'] }
};

const INDEX_CONSTITUENTS = {
  nifty50: { name: 'Nifty 50', symbols: NIFTY_50 },
  nifty100: { name: 'Nifty 100', symbols: NIFTY_100 },
  banknifty: { name: 'Nifty Bank', symbols: BANK_NIFTY },
  it: { name: 'IT Sector Pack', symbols: WATCHLIST_TEMPLATES.it.symbols },
  pharma: { name: 'Pharma Pack', symbols: WATCHLIST_TEMPLATES.pharma.symbols }
};

const SECTORS = ['Banking', 'IT', 'Pharma', 'FMCG', 'Auto', 'Energy', 'Metals', 'Consumer', 'Finance'];

const hashMetric = (sym, salt = '') => {
  let h = 0;
  const s = `${sym}${salt}`;
  for (let i = 0; i < s.length; i++) h = (h + s.charCodeAt(i) * (i + 1)) % 1000;
  return h;
};

const enrichStock = (stock) => {
  const sym = (stock.symbol || '').toUpperCase();
  const sector = stock.sector || SECTOR_MAP[sym] || 'Other';
  const isin = stock.isin || ISIN_MAP[sym] || null;
  const marketCap = stock.marketCap || (NIFTY_50.includes(sym) ? 'Large' : 'Mid');
  const h = hashMetric(sym);
  const peRatio = stock.peRatio ?? parseFloat((12 + (h % 35)).toFixed(2));
  const pbRatio = stock.pbRatio ?? parseFloat((0.8 + ((h + 7) % 40) / 10).toFixed(2));
  const dividendYield = stock.dividendYield ?? parseFloat(((h % 8) / 2).toFixed(2));
  return { ...stock, sector, isin, marketCap, peRatio, pbRatio, dividendYield };
};

const filterBySector = (stocks, sector) => {
  if (!sector || sector === 'ALL') return stocks;
  return stocks.filter((s) => enrichStock(s).sector === sector);
};

const filterByMarketCap = (stocks, cap) => {
  if (!cap || cap === 'ALL') return stocks;
  return stocks.filter((s) => enrichStock(s).marketCap === cap);
};

const findByIsin = (stocks, isinQuery) => {
  const q = (isinQuery || '').toUpperCase().trim();
  if (!q) return [];
  return stocks.filter((s) => {
    const isin = enrichStock(s).isin;
    return isin && isin.toUpperCase().includes(q);
  });
};

module.exports = {
  NIFTY_50,
  NIFTY_100,
  BANK_NIFTY,
  SECTOR_MAP,
  ISIN_MAP,
  WATCHLIST_TEMPLATES,
  INDEX_CONSTITUENTS,
  SECTORS,
  enrichStock,
  filterBySector,
  filterByMarketCap,
  findByIsin
};
