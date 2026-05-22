const bcrypt = require('bcrypt');
const { pool } = require('../config/database');
const { sanitizeTradingPrefs } = require('../utils/tradingPrefs');

const getTradingPrefs = async (userId) => {
  const res = await pool.query(`SELECT trading_prefs FROM users WHERE id = $1`, [userId]);
  return sanitizeTradingPrefs(res.rows[0]?.trading_prefs || {});
};

const requiresOrderPin = async (userId) => {
  const prefs = await getTradingPrefs(userId);
  if (!prefs.orderPin) return false;
  const res = await pool.query(`SELECT order_pin_hash FROM users WHERE id = $1`, [userId]);
  return !!res.rows[0]?.order_pin_hash;
};

const setOrderPin = async (userId, pin, currentPassword) => {
  if (!/^\d{4}$/.test(String(pin))) {
    throw { status: 400, message: 'PIN must be exactly 4 digits' };
  }
  const userRes = await pool.query(`SELECT password_hash FROM users WHERE id = $1`, [userId]);
  if (!userRes.rows.length) throw { status: 404, message: 'User not found' };
  const ok = await bcrypt.compare(currentPassword, userRes.rows[0].password_hash);
  if (!ok) throw { status: 401, message: 'Invalid password' };

  const hash = await bcrypt.hash(String(pin), 10);
  await pool.query(`UPDATE users SET order_pin_hash = $1 WHERE id = $2`, [hash, userId]);

  const prefs = await getTradingPrefs(userId);
  prefs.orderPin = true;
  await pool.query(`UPDATE users SET trading_prefs = $1::jsonb WHERE id = $2`, [
    JSON.stringify(prefs),
    userId
  ]);
  return { message: 'Order PIN set' };
};

const clearOrderPin = async (userId, currentPassword) => {
  const userRes = await pool.query(`SELECT password_hash FROM users WHERE id = $1`, [userId]);
  if (!userRes.rows.length) throw { status: 404, message: 'User not found' };
  const ok = await bcrypt.compare(currentPassword, userRes.rows[0].password_hash);
  if (!ok) throw { status: 401, message: 'Invalid password' };

  const prefs = await getTradingPrefs(userId);
  prefs.orderPin = false;
  await pool.query(
    `UPDATE users SET order_pin_hash = NULL, trading_prefs = $1::jsonb WHERE id = $2`,
    [JSON.stringify(prefs), userId]
  );
  return { message: 'Order PIN removed' };
};

const verifyOrderPin = async (userId, pin) => {
  const required = await requiresOrderPin(userId);
  if (!required) return true;
  if (!pin) throw { status: 403, message: 'Order PIN required', code: 'ORDER_PIN_REQUIRED' };
  const res = await pool.query(`SELECT order_pin_hash FROM users WHERE id = $1`, [userId]);
  const hash = res.rows[0]?.order_pin_hash;
  if (!hash) throw { status: 403, message: 'Set a 4-digit order PIN in Settings first', code: 'ORDER_PIN_NOT_SET' };
  const ok = await bcrypt.compare(String(pin), hash);
  if (!ok) throw { status: 403, message: 'Incorrect order PIN', code: 'ORDER_PIN_INVALID' };
  return true;
};

module.exports = {
  requiresOrderPin,
  setOrderPin,
  clearOrderPin,
  verifyOrderPin,
  getTradingPrefs
};
