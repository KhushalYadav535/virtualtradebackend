const express = require('express');
const router = express.Router();
const marketController = require('../controllers/marketController');
const { authenticate, optionalAuth } = require('../middleware/auth');

const cache = (seconds, swr = seconds * 4) => (req, res, next) => {
  if (req.method === 'GET') {
    res.set('Cache-Control', `public, max-age=${seconds}, stale-while-revalidate=${swr}`);
  }
  next();
};

router.get('/quote/:symbol', cache(10, 30), marketController.getQuote);
router.post('/quotes', marketController.getMultipleQuotes);
router.get('/sectors', cache(3600), marketController.getSectors);
router.get('/sector-analytics', cache(60), marketController.getSectorAnalytics);
router.get('/overview', cache(30), marketController.getMarketOverview);
router.get('/data-hub', cache(30), marketController.getMarketDataHub);
router.get('/calendars', cache(3600), marketController.getCalendars);
router.get('/corporate-actions', cache(900), marketController.getCorporateActions);
router.get('/fii-dii', cache(900), marketController.getFiiDii);
router.get('/popular-searches', cache(3600), marketController.getPopularSearches);
router.get('/search', optionalAuth, marketController.searchStocks);
router.get('/recent-searches', authenticate, marketController.getRecentSearches);
router.get('/list', cache(900), marketController.getStockList);
router.get('/historical/:symbol', cache(60), marketController.getHistorical);
router.get('/gainers', cache(30), marketController.getTopGainers);
router.get('/losers', cache(30), marketController.getTopLosers);
router.get('/indices', cache(15, 60), marketController.getIndices);
router.get('/index/:key/constituents', cache(60), marketController.getIndexConstituents);
router.get('/watchlist-templates', cache(3600), marketController.getWatchlistTemplates);
router.get('/status', cache(30), marketController.getMarketStatus);
router.get('/option-chain/:symbol/expiries', cache(300), marketController.getOptionExpiries);
router.get('/option-chain/:symbol', cache(30), marketController.getOptionChain);

module.exports = router;