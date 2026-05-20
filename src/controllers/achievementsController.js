const achievementService = require('../services/achievements');

const getAchievements = async (req, res, next) => {
  try {
    const data = await achievementService.getUserAchievements(req.user.id);
    res.json(data);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getAchievements
};
