const { getEffectiveLotSize, validateOrderQuantity } = require('./lotUtils');

const enrichOrder = (order, quote) => {
  const productType = order.product_type || 'CNC';
  const lotSize = quote ? getEffectiveLotSize(quote, productType) : 1;
  const qty = parseInt(order.qty, 10) || 0;
  const lots = lotSize > 0 ? qty / lotSize : qty;
  const price = parseFloat(order.executed_price ?? order.price ?? 0) || 0;
  const perLotValue = parseFloat((price * lotSize).toFixed(2));
  const totalValue = parseFloat((price * qty).toFixed(2));
  const lotValidation = validateOrderQuantity(
    qty,
    quote || { symbol: order.symbol },
    productType,
    order.order_type
  );

  return {
    ...order,
    orderId: order.id,
    name: quote?.companyName || quote?.name || order.symbol,
    productType,
    lotSize,
    lots: parseFloat(lots.toFixed(2)),
    lotsWhole: Math.floor(lots) === lots,
    lotsLabel: lotSize > 1 ? `${lots % 1 === 0 ? lots : lots.toFixed(2)} × ${lotSize}` : `${qty} sh`,
    qty,
    price: order.price != null ? parseFloat(order.price) : null,
    executedPrice: order.executed_price != null ? parseFloat(order.executed_price) : null,
    displayPrice: price,
    perLotValue,
    totalValue,
    triggerPrice: order.trigger_price != null ? parseFloat(order.trigger_price) : null,
    targetPrice: order.target_price != null ? parseFloat(order.target_price) : null,
    stoplossPrice: order.stoploss_price != null ? parseFloat(order.stoploss_price) : null,
    disclosedQty: order.disclosed_qty != null ? parseInt(order.disclosed_qty, 10) : null,
    lotValid: lotValidation.valid,
    lotValidationStatus: lotValidation.valid ? 'valid' : 'invalid',
    lotValidationMessage: lotValidation.message || (lotValidation.valid ? 'Lot OK' : 'Invalid lot size'),
    createdAt: order.created_at,
    executedAt: order.executed_at
  };
};

const buildCounts = (orders) => {
  const today = new Date().toISOString().slice(0, 10);
  const isToday = (d) => d && String(d).slice(0, 10) === today;
  return {
    all: orders.length,
    pending: orders.filter((o) => o.status === 'pending').length,
    executed: orders.filter((o) => o.status === 'executed').length,
    cancelled: orders.filter((o) => o.status === 'cancelled').length,
    rejected: orders.filter((o) => o.status === 'rejected').length,
    executedToday: orders.filter(
      (o) => o.status === 'executed' && isToday(o.executedAt || o.createdAt)
    ).length
  };
};

const filterAndSortOrders = (orders, opts = {}) => {
  const {
    status = 'all',
    product = 'all',
    symbol = '',
    validity = 'all',
    lotFilter = 'all',
    todayOnly = false,
    sortBy = 'time'
  } = opts;

  const symQ = String(symbol || '').trim().toUpperCase();
  const today = new Date().toISOString().slice(0, 10);

  let list = [...orders];

  if (status !== 'all') list = list.filter((o) => o.status === status);
  if (product !== 'all') list = list.filter((o) => o.productType === product);
  if (validity === 'amo') list = list.filter((o) => o.is_amo);
  if (validity === 'gtt') list = list.filter((o) => o.validity === 'GTT');
  if (validity === 'ioc') list = list.filter((o) => o.validity === 'IOC');
  if (symQ) list = list.filter((o) => o.symbol.includes(symQ));
  if (lotFilter === 'eq1') list = list.filter((o) => o.lotSize === 1);
  if (lotFilter === 'gt1') list = list.filter((o) => o.lotSize > 1);
  if (todayOnly || status === 'executed_today') {
    list = list.filter(
      (o) =>
        o.status === 'executed' &&
        String(o.executedAt || o.createdAt || '').slice(0, 10) === today
    );
  }

  if (sortBy === 'stock') {
    list.sort((a, b) => a.symbol.localeCompare(b.symbol));
  } else if (sortBy === 'lots') {
    list.sort((a, b) => b.lots - a.lots);
  } else {
    list.sort(
      (a, b) =>
        new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
  }

  return list;
};

module.exports = { enrichOrder, buildCounts, filterAndSortOrders };
