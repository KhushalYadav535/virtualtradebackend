const marketService = require('../services/marketData');
const { calculateSMA, calculateEMA, calculateRSI, calculateMACD } = require('../services/indicators');

const getIndicators = async (req, res, next) => {
  try {
    const { symbol, period = '1mo', indicators = 'sma,ema' } = req.query;

    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }

    const chartData = await marketService.getHistoricalData(symbol.toUpperCase(), period, '1d');

    if (!chartData || chartData.length === 0) {
      return res.status(404).json({ error: 'No data available for this symbol' });
    }

    const requestedIndicators = indicators.split(',').map(i => i.trim().toLowerCase());
    const result = {
      symbol: symbol.toUpperCase(),
      period,
      data: chartData,
      indicators: {}
    };

    if (requestedIndicators.includes('sma')) {
      const sma20 = calculateSMA(chartData, 20);
      const sma50 = calculateSMA(chartData, 50);
      result.indicators.sma20 = sma20;
      result.indicators.sma50 = sma50;
    }

    if (requestedIndicators.includes('ema')) {
      const ema12 = calculateEMA(chartData, 12);
      const ema26 = calculateEMA(chartData, 26);
      result.indicators.ema12 = ema12;
      result.indicators.ema26 = ema26;
    }

    if (requestedIndicators.includes('rsi')) {
      result.indicators.rsi = calculateRSI(chartData, 14);
    }

    if (requestedIndicators.includes('macd')) {
      result.indicators.macd = calculateMACD(chartData, 12, 26, 9);
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
};

module.exports = { getIndicators };