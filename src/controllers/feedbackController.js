const { z } = require('zod');
const { pool } = require('../config/database');

const submitSchema = z.object({
  subject: z.string().min(3).max(200),
  message: z.string().min(10).max(5000),
  category: z.enum(['general', 'bug', 'feature', 'trading', 'ui', 'other']).optional()
});

const submit = async (req, res, next) => {
  try {
    const { subject, message, category } = submitSchema.parse(req.body);
    if (!pool) throw { status: 503, message: 'Database not available' };
    const { rows } = await pool.query(
      `INSERT INTO user_feedback (user_id, subject, message, category) VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
      [req.user.id, subject, message, category || 'general']
    );
    res.status(201).json({ message: 'Feedback submitted', feedback: rows[0] });
  } catch (err) {
    next(err);
  }
};

const list = async (req, res, next) => {
  try {
    if (!pool) return res.json([]);
    const { rows } = await pool.query(
      'SELECT id, subject, message, category, status, created_at FROM user_feedback WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
};

module.exports = { submit, list };
