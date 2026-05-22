const marketService = require('../services/marketData');
const { z } = require('zod');

const getQuote = async (req, res, next) => {
  try {
    const { symbol } = req.params;
    const exchange = (req.query.exchange || 'NSE').toUpperCase();
    const quote = await marketService.getStockQuote(symbol.toUpperCase(), exchange);
    if (!quote) {
      return res.status(404).json({ error: 'Stock not found' });
    }
    res.json(quote);
  } catch (err) {
    next(err);
  }
};

const getMultipleQuotes = async (req, res, next) => {
  try {
    const { symbols } = req.body;
    const quotes = await marketService.getMultipleQuotes(symbols);
    res.json(quotes);
  } catch (err) {
    next(err);
  }
};

const searchStocks = async (req, res, next) => {
  try {
    const { q = '', exchange, limit, offset, sector, marketCap, isin, lotFilter } = req.query;
    const results = await marketService.searchStocks(q, {
      exchange: exchange || 'ALL',
      limit: Math.min(parseInt(limit, 10) || 50, 100),
      offset: Math.max(0, parseInt(offset, 10) || 0),
      sector: sector || undefined,
      marketCap: marketCap || undefined,
      isin: isin || undefined,
      lotFilter: lotFilter || undefined
    });
    if (req.user?.id && q?.trim()) {
      const recentSearch = require('../services/recentSearch');
      recentSearch.recordSearch(req.user.id, { query: q.trim() }).catch(() => {});
    }
    res.json(results);
  } catch (err) {
    next(err);
  }
};

const getSectors = async (req, res, next) => {
  try {
    res.json(marketService.getSectorList());
  } catch (err) {
    next(err);
  }
};

const getPopularSearches = async (req, res, next) => {
  try {
    res.json(marketService.getPopularSearches());
  } catch (err) {
    next(err);
  }
};

const getRecentSearches = async (req, res, next) => {
  try {
    const recentSearch = require('../services/recentSearch');
    const rows = await recentSearch.getRecentSearches(req.user.id);
    res.json(rows);
  } catch (err) {
    next(err);
  }
};

const getSectorAnalytics = async (req, res, next) => {
  try {
    const data = await marketService.getSectorAnalytics();
    res.json(data);
  } catch (err) {
    next(err);
  }
};

const getStockList = async (req, res, next) => {
  try {
    const stocks = await marketService.getStockList();
    res.json(stocks);
  } catch (err) {
    next(err);
  }
};

const getHistorical = async (req, res, next) => {
  try {
    const { symbol } = req.params;
    const { period = '1d', interval } = req.query;
    const data = await marketService.getHistoricalData(symbol.toUpperCase(), period, interval);
    res.json(data);
  } catch (err) {
    next(err);
  }
};

const getTopGainers = async (req, res, next) => {
  try {
    const gainers = await marketService.getTopGainers();
    res.json(gainers);
  } catch (err) {
    next(err);
  }
};

const getTopLosers = async (req, res, next) => {
  try {
    const losers = await marketService.getTopLosers();
    res.json(losers);
  } catch (err) {
    next(err);
  }
};

const getIndices = async (req, res, next) => {
  try {
    const indices = await marketService.getIndices();
    res.json(indices);
  } catch (err) {
    next(err);
  }
};

const getMarketStatus = async (req, res, next) => {
  try {
    const status = marketService.getMarketStatus();
    res.json(status);
  } catch (err) {
    next(err);
  }
};

const getOptionChain = async (req, res, next) => {
  try {
    const { symbol } = req.params;
    const { expiry } = req.query;
    const chain = await marketService.getOptionChain(symbol.toUpperCase(), expiry || null);
    res.json(chain);
  } catch (err) {
    next(err);
  }
};

const getOptionExpiries = async (req, res, next) => {
  try {
    const { symbol } = req.params;
    const info = await marketService.getOptionExpiries(symbol.toUpperCase());
    res.json(info);
  } catch (err) {
    next(err);
  }
};

const getWatchlistTemplates = async (req, res, next) => {
  try {
    res.json(marketService.getWatchlistTemplates());
  } catch (err) {
    next(err);
  }
};

const getMarketOverview = async (req, res, next) => {
  try {
    res.json(await marketService.getMarketOverview());
  } catch (err) {
    next(err);
  }
};

const getMarketDataHub = async (req, res, next) => {
  try {
    res.json(await marketService.getMarketDataHub());
  } catch (err) {
    next(err);
  }
};

const getCalendars = async (req, res, next) => {
  try {
    const calendars = require('../data/marketCalendars').getAllCalendars();
    res.json(calendars);
  } catch (err) {
    next(err);
  }
};

const getCorporateActions = async (req, res, next) => {
  try {
    const symbols = req.query.symbols ? String(req.query.symbols).split(',').map((s) => s.trim()) : [];
    const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true';
    const actions = await marketService.getCorporateActionsCalendar(symbols, { forceRefresh });
    res.json({ actions, count: actions.length });
  } catch (err) {
    next(err);
  }
};

const getFiiDii = async (req, res, next) => {
  try {
    const data = await require('../services/nseLiveFeeds').getFiiDii();
    res.json(data);
  } catch (err) {
    next(err);
  }
};

const getIndexConstituents = async (req, res, next) => {
  try {
    const key = (req.params.key || '').toLowerCase();
    const pack = await marketService.getIndexConstituents(key);
    if (!pack) {
      return res.status(404).json({ error: 'Index pack not found' });
    }
    res.json(pack);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getQuote, getMultipleQuotes, searchStocks, getStockList,
  getHistorical, getTopGainers, getTopLosers, getIndices, getMarketStatus,
  getOptionChain, getOptionExpiries, getSectors, getPopularSearches, getRecentSearches,
  getSectorAnalytics,
  getWatchlistTemplates,
  getIndexConstituents,
  getMarketOverview,
  getMarketDataHub,
  getCalendars,
  getCorporateActions,
  getFiiDii
};