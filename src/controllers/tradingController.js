const tradingService = require('../services/trading');
const { pool } = require('../config/database');
const { verifyOrderPin } = require('../services/orderPinService');
const { z } = require('zod');

const orderSchema = z.object({
  symbol: z.string().min(1).max(20),
  qty: z.number().int().positive(),
  orderType: z.enum(['BUY', 'SELL']),
  orderMode: z.enum(['market', 'limit', 'sl', 'sl-m', 'bo', 'co']).optional(),
  price: z.number().positive().optional(),
  triggerPrice: z.number().positive().optional(),
  targetPrice: z.number().positive().optional(),
  stoplossPrice: z.number().positive().optional(),
  productType: z.enum(['CNC', 'MIS', 'NRML', 'BO', 'CO']).optional(),
  validity: z.enum(['DAY', 'IOC', 'GTT']).optional(),
  exchange: z.string().optional(),
  isAmo: z.boolean().optional(),
  disclosedQty: z.number().int().positive().optional(),
  portfolioId: z.string().uuid().optional(),
  orderPin: z.string().length(4).optional()
});

const chargesSchema = z.object({
  orderType: z.enum(['BUY', 'SELL']).optional(),
  productType: z.string().optional(),
  notional: z.number().nonnegative()
});

const placeOrder = async (req, res, next) => {
  try {
    const parsed = orderSchema.parse(req.body);
    await verifyOrderPin(req.user.id, parsed.orderPin);
    const order = await tradingService.placeOrder({
      userId: req.user.id,
      ...parsed,
      orderMode: parsed.orderMode || 'market',
      productType: parsed.productType || 'CNC',
      validity: parsed.validity || 'DAY',
      exchange: parsed.exchange || 'NSE'
    });
    res.status(201).json({
      message: order.is_amo
        ? 'AMO queued — will execute when market opens'
        : order.validity === 'GTT'
          ? 'GTT order placed — active until triggered'
          : 'Order placed successfully',
      order
    });
  } catch (err) {
    next(err);
  }
};

const getOrders = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const orders = await tradingService.getOrders(req.user.id, limit);
    res.json(orders);
  } catch (err) {
    next(err);
  }
};

const getOrdersBook = async (req, res, next) => {
  try {
    const q = req.query;
    const book = await tradingService.getOrdersBook(req.user.id, {
      limit: parseInt(q.limit, 10) || 300,
      status: q.status || 'all',
      product: q.product || 'all',
      symbol: q.symbol || '',
      validity: q.validity || 'all',
      lotFilter: q.lotFilter || 'all',
      todayOnly: q.todayOnly === 'true' || q.status === 'executed_today',
      sortBy: q.sortBy || 'time'
    });
    res.json(book);
  } catch (err) {
    next(err);
  }
};

const getOrderById = async (req, res, next) => {
  try {
    const order = await tradingService.getOrderById(req.user.id, req.params.orderId);
    res.json(order);
  } catch (err) {
    next(err);
  }
};

const modifyOrderSchema = z.object({
  qty: z.number().int().positive().optional(),
  price: z.number().positive().optional(),
  triggerPrice: z.number().positive().optional(),
  targetPrice: z.number().positive().optional(),
  stoplossPrice: z.number().positive().optional(),
  validity: z.enum(['DAY', 'IOC', 'GTT']).optional()
});

const cancelOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const order = await tradingService.cancelOrder(req.user.id, orderId);
    res.json({ message: 'Order cancelled', order });
  } catch (err) {
    next(err);
  }
};

const getCharges = async (req, res, next) => {
  try {
    const parsed = chargesSchema.parse(req.query);
    const charges = tradingService.getOrderCharges({
      orderType: parsed.orderType || 'BUY',
      productType: parsed.productType || 'CNC',
      notional: parsed.notional
    });
    res.json(charges);
  } catch (err) {
    next(err);
  }
};

const lotPreviewSchema = z.object({
  symbol: z.string().min(1),
  productType: z.enum(['CNC', 'MIS', 'NRML', 'BO', 'CO']).optional(),
  qty: z.coerce.number().int().nonnegative().optional(),
  orderType: z.enum(['BUY', 'SELL']).optional(),
  price: z.coerce.number().positive().optional()
});

const getLotPreview = async (req, res, next) => {
  try {
    const parsed = lotPreviewSchema.parse(req.query);
    const preview = await tradingService.getLotPreview({
      symbol: parsed.symbol,
      productType: parsed.productType || 'CNC',
      qty: parsed.qty ?? 0,
      orderType: parsed.orderType || 'BUY',
      price: parsed.price ?? null,
      userId: req.user?.id ?? null
    });
    res.json(preview);
  } catch (err) {
    next(err);
  }
};

const modifyOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const parsed = modifyOrderSchema.parse(req.body || {});
    const order = await tradingService.modifyPendingOrder(req.user.id, orderId, parsed);
    res.json({ message: 'Order updated', order });
  } catch (err) {
    next(err);
  }
};

const getHedgeBenefit = async (req, res, next) => {
  try {
    if (!pool) return res.json({ hedgeRate: 1, normalRate: 1, benefitPct: 0, hasHedge: false });
    const userId = req.user.id;
    const { symbol } = req.query;
    if (!symbol) return res.json({ hedgeRate: 1, normalRate: 1, benefitPct: 0, hasHedge: false });

    const holdingRows = await pool.query(
      `SELECT symbol, qty FROM holdings WHERE user_id = $1 AND symbol = $2`,
      [userId, symbol.toUpperCase()]
    );
    const held = parseInt(holdingRows.rows[0]?.qty || '0', 10);
    const isBuy = req.query.orderType !== 'SELL';
    const hasOppositePosition = held > 0 && !isBuy;

    const { getStockQuote } = require('../services/marketData');
    const quote = await getStockQuote(symbol);
    const isFO = (quote?.lotSize || 1) > 1;

    let hedgeRate = 1;
    let benefitPct = 0;
    const normalRate = isFO ? 0.15 : 1;

    if (hasOppositePosition && isFO) {
      hedgeRate = 0.07;
      benefitPct = parseFloat(((1 - hedgeRate / normalRate) * 100).toFixed(1));
    }

    res.json({ hedgeRate, normalRate, benefitPct, hasHedge: hasOppositePosition && isFO, heldQty: held });
  } catch (err) {
    next(err);
  }
};

const getSpreadMarginBenefit = async (req, res, next) => {
  try {
    if (!pool) {
      return res.json({ hasSpread: false, spreadBenefitPct: 0, normalMarginRate: 0.15, spreadMarginRate: 0.15 });
    }
    const userId = req.user.id;
    const symbol = (req.query.symbol || '').toUpperCase();
    const orderType = req.query.orderType === 'SELL' ? 'SELL' : 'BUY';
    const productType = req.query.productType || 'MIS';

    const posRes = await pool.query(
      `SELECT order_type, SUM(qty)::int AS qty FROM intraday_positions
       WHERE user_id = $1 AND symbol = $2 AND status = 'open'
       GROUP BY order_type`,
      [userId, symbol]
    );
    const longQty = parseInt(posRes.rows.find((r) => r.order_type === 'BUY')?.qty || '0', 10);
    const shortQty = parseInt(posRes.rows.find((r) => r.order_type === 'SELL')?.qty || '0', 10);
    const hasLong = longQty > 0;
    const hasShort = shortQty > 0;
    const isOpposite =
      (orderType === 'BUY' && hasShort) || (orderType === 'SELL' && hasLong);

    const normalRate = productType === 'MIS' ? 0.15 : 1;
    const spreadMarginRate = isOpposite && productType === 'MIS' ? 0.08 : normalRate;
    const spreadBenefitPct =
      isOpposite && normalRate > spreadMarginRate
        ? parseFloat(((1 - spreadMarginRate / normalRate) * 100).toFixed(1))
        : 0;

    res.json({
      hasSpread: isOpposite,
      spreadBenefitPct,
      normalMarginRate: normalRate,
      spreadMarginRate,
      longQty,
      shortQty
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  placeOrder,
  getOrders,
  getOrdersBook,
  getOrderById,
  cancelOrder,
  modifyOrder,
  getCharges,
  getLotPreview,
  getHedgeBenefit,
  getSpreadMarginBenefit
};