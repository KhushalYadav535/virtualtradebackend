const activityService = require('../services/activity');

const getFeed = async (req, res, next) => {
  try {
    const limit = req.query.limit;
    const feed = await activityService.getActivityFeed(req.user.id, limit);
    res.json(feed);
  } catch (err) {
    next(err);
  }
};

module.exports = { getFeed };
