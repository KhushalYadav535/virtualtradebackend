const portfolioService = require('../services/portfolio');
const intradayService = require('../services/intraday');

const getHoldings = async (req, res, next) => {
  try {
    const holdings = await portfolioService.getHoldings(req.user.id);
    res.json(holdings);
  } catch (err) {
    next(err);
  }
};

const getHoldingsDetail = async (req, res, next) => {
  try {
    const { sortBy, filter } = req.query;
    const data = await portfolioService.getHoldingsDetail(req.user.id, { sortBy, filter });
    res.json(data);
  } catch (err) {
    next(err);
  }
};

const getHoldingTrades = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const trades = await portfolioService.getHoldingTrades(
      req.user.id,
      req.params.symbol,
      limit
    );
    res.json(trades);
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
    const limit = parseInt(req.query.limit, 10) || 100;
    const history = await portfolioService.getTradeHistory(req.user.id, limit);
    res.json(history);
  } catch (err) {
    next(err);
  }
};

const tradeBookQueryOpts = (query) => ({
  limit: query.limit,
  side: query.side || 'all',
  symbol: query.symbol || query.q || '',
  dateFilter: query.dateFilter || query.date || 'all',
  from: query.from,
  to: query.to,
  lotFilter: query.lotFilter || 'all',
  product: query.product || 'all'
});

const getTradeBook = async (req, res, next) => {
  try {
    const data = await portfolioService.getTradeBook(req.user.id, tradeBookQueryOpts(req.query));
    res.json(data);
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

const getIntradayPositions = async (req, res, next) => {
  try {
    const positions = await intradayService.getPositionsForUser(req.user.id);
    res.json(positions);
  } catch (err) {
    next(err);
  }
};

const getPositionsDetail = async (req, res, next) => {
  try {
    const data = await intradayService.getPositionsDetail(req.user.id);
    res.json(data);
  } catch (err) {
    next(err);
  }
};

const getPositionHistory = async (req, res, next) => {
  try {
    const history = await intradayService.getPositionBuildHistory(
      req.user.id,
      req.params.symbol
    );
    res.json(history);
  } catch (err) {
    next(err);
  }
};

const squareOffPosition = async (req, res, next) => {
  try {
    const { symbol } = req.params;
    const qty = req.body?.qty != null ? parseInt(req.body.qty, 10) : null;
    const order = await intradayService.squareOffPosition(req.user.id, symbol, qty);
    const message =
      qty != null && !Number.isNaN(qty) ? 'Partial square-off executed' : 'Position squared off';
    res.json({ message, order });
  } catch (err) {
    next(err);
  }
};

const convertMisToCnc = async (req, res, next) => {
  try {
    const { symbol } = req.params;
    const qty = req.body?.qty != null ? parseInt(req.body.qty, 10) : null;
    const result = await intradayService.convertMisToCnc(req.user.id, symbol, qty);
    res.json({ message: 'Converted MIS position to CNC (delivery)', ...result });
  } catch (err) {
    next(err);
  }
};

const squareOffAllPositions = async (req, res, next) => {
  try {
    const orders = await intradayService.squareOffAll(req.user.id);
    res.json({ message: 'All intraday positions squared off', count: orders.length, orders });
  } catch (err) {
    next(err);
  }
};

const exportHoldingsCsv = async (req, res, next) => {
  try {
    const csv = await portfolioService.exportHoldingsCsv(req.user.id);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=holdings.csv');
    res.send(csv);
  } catch (err) {
    next(err);
  }
};

const exportHoldingsReport = async (req, res, next) => {
  try {
    const autoPrint = req.query.print === '1' || req.query.print === 'true';
    const html = await portfolioService.exportHoldingsReportHtml(req.user.id, { autoPrint });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (!autoPrint) {
      res.setHeader('Content-Disposition', 'attachment; filename=holdings-report.html');
    }
    res.send(html);
  } catch (err) {
    next(err);
  }
};

const exportTradesCsv = async (req, res, next) => {
  try {
    const csv = await portfolioService.exportTradesCsv(req.user.id, tradeBookQueryOpts(req.query));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=trade_book.csv');
    res.send(csv);
  } catch (err) {
    next(err);
  }
};

const exportTradeBookTaxReport = async (req, res, next) => {
  try {
    const autoPrint = req.query.print === '1' || req.query.print === 'true';
    const html = await portfolioService.exportTradeBookTaxHtml(req.user.id, {
      ...tradeBookQueryOpts(req.query),
      autoPrint
    });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (!autoPrint) {
      res.setHeader('Content-Disposition', 'attachment; filename=tax-pnl-statement.html');
    }
    res.send(html);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getHoldings,
  getHoldingsDetail,
  getHoldingTrades,
  getPortfolioSummary,
  getTradeHistory,
  getTradeBook,
  getPerformance,
  getTimeLoss,
  getIntradayPositions,
  getPositionsDetail,
  getPositionHistory,
  squareOffPosition,
  convertMisToCnc,
  squareOffAllPositions,
  exportHoldingsCsv,
  exportHoldingsReport,
  exportTradesCsv,
  exportTradeBookTaxReport
};