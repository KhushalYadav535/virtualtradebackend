const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');

const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const result = await pool.query(
      'SELECT id, name, email, role, is_verified, is_active, last_activity FROM users WHERE id = $1',
      [decoded.userId]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }
    const user = result.rows[0];
    if (!user.is_active) {
      return res.status(403).json({ error: 'Account has been deactivated' });
    }

    const inactivityLimit = 30 * 60 * 1000;
    if (user.last_activity && (Date.now() - new Date(user.last_activity).getTime()) > inactivityLimit) {
      await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [user.id]);
      return res.status(401).json({ error: 'Session expired due to inactivity. Please login again.' });
    }

    req.user = user;
    const { updateActivity } = require('../services/auth');
    updateActivity(user.id).catch(() => {});
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
};

module.exports = { authenticate, authorize };