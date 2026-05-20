const notificationService = require('../services/notifications');

const listNotifications = async (req, res, next) => {
  try {
    const unreadOnly = req.query.unreadOnly === 'true';
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const items = await notificationService.listNotifications(req.user.id, { limit, unreadOnly });
    res.json(items);
  } catch (err) {
    next(err);
  }
};

const getUnreadCount = async (req, res, next) => {
  try {
    const count = await notificationService.getUnreadCount(req.user.id);
    res.json({ count });
  } catch (err) {
    next(err);
  }
};

const markRead = async (req, res, next) => {
  try {
    const item = await notificationService.markRead(req.user.id, req.params.id);
    res.json(item);
  } catch (err) {
    next(err);
  }
};

const markAllRead = async (req, res, next) => {
  try {
    const result = await notificationService.markAllRead(req.user.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  listNotifications,
  getUnreadCount,
  markRead,
  markAllRead
};
