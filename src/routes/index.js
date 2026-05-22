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

const achievementsRoutes = require('./achievements');
const alertsRoutes = require('./alerts');
const notificationsRoutes = require('./notifications');
const activityRoutes = require('./activity');
const legalRoutes = require('./legal');
const advancedRoutes = require('./advanced');
const systemRoutes = require('./system');
const feedbackRoutes = require('./feedback');
const offlineRoutes = require('./offline');
const portfolioMgmtRoutes = require('./portfolioMgmt');
const supportRoutes = require('./support');

router.use('/legal', legalRoutes);
router.use('/advanced', advancedRoutes);
router.use('/system', systemRoutes);
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
router.use('/achievements', achievementsRoutes);
router.use('/alerts', alertsRoutes);
router.use('/notifications', notificationsRoutes);
router.use('/activity', activityRoutes);
router.use('/feedback', feedbackRoutes);
router.use('/offline', offlineRoutes);
router.use('/portfolios', portfolioMgmtRoutes);
router.use('/support', supportRoutes);

module.exports = router;