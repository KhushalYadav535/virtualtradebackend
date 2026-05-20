const express = require('express');
const router = express.Router();
const leaderboardController = require('../controllers/leaderboardController');
const { authenticate } = require('../middleware/auth');

router.get('/', authenticate, leaderboardController.getLeaderboard);
router.get('/batches', authenticate, leaderboardController.getLeaderboardBatches);

module.exports = router;
