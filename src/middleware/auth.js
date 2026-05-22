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

    user.role = String(user.role || 'student').toLowerCase();
    req.user = user;
    // Fire-and-forget activity update (throttled to once per 5 min)
    if (!authenticate._lastActivity) authenticate._lastActivity = {};
    const now = Date.now();
    if (!authenticate._lastActivity[user.id] || now - authenticate._lastActivity[user.id] > 300000) {
      authenticate._lastActivity[user.id] = now;
      const { updateActivity } = require('../services/auth');
      updateActivity(user.id).catch(() => {});
    }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const role = String(req.user.role || '').toLowerCase();
    if (!roles.map((r) => String(r).toLowerCase()).includes(role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
};

const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return next();
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const result = await pool.query(
      'SELECT id, name, email, role FROM users WHERE id = $1 AND is_active = true',
      [decoded.userId]
    );
    if (result.rows.length) req.user = result.rows[0];
  } catch (_) {
    /* ignore invalid optional token */
  }
  next();
};

module.exports = { authenticate, authorize, optionalAuth };