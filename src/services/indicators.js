const calculateSMA = (data, period) => {
  const sma = [];
  for (let i = period - 1; i < data.length; i++) {
    const sum = data.slice(i - period + 1, i + 1).reduce((acc, d) => acc + d.close, 0);
    sma.push(sum / period);
  }
  return sma;
};

const calculateEMA = (data, period) => {
  const k = 2 / (period + 1);
  const ema = [];
  let emaPrev = data[0]?.close || 0;

  for (let i = 0; i < data.length; i++) {
    if (i === 0) {
      ema.push(emaPrev);
    } else {
      emaPrev = data[i].close * k + emaPrev * (1 - k);
      ema.push(emaPrev);
    }
  }
  return ema;
};

const addMovingAverages = (chartData, options = {}) => {
  const { smaPeriods = [20, 50], emaPeriods = [12, 26] } = options;

  const result = {
    candleData: chartData,
    smaData: {},
    emaData: {}
  };

  smaPeriods.forEach(period => {
    const sma = calculateSMA(chartData, period);
    result.smaData[`sma${period}`] = sma.map((value, index) => ({
      time: chartData[chartData.length - sma.length + index].time,
      value: parseFloat(value.toFixed(2))
    }));
  });

  emaPeriods.forEach(period => {
    const ema = calculateEMA(chartData, period);
    result.emaData[`ema${period}`] = ema.map((value, index) => ({
      time: chartData[index].time,
      value: parseFloat(value.toFixed(2))
    }));
  });

  return result;
};

const calculateRSI = (data, period = 14) => {
  const rsi = [];
  let gains = [];
  let losses = [];

  for (let i = 1; i < data.length; i++) {
    const change = data[i].close - data[i - 1].close;
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? Math.abs(change) : 0);
  }

  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  for (let i = 0; i < period; i++) {
    rsi.push(null);
  }

  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;

    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi.push(parseFloat((100 - 100 / (1 + rs)).toFixed(2)));
  }

  return rsi.map((value, index) => ({
    time: data[index + 1]?.time,
    value: value
  })).filter(d => d.value !== null);
};

const calculateMACD = (data, fast = 12, slow = 26, signal = 9) => {
  const emaFast = calculateEMA(data, fast);
  const emaSlow = calculateEMA(data, slow);

  const macdLine = emaFast.map((f, i) => ({
    time: data[i].time,
    value: parseFloat((f - emaSlow[i]).toFixed(2))
  }));

  const macdValues = macdLine.map(m => m.value);
  const signalLine = [];
  let emaMacd = macdValues.slice(0, signal).reduce((a, b) => a + b, 0) / signal;

  for (let i = 0; i < signal; i++) {
    signalLine.push(null);
  }

  const k = 2 / (signal + 1);
  for (let i = signal; i < macdValues.length; i++) {
    emaMacd = macdValues[i] * k + emaMacd * (1 - k);
    signalLine.push(parseFloat(emaMacd.toFixed(2)));
  }

  const histogram = macdLine.map((m, i) => ({
    time: m.time,
    value: signalLine[i] !== null ? parseFloat((m.value - signalLine[i]).toFixed(2)) : null
  })).filter(d => d.value !== null);

  return {
    macd: macdLine.filter(m => m.value !== undefined),
    signal: signalLine.map((v, i) => ({ time: macdLine[i].time, value: v })).filter(d => d.value !== null),
    histogram: histogram
  };
};

module.exports = {
  calculateSMA,
  calculateEMA,
  calculateRSI,
  calculateMACD,
  addMovingAverages
};