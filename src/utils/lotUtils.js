/**
 * Product-aware lot sizing for equity (CNC = 1 share) vs F&O-style (MIS/NRML).
 */

const getEffectiveLotSize = (quote, productType = 'CNC') => {
  const pt = String(productType || 'CNC').toUpperCase();
  if (pt === 'CNC') return 1;
  return quote?.lotSizeMis ?? quote?.lotSizeNrml ?? quote?.lotSize ?? 1;
};

const getFreezeQtyLots = (quote) => quote?.freezeQtyLots ?? 100;

const getFreezeQtyShares = (quote, productType = 'CNC') => {
  const lotSize = getEffectiveLotSize(quote, productType);
  return getFreezeQtyLots(quote) * lotSize;
};

const snapQuantityToLot = (qty, lotSize, side = 'BUY', rounding = null) => {
  const n = parseInt(qty, 10) || 0;
  if (n <= 0 || lotSize <= 0) return { qty: lotSize, adjusted: true };
  if (n % lotSize === 0) return { qty: n, adjusted: false };

  let mode = rounding;
  if (!mode || !['up', 'down', 'nearest'].includes(mode)) {
    mode = String(side).toUpperCase() === 'SELL' ? 'down' : 'up';
  }

  const ratio = n / lotSize;
  let lots;
  if (mode === 'down') lots = Math.max(1, Math.floor(ratio));
  else if (mode === 'nearest') lots = Math.max(1, Math.round(ratio));
  else lots = Math.max(1, Math.ceil(ratio));

  const snapped = lots * lotSize;
  return {
    qty: snapped,
    adjusted: true,
    message: `Quantity adjusted to ${snapped} shares (${lots} lot(s) × ${lotSize})`
  };
};

const validateOrderQuantity = (qty, quote, productType = 'CNC', orderType = 'BUY') => {
  const lotSize = getEffectiveLotSize(quote, productType);
  const freezeLots = getFreezeQtyLots(quote);
  const n = parseInt(qty, 10) || 0;

  if (n < lotSize) {
    return {
      valid: false,
      lotSize,
      lots: 0,
      message:
        lotSize === 1
          ? 'Minimum quantity is 1 share'
          : `Minimum order is 1 lot (${lotSize} shares)`
    };
  }
  if (n % lotSize !== 0) {
    return {
      valid: false,
      lotSize,
      lots: n / lotSize,
      message:
        String(orderType).toUpperCase() === 'SELL'
          ? 'Cannot sell partial lot'
          : `Quantity must be a multiple of ${lotSize} (lot size)`
    };
  }
  const lots = n / lotSize;
  if (lots > freezeLots) {
    return {
      valid: false,
      lotSize,
      lots,
      message: `Order exceeds freeze quantity (max ${freezeLots} lots)`
    };
  }
  return { valid: true, lotSize, lots, message: null };
};

const buildLotPreview = (quote, productType, qty, orderType, price, availableBalance = 0) => {
  const lotSize = getEffectiveLotSize(quote, productType);
  const validation = validateOrderQuantity(qty, quote, productType, orderType);
  const ltp = price ?? quote?.ltp ?? 0;
  const shares = validation.valid ? parseInt(qty, 10) : 0;
  const lots = shares / lotSize;
  const lotValue = parseFloat((ltp * lotSize).toFixed(2));
  const orderValue = parseFloat((ltp * shares).toFixed(2));

  const pt = String(productType || 'CNC').toUpperCase();
  const isMis = pt === 'MIS';
  const spanRate = isMis ? 0.12 : 1;
  const exposureRate = isMis ? 0.03 : 0;
  const marginPerLot = parseFloat((lotValue * (spanRate + exposureRate)).toFixed(2));
  const maxLots =
    String(orderType).toUpperCase() === 'BUY' && marginPerLot > 0
      ? Math.max(0, Math.floor(availableBalance / marginPerLot))
      : 0;

  const warnings = [];
  const avgVolume = quote?.volume || 0;
  if (avgVolume > 0 && validation.valid) {
    const volumePct = parseFloat(((shares / avgVolume) * 100).toFixed(2));
    if (volumePct > 5) {
      warnings.push(`Large order: ${lots} lot(s) = ${volumePct}% of daily average volume`);
    }
  }
  const lotValueThreshold = 1000000;
  if (lotValue > lotValueThreshold && validation.valid) {
    warnings.push(`Lot value exceeds ₹${(lotValueThreshold / 100000).toFixed(0)}L. Consider splitting order.`);
  }

  return {
    productType: pt,
    lotSize,
    freezeQtyLots: getFreezeQtyLots(quote),
    freezeQtyShares: getFreezeQtyShares(quote, productType),
    shares,
    lots,
    lotValue,
    orderValue,
    marginPerLot,
    maxLots,
    validation,
    warnings
  };
};

module.exports = {
  getEffectiveLotSize,
  getFreezeQtyLots,
  getFreezeQtyShares,
  snapQuantityToLot,
  validateOrderQuantity,
  buildLotPreview
};
