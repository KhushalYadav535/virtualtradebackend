const express = require('express');
const router = express.Router();
const portfolioController = require('../controllers/portfolioController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/holdings', portfolioController.getHoldings);
router.get('/summary', portfolioController.getPortfolioSummary);
router.get('/trades', portfolioController.getTradeHistory);
router.get('/performance', portfolioController.getPerformance);
router.get('/time-loss', portfolioController.getTimeLoss);

module.exports = router;