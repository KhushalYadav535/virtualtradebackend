const express = require('express');
const router = express.Router();
const tradingController = require('../controllers/tradingController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.post('/order', tradingController.placeOrder);
router.get('/orders', tradingController.getOrders);
router.get('/orders/book', tradingController.getOrdersBook);
router.get('/orders/:orderId', tradingController.getOrderById);
router.get('/charges', tradingController.getCharges);
router.get('/lot-preview', tradingController.getLotPreview);
router.put('/order/:orderId', tradingController.modifyOrder);
router.delete('/order/:orderId', tradingController.cancelOrder);

module.exports = router;