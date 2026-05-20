const tradingService = require('../services/trading');
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
  isAmo: z.boolean().optional()
});

const chargesSchema = z.object({
  orderType: z.enum(['BUY', 'SELL']).optional(),
  productType: z.string().optional(),
  notional: z.number().nonnegative()
});

const placeOrder = async (req, res, next) => {
  try {
    const parsed = orderSchema.parse(req.body);
    const order = await tradingService.placeOrder({
      userId: req.user.id,
      ...parsed,
      orderMode: parsed.orderMode || 'market',
      productType: parsed.productType || 'CNC',
      validity: parsed.validity || 'DAY',
      exchange: parsed.exchange || 'NSE'
    });
    res.status(201).json({ message: 'Order placed successfully', order });
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

module.exports = { placeOrder, getOrders, cancelOrder, modifyOrder, getCharges };