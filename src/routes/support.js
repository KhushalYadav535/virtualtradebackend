const express = require('express');
const router = express.Router();
const supportController = require('../controllers/supportController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);
router.get('/tickets', supportController.listTickets);
router.post('/tickets', supportController.createTicket);

module.exports = router;
