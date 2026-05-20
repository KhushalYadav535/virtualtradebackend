const express = require('express');
const router = express.Router();
const portfolioController = require('../controllers/portfolioController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/positions', portfolioController.getIntradayPositions);
router.post('/positions/square-off-all', portfolioController.squareOffAllPositions);
router.post('/positions/:symbol/square-off', portfolioController.squareOffPosition);
router.post('/positions/:symbol/convert-cnc', portfolioController.convertMisToCnc);
router.get('/holdings', portfolioController.getHoldings);
router.get('/holdings/export', portfolioController.exportHoldingsCsv);
router.get('/summary', portfolioController.getPortfolioSummary);
router.get('/trades/export', portfolioController.exportTradesCsv);
router.get('/trades', portfolioController.getTradeHistory);
router.get('/performance', portfolioController.getPerformance);
router.get('/time-loss', portfolioController.getTimeLoss);

module.exports = router;