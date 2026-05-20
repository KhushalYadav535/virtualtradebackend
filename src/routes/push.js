const express = require('express');
const router = express.Router();
const pushController = require('../controllers/pushController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.post('/subscribe', pushController.subscribe);
router.delete('/unsubscribe', pushController.unsubscribe);
router.get('/status', pushController.getSubscription);
router.post('/test', pushController.testNotification);

module.exports = router;