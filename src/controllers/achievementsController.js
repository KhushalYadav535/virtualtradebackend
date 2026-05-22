const gamification = require('../services/gamification');

const getAchievements = async (req, res, next) => {
  try {
    const data = await gamification.getUserGamification(req.user.id);
    res.json(data);
  } catch (err) {
    next(err);
  }
};

const refreshAchievements = async (req, res, next) => {
  try {
    await gamification.checkAndAwardAchievements(req.user.id);
    const data = await gamification.getUserGamification(req.user.id);
    res.json(data);
  } catch (err) {
    next(err);
  }
};

const getReferral = async (req, res, next) => {
  try {
    const referral = await gamification.getReferralCode(req.user.id);
    res.json(referral);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getAchievements,
  refreshAchievements,
  getReferral
};
