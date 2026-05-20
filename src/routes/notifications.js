const express = require('express');
const router = express.Router();
const notificationsController = require('../controllers/notificationsController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/unread-count', notificationsController.getUnreadCount);
router.post('/read-all', notificationsController.markAllRead);
router.get('/', notificationsController.listNotifications);
router.patch('/:id/read', notificationsController.markRead);

module.exports = router;
