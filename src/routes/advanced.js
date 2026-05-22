const express = require('express');
const router = express.Router();
const advancedController = require('../controllers/advancedController');
const { authenticate, optionalAuth } = require('../middleware/auth');

router.get('/depth/:symbol', optionalAuth, advancedController.getDepth);
router.get('/futures', optionalAuth, advancedController.getFutures);
router.get('/screener', optionalAuth, advancedController.getScreener);
router.get('/screener/presets', optionalAuth, advancedController.getScreenerPresets);
router.get('/options-strategies', optionalAuth, advancedController.getStrategies);

router.get('/baskets/share/:token', optionalAuth, advancedController.getSharedBasket);

router.use(authenticate);
router.post('/futures/rollover', advancedController.futuresRollover);
router.post('/scans', advancedController.saveScan);
router.get('/scans', advancedController.listScans);
router.get('/scans/:id', advancedController.getScan);
router.delete('/scans/:id', advancedController.deleteScan);
router.post('/scan-alerts', advancedController.subscribeScanAlert);
router.get('/scan-alerts', advancedController.listScanAlerts);
router.delete('/scan-alerts/:id', advancedController.deleteScanAlert);
router.get('/baskets', advancedController.listBaskets);
router.get('/baskets/:id', advancedController.getBasket);
router.post('/baskets', advancedController.createBasket);
router.patch('/baskets/:id', advancedController.updateBasket);
router.delete('/baskets/:id', advancedController.deleteBasket);
router.post('/baskets/:id/execute', advancedController.executeBasket);
router.post('/baskets/share/:token/clone', advancedController.cloneSharedBasket);

module.exports = router;
