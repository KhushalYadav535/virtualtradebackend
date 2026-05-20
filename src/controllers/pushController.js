const pushService = require('../services/pushNotifications');

const subscribe = async (req, res, next) => {
  try {
    const { endpoint, keys } = req.body;
    await pushService.saveSubscription(req.user.id, { endpoint, keys });
    res.json({ message: 'Push subscription saved' });
  } catch (err) {
    next(err);
  }
};

const unsubscribe = async (req, res, next) => {
  try {
    await pushService.deleteSubscription(req.user.id);
    res.json({ message: 'Push subscription removed' });
  } catch (err) {
    next(err);
  }
};

const getSubscription = async (req, res, next) => {
  try {
    const subscription = await pushService.getSubscription(req.user.id);
    res.json({ subscribed: !!subscription });
  } catch (err) {
    next(err);
  }
};

const testNotification = async (req, res, next) => {
  try {
    const result = await pushService.sendNotification(req.user.id, {
      title: 'Test Notification',
      body: 'Push notifications are working!',
      icon: '/icon-192.png'
    });
    res.json({ sent: result });
  } catch (err) {
    next(err);
  }
};

module.exports = { subscribe, unsubscribe, getSubscription, testNotification };