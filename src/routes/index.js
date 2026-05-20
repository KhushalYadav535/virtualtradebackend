const express = require('express');
const router = express.Router();

const authRoutes = require('./auth');
const walletRoutes = require('./wallet');
const marketRoutes = require('./market');
const tradingRoutes = require('./trading');
const portfolioRoutes = require('./portfolio');
const watchlistRoutes = require('./watchlist');
const adminRoutes = require('./admin');
const indicatorsRoutes = require('./indicators');
const pushRoutes = require('./push');
const leaderboardRoutes = require('./leaderboard');

router.use('/auth', authRoutes);
router.use('/wallet', walletRoutes);
router.use('/market', marketRoutes);
router.use('/trading', tradingRoutes);
router.use('/portfolio', portfolioRoutes);
router.use('/watchlist', watchlistRoutes);
router.use('/admin', adminRoutes);
router.use('/indicators', indicatorsRoutes);
router.use('/push', pushRoutes);
router.use('/leaderboard', leaderboardRoutes);

module.exports = router;