const express = require('express');
const router = express.Router();
const marketController = require('../controllers/marketController');

router.get('/quote/:symbol', marketController.getQuote);
router.post('/quotes', marketController.getMultipleQuotes);
router.get('/search', marketController.searchStocks);
router.get('/list', marketController.getStockList);
router.get('/historical/:symbol', marketController.getHistorical);
router.get('/gainers', marketController.getTopGainers);
router.get('/losers', marketController.getTopLosers);
router.get('/indices', marketController.getIndices);
router.get('/status', marketController.getMarketStatus);

module.exports = router;