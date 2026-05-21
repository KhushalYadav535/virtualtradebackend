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

const snapQuantityToLot = (qty, lotSize, side = 'BUY') => {
  const n = parseInt(qty, 10) || 0;
  if (n <= 0 || lotSize <= 0) return { qty: lotSize, adjusted: true };
  if (n % lotSize === 0) return { qty: n, adjusted: false };

  const fullLots = Math.floor(n / lotSize);
  const snapped =
    String(side).toUpperCase() === 'SELL'
      ? Math.max(lotSize, fullLots * lotSize)
      : Math.max(lotSize, (fullLots + 1) * lotSize);

  return {
    qty: snapped,
    adjusted: true,
    message: `Quantity adjusted to ${snapped} shares (${snapped / lotSize} lot(s) × ${lotSize})`
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
    validation
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
