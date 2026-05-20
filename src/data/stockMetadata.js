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
  HCLTECH: 'INE860A01027', TATAMOTORS: 'INE155A01022', MARUTI: 'INE585B01010', SUNPHARMA: 'INE044A01036'
};

const WATCHLIST_TEMPLATES = {
  nifty50: { name: 'Nifty 50', symbols: NIFTY_50 },
  banknifty: { name: 'Bank Nifty', symbols: BANK_NIFTY },
  it: { name: 'IT Pack', symbols: ['TCS', 'INFY', 'WIPRO', 'HCLTECH', 'TECHM', 'LTIM'] },
  pharma: { name: 'Pharma Pack', symbols: ['SUNPHARMA', 'CIPLA', 'DRREDDY', 'DIVISLAB', 'APOLLOHOSP'] }
};

const SECTORS = ['Banking', 'IT', 'Pharma', 'FMCG', 'Auto', 'Energy', 'Metals', 'Consumer', 'Finance'];

const enrichStock = (stock) => {
  const sym = (stock.symbol || '').toUpperCase();
  const sector = stock.sector || SECTOR_MAP[sym] || 'Other';
  const isin = stock.isin || ISIN_MAP[sym] || null;
  const marketCap = stock.marketCap || (NIFTY_50.includes(sym) ? 'Large' : 'Mid');
  return { ...stock, sector, isin, marketCap };
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
  BANK_NIFTY,
  SECTOR_MAP,
  ISIN_MAP,
  WATCHLIST_TEMPLATES,
  SECTORS,
  enrichStock,
  filterBySector,
  filterByMarketCap,
  findByIsin
};
