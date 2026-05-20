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
    const { q = '', exchange, limit, offset } = req.query;
    const results = await marketService.searchStocks(q, {
      exchange: exchange || 'ALL',
      limit: Math.min(parseInt(limit, 10) || 50, 100),
      offset: Math.max(0, parseInt(offset, 10) || 0)
    });
    res.json(results);
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

module.exports = {
  getQuote, getMultipleQuotes, searchStocks, getStockList,
  getHistorical, getTopGainers, getTopLosers, getIndices, getMarketStatus
};