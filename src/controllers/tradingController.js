const tradingService = require('../services/trading');
const { z } = require('zod');

const orderSchema = z.object({
  symbol: z.string().min(1).max(20),
  qty: z.number().int().positive(),
  orderType: z.enum(['BUY', 'SELL']),
  orderMode: z.enum(['market', 'limit']).optional(),
  price: z.number().positive().optional(),
  exchange: z.string().optional()
});

const placeOrder = async (req, res, next) => {
  try {
    const { symbol, qty, orderType, orderMode, price, exchange } = orderSchema.parse(req.body);
    const order = await tradingService.placeOrder(
      req.user.id,
      symbol.toUpperCase(),
      qty,
      orderType,
      price,
      orderMode || 'market',
      exchange
    );
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

const cancelOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const order = await tradingService.cancelOrder(req.user.id, orderId);
    res.json({ message: 'Order cancelled', order });
  } catch (err) {
    next(err);
  }
};

module.exports = { placeOrder, getOrders, cancelOrder };