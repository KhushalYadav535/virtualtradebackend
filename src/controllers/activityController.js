const activityService = require('../services/activity');

const parseTypes = (raw) => {
  if (!raw) return null;
  const list = String(raw)
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  return list.length ? list : null;
};

const getFeed = async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 100);
    const types = parseTypes(req.query.types);

    if (types) {
      const invalid = types.filter((t) => !activityService.ALLOWED_TYPES.has(t));
      if (invalid.length) {
        return res.status(400).json({
          message: `Invalid activity types: ${invalid.join(', ')}`,
          allowed: [...activityService.ALLOWED_TYPES]
        });
      }
    }

    const feed = await activityService.getActivityFeed(req.user.id, { limit, types });
    res.json(feed);
  } catch (err) {
    next(err);
  }
};

module.exports = { getFeed };
