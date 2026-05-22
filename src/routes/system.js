const express = require('express');
const router = express.Router();
const systemController = require('../controllers/systemController');
const { authenticate, optionalAuth } = require('../middleware/auth');

router.get('/status', systemController.getSystemStatus);
router.get('/cache-snapshot', optionalAuth, systemController.getCacheSnapshot);

module.exports = router;
