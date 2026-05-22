const express = require('express');
const router = express.Router();
const offlineController = require('../controllers/offlineController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);
router.post('/queue', offlineController.queueOrders);
router.post('/sync', offlineController.syncQueued);
router.get('/queued', offlineController.getQueued);

module.exports = router;
