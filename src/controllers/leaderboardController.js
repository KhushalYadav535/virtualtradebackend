const adminService = require('../services/admin');
const { pool } = require('../config/database');

const getLeaderboard = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const { batchId, period } = req.query;
    const leaderboard = await adminService.getLeaderboard(limit, batchId || null, period || null);
    res.json(leaderboard);
  } catch (err) {
    next(err);
  }
};

const getLeaderboardBatches = async (req, res, next) => {
  try {
    const result = await pool.query('SELECT id, name FROM batches ORDER BY name ASC');
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
};

module.exports = { getLeaderboard, getLeaderboardBatches };
