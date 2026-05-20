const express = require('express');
const router = express.Router();
const tradingController = require('../controllers/tradingController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.post('/order', tradingController.placeOrder);
router.get('/orders', tradingController.getOrders);
router.delete('/order/:orderId', tradingController.cancelOrder);

module.exports = router;