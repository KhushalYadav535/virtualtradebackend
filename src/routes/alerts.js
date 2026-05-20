const express = require('express');
const router = express.Router();
const alertsController = require('../controllers/alertsController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/history', alertsController.getAlertHistory);
router.get('/', alertsController.getAlerts);
router.post('/', alertsController.createAlert);
router.patch('/:id', alertsController.updateAlert);
router.delete('/:id', alertsController.deleteAlert);

module.exports = router;
