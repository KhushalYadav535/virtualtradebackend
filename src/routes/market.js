const express = require('express');
const router = express.Router();
const marketController = require('../controllers/marketController');
const { authenticate, optionalAuth } = require('../middleware/auth');

router.get('/quote/:symbol', marketController.getQuote);
router.post('/quotes', marketController.getMultipleQuotes);
router.get('/sectors', marketController.getSectors);
router.get('/sector-analytics', marketController.getSectorAnalytics);
router.get('/overview', marketController.getMarketOverview);
router.get('/data-hub', marketController.getMarketDataHub);
router.get('/calendars', marketController.getCalendars);
router.get('/corporate-actions', marketController.getCorporateActions);
router.get('/fii-dii', marketController.getFiiDii);
router.get('/popular-searches', marketController.getPopularSearches);
router.get('/search', optionalAuth, marketController.searchStocks);
router.get('/recent-searches', authenticate, marketController.getRecentSearches);
router.get('/list', marketController.getStockList);
router.get('/historical/:symbol', marketController.getHistorical);
router.get('/gainers', marketController.getTopGainers);
router.get('/losers', marketController.getTopLosers);
router.get('/indices', marketController.getIndices);
router.get('/index/:key/constituents', marketController.getIndexConstituents);
router.get('/watchlist-templates', marketController.getWatchlistTemplates);
router.get('/status', marketController.getMarketStatus);
router.get('/option-chain/:symbol/expiries', marketController.getOptionExpiries);
router.get('/option-chain/:symbol', marketController.getOptionChain);

module.exports = router;