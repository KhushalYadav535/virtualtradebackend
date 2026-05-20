const portfolioService = require('../services/portfolio');

const getHoldings = async (req, res, next) => {
  try {
    const holdings = await portfolioService.getHoldings(req.user.id);
    res.json(holdings);
  } catch (err) {
    next(err);
  }
};

const getPortfolioSummary = async (req, res, next) => {
  try {
    const summary = await portfolioService.getPortfolioSummary(req.user.id);
    res.json(summary);
  } catch (err) {
    next(err);
  }
};

const getTradeHistory = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const history = await portfolioService.getTradeHistory(req.user.id, limit);
    res.json(history);
  } catch (err) {
    next(err);
  }
};

const getPerformance = async (req, res, next) => {
  try {
    const { days = 30 } = req.query;
    const performance = await portfolioService.getPortfolioPerformance(req.user.id, parseInt(days));
    res.json(performance);
  } catch (err) {
    next(err);
  }
};

const getTimeLoss = async (req, res, next) => {
  try {
    const period = req.query.period || 'month';
    const data = await portfolioService.getTimeLossAnalytics(req.user.id, period);
    res.json(data);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getHoldings,
  getPortfolioSummary,
  getTradeHistory,
  getPerformance,
  getTimeLoss
};