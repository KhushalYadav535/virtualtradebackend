const { pool } = require('../config/database');
const { getRedisClient } = require('../config/redis');
const { getOfflineSnapshot } = require('../services/cacheSnapshot');

const getSystemStatus = async (req, res, next) => {
  try {
    let dbOk = false;
    try {
      await pool.query('SELECT 1');
      dbOk = true;
    } catch {
      dbOk = false;
    }

    let redisOk = false;
    try {
      const redis = getRedisClient();
      if (redis?.isOpen) {
        await redis.ping();
        redisOk = true;
      }
    } catch {
      redisOk = false;
    }

    const io = req.app.get('io');
    const wsClients = io?.engine?.clientsCount ?? io?.sockets?.sockets?.size ?? 0;

    res.json({
      status: dbOk ? 'ok' : 'degraded',
      db: dbOk,
      redis: redisOk,
      wsClients,
      priceBroadcastSec: 5,
      serverTime: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0'
    });
  } catch (err) {
    next(err);
  }
};

const getCacheSnapshot = async (req, res, next) => {
  try {
    const snapshot = await getOfflineSnapshot(req.user?.id || null);
    res.json(snapshot);
  } catch (err) {
    next(err);
  }
};

module.exports = { getSystemStatus, getCacheSnapshot };
