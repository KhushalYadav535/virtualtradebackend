const { createNotification } = require('./notifications');
const { sendNotification } = require('./pushNotifications');
const { getStockQuote } = require('./marketData');
const { getEffectiveLotSize } = require('../utils/lotUtils');

const formatLots = (qty, lotSize) => {
  const q = parseInt(qty, 10) || 0;
  const ls = lotSize || 1;
  const lots = q / ls;
  const whole = Math.floor(lots) === lots;
  return {
    lotSize: ls,
    lots,
    label: ls > 1 ? `${whole ? lots : lots.toFixed(2)} lot(s) × ${ls}` : `${q} share(s)`
  };
};

const orderLotContext = async (order) => {
  try {
    const quote = await getStockQuote(order.symbol);
    return formatLots(order.qty, getEffectiveLotSize(quote, order.product_type || 'CNC'));
  } catch {
    return formatLots(order.qty, 1);
  }
};

/**
 * In-app + web push (if subscribed). Always writes in-app notification.
 */
const notifyUser = async (
  userId,
  { type, category = 'alerts', title, body, metadata = {}, url = '/dashboard/notifications' }
) => {
  if (!userId || !title) return;
  try {
    await createNotification(userId, { type, title, body, metadata });
  } catch (err) {
    console.error('createNotification:', err.message);
  }
  try {
    await sendNotification(
      userId,
      { title, body, icon: '/icon-192.png', tag: `${type}-${Date.now()}`, data: { url, ...metadata } },
      category
    );
  } catch {
    /* push optional */
  }
};

const notifyOrderUpdate = async (userId, order, event = 'update') => {
  const lot = await orderLotContext(order);
  const sym = order.symbol;
  const side = order.order_type;
  const price = order.executed_price || order.price;
  let title = 'Order update';
  let body = `${side} ${lot.label} ${sym}`;

  if (event === 'executed' || order.status === 'executed') {
    title = 'Order executed';
    body = `${side} ${lot.label} ${sym} @ ₹${price} (${lot.lots} lots, lot size ${lot.lotSize})`;
  } else if (event === 'cancelled' || order.status === 'cancelled') {
    title = 'Order cancelled';
    body = `${side} ${lot.label} ${sym} was cancelled`;
  } else if (event === 'rejected' || order.status === 'rejected') {
    title = 'Order rejected';
    body = `${side} ${lot.label} ${sym} — ${order.reject_reason || 'Could not fill'}`;
  } else if (order.status === 'pending') {
    title = 'Order placed';
    body = `${side} ${lot.label} ${sym} is pending`;
  }

  return notifyUser(userId, {
    type: 'order',
    category: 'orders',
    title,
    body,
    metadata: { orderId: order.id, symbol: sym, status: order.status, ...lot },
    url: '/dashboard/orders'
  });
};

const notifyOrderRejectedLot = async (userId, symbol, message, qty, productType) => {
  const lot = formatLots(qty, 1);
  try {
    const quote = await getStockQuote(symbol);
    Object.assign(lot, formatLots(qty, getEffectiveLotSize(quote, productType)));
  } catch {
    /* ignore */
  }
  return notifyUser(userId, {
    type: 'order',
    category: 'orders',
    title: 'Order rejected — lot validation',
    body: `${symbol}: ${message} (qty ${qty}, ${lot.label})`,
    metadata: { symbol, qty, ...lot },
    url: '/dashboard/trade'
  });
};

const notifyInsufficientMargin = async (userId, { symbol, qty, productType, required, available }) => {
  const lot = formatLots(qty, 1);
  try {
    const quote = await getStockQuote(symbol);
    const ls = getEffectiveLotSize(quote, productType);
    Object.assign(lot, formatLots(qty, ls));
  } catch {
    /* ignore */
  }
  const maxLots = lot.lotSize > 0 && required > 0 ? Math.floor(available / (required / (qty / lot.lots || 1))) : 0;
  return notifyUser(userId, {
    type: 'margin',
    category: 'margin',
    title: 'Insufficient margin',
    body: `Cannot buy ${lot.label} ${symbol}. Need ₹${required.toFixed(0)}, available ₹${available.toFixed(0)} (~${maxLots} lots)`,
    metadata: { symbol, required, available, maxLots, ...lot },
    url: '/dashboard/wallet'
  });
};

const notifyTargetOrStop = async (userId, order, kind) => {
  const lot = await orderLotContext(order);
  const isTarget = kind === 'target';
  return notifyUser(userId, {
    type: 'order',
    category: 'orders',
    title: isTarget ? 'Target reached' : 'Stop-loss hit',
    body: `${order.symbol}: ${isTarget ? 'Target' : 'SL'} order for ${lot.label} @ ₹${order.executed_price || order.price}`,
    metadata: { orderId: order.id, symbol: order.symbol, kind, ...lot },
    url: '/dashboard/orders'
  });
};

const notifyFundMovement = async (userId, { type, amount, balanceAfter, description }) => {
  const isCredit = type === 'credit';
  return notifyUser(userId, {
    type: 'fund',
    category: 'funds',
    title: isCredit ? 'Funds credited' : 'Funds debited',
    body: `${description || (isCredit ? 'Credit' : 'Debit')} ₹${parseFloat(amount).toLocaleString('en-IN')} · Balance ₹${parseFloat(balanceAfter).toLocaleString('en-IN')}`,
    metadata: { amount, balanceAfter, movementType: type },
    url: '/dashboard/wallet'
  });
};

const notifyLowMargin = async (userId, { utilizationPercent, usedMargin, availableCash }) => {
  return notifyUser(userId, {
    type: 'margin',
    category: 'margin',
    title: 'Low margin alert',
    body: `Margin utilization ${utilizationPercent.toFixed(0)}%. Used ₹${usedMargin.toLocaleString('en-IN')}, cash ₹${availableCash.toLocaleString('en-IN')}`,
    metadata: { utilizationPercent, usedMargin, availableCash },
    url: '/dashboard/wallet'
  });
};

const notifyAutoSquareOffWarning = async (userId, positions) => {
  const totalLots = positions.reduce((s, p) => {
    const ls = p.lotSize || 1;
    return s + (p.qty || 0) / ls;
  }, 0);
  return notifyUser(userId, {
    type: 'margin',
    category: 'margin',
    title: 'Auto square-off at 3:20 PM',
    body: `${positions.length} MIS position(s), ~${totalLots.toFixed(1)} lots will be auto-squared unless you exit manually`,
    metadata: { positions: positions.map((p) => p.symbol), totalLots },
    url: '/dashboard/positions'
  });
};

const notifyMarketSession = async (userId, phase) => {
  const open = phase === 'open';
  return notifyUser(userId, {
    type: 'market',
    category: 'market',
    title: open ? 'Market opened' : 'Market closing soon',
    body: open
      ? 'NSE regular session is open (9:15 AM – 3:30 PM IST). Good luck trading!'
      : 'Regular session closes at 3:30 PM IST. Review open MIS positions before auto square-off.',
    metadata: { phase },
    url: '/dashboard/market'
  });
};

const notifyCorporateAction = async (userId, action, symbol) => {
  return notifyUser(userId, {
    type: 'corporate_action',
    category: 'alerts',
    title: `Corporate action: ${symbol}`,
    body: `${action.type.toUpperCase()} — ${action.title} (ex ${action.exDate}). ${action.impact || ''}`,
    metadata: { symbol, ...action },
    url: '/dashboard/portfolio'
  });
};

const notifyFractionalLot = async (userId, symbol, qty, lotSize) => {
  return notifyUser(userId, {
    type: 'holding',
    category: 'alerts',
    title: 'Fractional lot holding',
    body: `${symbol}: ${qty} shares is not a whole number of lots (lot size ${lotSize})`,
    metadata: { symbol, qty, lotSize },
    url: '/dashboard/portfolio'
  });
};

module.exports = {
  notifyUser,
  notifyOrderUpdate,
  notifyOrderRejectedLot,
  notifyInsufficientMargin,
  notifyTargetOrStop,
  notifyFundMovement,
  notifyLowMargin,
  notifyAutoSquareOffWarning,
  notifyMarketSession,
  notifyCorporateAction,
  notifyFractionalLot,
  formatLots,
  orderLotContext
};
