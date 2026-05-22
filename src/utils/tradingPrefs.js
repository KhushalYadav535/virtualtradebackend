const DEFAULT_TRADING_PREFS = {
  chartTheme: 'dark',
  chartDefaultTimeframe: '1d',
  defaultOrderType: 'MARKET',
  defaultProductType: 'MIS',
  qtyInputMode: 'lots',
  lotRounding: 'up',
  showLotSizeEverywhere: true,
  lotQuickButtons: [1, 2, 5, 10],
  defaultQty: 1,
  autoSquareOffTime: '15:20',
  priceDisplayFormat: 'inr',
  lotValueDisplayFormat: 'per_lot',
  soundEffects: true,
  hapticFeedback: true,
  orderPin: false,
  defaultWatchlist: 'My Watchlist',
  appTheme: 'light',
  lowDataMode: false,
  preferWebSocket: true,
  offlineCacheEnabled: true,
  pollIntervalSec: 5
};

const mergeTradingPrefs = (raw) => {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_TRADING_PREFS };
  const merged = { ...DEFAULT_TRADING_PREFS, ...raw };
  if (!Array.isArray(merged.lotQuickButtons) || !merged.lotQuickButtons.length) {
    merged.lotQuickButtons = DEFAULT_TRADING_PREFS.lotQuickButtons;
  }
  merged.lotQuickButtons = merged.lotQuickButtons
    .map((n) => parseInt(n, 10))
    .filter((n) => n > 0)
    .slice(0, 6);
  merged.defaultQty = Math.max(1, parseInt(merged.defaultQty, 10) || 1);
  return merged;
};

const sanitizeTradingPrefs = (input) => {
  const m = mergeTradingPrefs(input);
  const allowedOrder = ['MARKET', 'LIMIT'];
  const allowedProduct = ['CNC', 'MIS', 'NRML'];
  const allowedRounding = ['up', 'down', 'nearest'];
  const allowedQtyMode = ['lots', 'shares'];
  const allowedPriceFmt = ['inr', 'percent'];
  const allowedLotValFmt = ['per_lot', 'total'];
  const allowedTf = ['1m', '5m', '15m', '1d', '1w', '1mo'];

  return {
    chartTheme: m.chartTheme === 'light' ? 'light' : 'dark',
    chartDefaultTimeframe: allowedTf.includes(m.chartDefaultTimeframe) ? m.chartDefaultTimeframe : '1d',
    defaultOrderType: allowedOrder.includes(m.defaultOrderType) ? m.defaultOrderType : 'MARKET',
    defaultProductType: allowedProduct.includes(m.defaultProductType) ? m.defaultProductType : 'MIS',
    qtyInputMode: allowedQtyMode.includes(m.qtyInputMode) ? m.qtyInputMode : 'lots',
    lotRounding: allowedRounding.includes(m.lotRounding) ? m.lotRounding : 'up',
    showLotSizeEverywhere: m.showLotSizeEverywhere !== false,
    lotQuickButtons: m.lotQuickButtons,
    defaultQty: m.defaultQty,
    autoSquareOffTime: String(m.autoSquareOffTime || '15:20').slice(0, 5),
    priceDisplayFormat: allowedPriceFmt.includes(m.priceDisplayFormat) ? m.priceDisplayFormat : 'inr',
    lotValueDisplayFormat: allowedLotValFmt.includes(m.lotValueDisplayFormat)
      ? m.lotValueDisplayFormat
      : 'per_lot',
    soundEffects: m.soundEffects !== false,
    hapticFeedback: m.hapticFeedback !== false,
    orderPin: m.orderPin === true,
    defaultWatchlist: String(m.defaultWatchlist || 'My Watchlist').slice(0, 80),
    appTheme: m.appTheme === 'dark' ? 'dark' : 'light',
    lowDataMode: m.lowDataMode === true,
    preferWebSocket: m.preferWebSocket !== false,
    offlineCacheEnabled: m.offlineCacheEnabled !== false,
    pollIntervalSec: (() => {
      let sec = Math.min(60, Math.max(5, parseInt(m.pollIntervalSec, 10) || 5));
      if (m.lowDataMode === true) sec = Math.max(15, sec);
      return sec;
    })()
  };
};

module.exports = { DEFAULT_TRADING_PREFS, mergeTradingPrefs, sanitizeTradingPrefs };
