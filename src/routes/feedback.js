const express = require('express');
const router = express.Router();
const feedbackController = require('../controllers/feedbackController');
const { authenticate } = require('../middleware/auth');

router.post('/', authenticate, feedbackController.submit);
router.get('/', authenticate, feedbackController.list);

module.exports = router;
