const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../config/database');
const { sendOTPEmail } = require('./email');

const DEFAULT_BALANCE = 1000000;

const generateTokens = (userId) => {
  const accessToken = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRY || '15m' });
  const refreshToken = jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET, { expiresIn: process.env.JWT_REFRESH_EXPIRY || '7d' });
  return { accessToken, refreshToken };
};

const getStartingBalance = async (batchId) => {
  if (!batchId) return DEFAULT_BALANCE;
  const batch = await pool.query('SELECT start_balance FROM batches WHERE id = $1', [batchId]);
  if (batch.rows.length === 0) return DEFAULT_BALANCE;
  return parseFloat(batch.rows[0].start_balance) || DEFAULT_BALANCE;
};

const register = async (name, email, password, role = 'student', batchId = null) => {
  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows.length > 0) {
    throw { status: 409, message: 'Email already registered' };
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const startBalance = await getStartingBalance(batchId);

  const result = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, batch_id, is_verified)
     VALUES ($1, $2, $3, $4, $5, false) RETURNING id, name, email, role, is_verified, batch_id, created_at`,
    [name, email, passwordHash, role, batchId]
  );

  const user = result.rows[0];
  await pool.query(
    'INSERT INTO wallets (user_id, balance) VALUES ($1, $2)',
    [user.id, startBalance]
  );

  const otp = await generateOTP(email, 'verification');
  await sendOTPEmail(email, otp, 'verification');

  return { ...user, requiresVerification: true, startingBalance: startBalance };
};

const login = async (email, password, deviceInfo = null, browser = null, ip = null) => {
  const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  if (result.rows.length === 0) {
    throw { status: 401, message: 'Invalid credentials' };
  }

  const user = result.rows[0];

  if (!user.is_active) {
    throw { status: 403, message: 'Account has been deactivated. Contact admin.' };
  }

  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid) {
    throw { status: 401, message: 'Invalid credentials' };
  }

  if (!user.is_verified) {
    const otp = await generateOTP(email, 'verification');
    await sendOTPEmail(email, otp, 'verification');
    return { requiresVerification: true, email };
  }

  if (user.totp_secret) {
    return { requires2FA: true, userId: user.id };
  }

  await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [user.id]);

  const tokens = generateTokens(user.id);
  const familyId = uuidv4();
  await saveRefreshToken(user.id, tokens.refreshToken, familyId, deviceInfo, browser, ip);
  await updateActivity(user.id);

  return {
    ...tokens,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, has2FA: false }
  };
};

const verify2FA = async (userId, token, deviceInfo = null, browser = null, ip = null) => {
  const result = await pool.query('SELECT totp_secret, is_active, is_verified FROM users WHERE id = $1', [userId]);
  if (result.rows.length === 0) {
    throw { status: 404, message: 'User not found' };
  }

  if (!result.rows[0].is_active) {
    throw { status: 403, message: 'Account has been deactivated. Contact admin.' };
  }

  if (!result.rows[0].is_verified) {
    throw { status: 403, message: 'Please verify your email first' };
  }

  const secret = result.rows[0].totp_secret;
  const verified = speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token,
    window: 1
  });

  if (!verified) {
    throw { status: 401, message: 'Invalid 2FA code' };
  }

  const tokens = generateTokens(userId);
  const familyId = uuidv4();
  await saveRefreshToken(userId, tokens.refreshToken, familyId, deviceInfo, browser, ip);
  await updateActivity(userId);

  const userResult = await pool.query('SELECT id, name, email, role FROM users WHERE id = $1', [userId]);
  return { ...tokens, user: { ...userResult.rows[0], has2FA: true } };
};

const setup2FA = async (userId) => {
  const secret = speakeasy.generateSecret({ name: `VirtualTrade:${userId}` });
  await pool.query('UPDATE users SET totp_secret = $1 WHERE id = $2', [secret.base32, userId]);

  const qrCode = await QRCode.toDataURL(secret.otpauth_url);
  return { secret: secret.base32, qrCode };
};

const disable2FA = async (userId, token) => {
  const result = await pool.query('SELECT totp_secret FROM users WHERE id = $1', [userId]);
  if (!result.rows[0].totp_secret) {
    throw { status: 400, message: '2FA not enabled' };
  }

  const verified = speakeasy.totp.verify({
    secret: result.rows[0].totp_secret,
    encoding: 'base32',
    token,
    window: 1
  });

  if (!verified) {
    throw { status: 401, message: 'Invalid 2FA code' };
  }

  await pool.query('UPDATE users SET totp_secret = NULL WHERE id = $1', [userId]);
  return true;
};

const saveRefreshToken = async (userId, token, familyId, deviceInfo = null, browser = null, ip = null) => {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await pool.query(
    'INSERT INTO refresh_tokens (user_id, token, expires_at, family_id) VALUES ($1, $2, $3, $4)',
    [userId, token, expiresAt, familyId]
  );
  await pool.query(
    'INSERT INTO user_sessions (user_id, device_info, browser, ip_address, is_current) VALUES ($1, $2, $3, $4, true)',
    [userId, deviceInfo, browser, ip]
  );
  await pool.query(
    `UPDATE user_sessions SET is_current = false
     WHERE user_id = $1 AND id != (
       SELECT id FROM user_sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1
     )`,
    [userId]
  );
};

const revokeTokenFamily = async (userId, familyId) => {
  await pool.query(
    'UPDATE refresh_tokens SET is_revoked = true WHERE user_id = $1 AND family_id = $2',
    [userId, familyId]
  );
  await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
};

const refreshLocks = new Map();

const performRefresh = async (refreshToken, decoded) => {
  const revoked = await pool.query(
    'SELECT id, family_id FROM refresh_tokens WHERE user_id = $1 AND token = $2 AND is_revoked = true',
    [decoded.userId, refreshToken]
  );

  if (revoked.rows.length > 0) {
    await revokeTokenFamily(decoded.userId, revoked.rows[0].family_id);
    throw { status: 401, message: 'Token reuse detected. Please login again.' };
  }

  const result = await pool.query(
    'SELECT * FROM refresh_tokens WHERE user_id = $1 AND token = $2 AND expires_at > NOW() AND is_revoked = false',
    [decoded.userId, refreshToken]
  );

  if (result.rows.length === 0) {
    throw { status: 401, message: 'Invalid refresh token' };
  }

  const { family_id: familyId } = result.rows[0];

  await pool.query(
    'UPDATE refresh_tokens SET is_revoked = true WHERE user_id = $1 AND token = $2',
    [decoded.userId, refreshToken]
  );

  const tokens = generateTokens(decoded.userId);
  await pool.query(
    'INSERT INTO refresh_tokens (user_id, token, expires_at, family_id) VALUES ($1, $2, $3, $4)',
    [decoded.userId, tokens.refreshToken, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), familyId]
  );

  const userResult = await pool.query('SELECT id, name, email, role FROM users WHERE id = $1', [decoded.userId]);
  return { ...tokens, user: userResult.rows[0] };
};

const refreshAccessToken = async (refreshToken) => {
  let decoded;
  try {
    decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
  } catch {
    throw { status: 401, message: 'Invalid refresh token' };
  }

  const lockKey = decoded.userId;
  if (refreshLocks.has(lockKey)) {
    return refreshLocks.get(lockKey);
  }

  const refreshPromise = performRefresh(refreshToken, decoded).finally(() => {
    refreshLocks.delete(lockKey);
  });

  refreshLocks.set(lockKey, refreshPromise);
  return refreshPromise;
};

const generateOTP = async (email, purpose) => {
  await pool.query('DELETE FROM otp_verification WHERE email = $1 AND purpose = $2', [email, purpose]);

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await pool.query(
    'INSERT INTO otp_verification (email, otp, purpose, expires_at) VALUES ($1, $2, $3, $4)',
    [email, otp, purpose, expiresAt]
  );

  return otp;
};

const resendOTP = async (email, purpose) => {
  const user = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  if (user.rows.length === 0 && purpose === 'verification') {
    throw { status: 404, message: 'User not found' };
  }

  const otp = await generateOTP(email, purpose);
  await sendOTPEmail(email, otp, purpose);
  return true;
};

const verifyOTP = async (email, otp, purpose) => {
  const result = await pool.query(
    'SELECT * FROM otp_verification WHERE email = $1 AND otp = $2 AND purpose = $3 AND expires_at > NOW()',
    [email, otp, purpose]
  );

  if (result.rows.length === 0) {
    throw { status: 400, message: 'Invalid or expired OTP' };
  }

  await pool.query('DELETE FROM otp_verification WHERE email = $1 AND purpose = $2', [email, purpose]);
  return true;
};

const resetPasswordWithOTP = async (email, otp, newPassword) => {
  await verifyOTP(email, otp, 'password_reset');

  const userResult = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  if (userResult.rows.length === 0) {
    throw { status: 404, message: 'User not found' };
  }

  const newHash = await bcrypt.hash(newPassword, 12);
  await pool.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE email = $2', [newHash, email]);
  await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userResult.rows[0].id]);

  return true;
};

const changePassword = async (userId, oldPassword, newPassword) => {
  const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
  const isValid = await bcrypt.compare(oldPassword, result.rows[0].password_hash);

  if (!isValid) {
    throw { status: 401, message: 'Current password is incorrect' };
  }

  const newHash = await bcrypt.hash(newPassword, 12);
  await pool.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [newHash, userId]);
  return true;
};

const getSessions = async (userId) => {
  const result = await pool.query(
    `SELECT id, device_info, browser, ip_address, is_current, created_at, last_active
     FROM user_sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10`,
    [userId]
  );
  return result.rows;
};

const revokeSession = async (userId, sessionId) => {
  await pool.query('DELETE FROM user_sessions WHERE id = $1 AND user_id = $2', [sessionId, userId]);
  return true;
};

const revokeAllSessions = async (userId, exceptCurrent = true) => {
  if (exceptCurrent) {
    await pool.query('DELETE FROM user_sessions WHERE user_id = $1 AND is_current = false', [userId]);
  } else {
    await pool.query('DELETE FROM user_sessions WHERE user_id = $1', [userId]);
  }
  return true;
};

const updateActivity = async (userId) => {
  await pool.query('UPDATE users SET last_activity = NOW() WHERE id = $1', [userId]);
  await pool.query(
    'UPDATE user_sessions SET last_active = NOW() WHERE user_id = $1 AND is_current = true',
    [userId]
  );
};

const normalizePhone = (phone) => String(phone || '').replace(/\D/g, '').slice(-10);

const generatePhoneOTP = async (phone, purpose) => {
  const ph = normalizePhone(phone);
  if (ph.length !== 10) throw { status: 400, message: 'Enter valid 10-digit mobile number' };

  await pool.query('DELETE FROM otp_verification WHERE phone = $1 AND purpose = $2', [ph, purpose]);

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  const placeholderEmail = `mobile_${ph}@otp.virtualtrade`;

  await pool.query(
    'INSERT INTO otp_verification (email, phone, otp, purpose, expires_at) VALUES ($1, $2, $3, $4, $5)',
    [placeholderEmail, ph, otp, purpose, expiresAt]
  );

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[DEV] Mobile OTP (${purpose}) for ${ph}: ${otp}`);
  }

  return { message: 'OTP sent to mobile', devOtp: process.env.NODE_ENV !== 'production' ? otp : undefined };
};

const verifyPhoneOTP = async (phone, otp, purpose) => {
  const ph = normalizePhone(phone);
  const result = await pool.query(
    'SELECT * FROM otp_verification WHERE phone = $1 AND otp = $2 AND purpose = $3 AND expires_at > NOW()',
    [ph, otp, purpose]
  );
  if (result.rows.length === 0) throw { status: 400, message: 'Invalid or expired OTP' };
  await pool.query('DELETE FROM otp_verification WHERE phone = $1 AND purpose = $2', [ph, purpose]);
  return ph;
};

const registerWithPhone = async (name, phone, password, otp, role = 'student') => {
  const ph = await verifyPhoneOTP(phone, otp, 'mobile_register');
  const existing = await pool.query('SELECT id FROM users WHERE phone = $1', [ph]);
  if (existing.rows.length > 0) throw { status: 409, message: 'Mobile number already registered' };

  const email = `mobile_${ph}@virtualtrade.local`;
  const passwordHash = await bcrypt.hash(password, 12);
  const startBalance = DEFAULT_BALANCE;

  const result = await pool.query(
    `INSERT INTO users (name, email, phone, password_hash, role, is_verified)
     VALUES ($1, $2, $3, $4, $5, true) RETURNING id, name, email, phone, role, is_verified`,
    [name.trim(), email, ph, passwordHash, role]
  );
  const user = result.rows[0];
  await pool.query('INSERT INTO wallets (user_id, balance) VALUES ($1, $2)', [user.id, startBalance]);
  const tokens = generateTokens(user.id);
  await saveRefreshToken(user.id, tokens.refreshToken, uuidv4());
  return { ...tokens, user: { ...user, has2FA: false }, startingBalance: startBalance };
};

const loginWithPhone = async (phone, otp, deviceInfo = null, browser = null, ip = null) => {
  const ph = await verifyPhoneOTP(phone, otp, 'mobile_login');
  const result = await pool.query('SELECT * FROM users WHERE phone = $1', [ph]);
  if (result.rows.length === 0) throw { status: 404, message: 'Mobile number not registered' };

  const user = result.rows[0];
  if (!user.is_active) throw { status: 403, message: 'Account deactivated' };
  if (user.totp_secret) return { requires2FA: true, userId: user.id };

  await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [user.id]);
  const tokens = generateTokens(user.id);
  await saveRefreshToken(user.id, tokens.refreshToken, uuidv4(), deviceInfo, browser, ip);

  return {
    ...tokens,
    user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, has2FA: false }
  };
};

const getUserProfile = async (userId) => {
  const result = await pool.query(
    `SELECT id, name, email, phone, date_of_birth, role, is_verified, created_at, last_activity,
            notification_prefs, locale, trading_prefs, (totp_secret IS NOT NULL) AS has_2fa
     FROM users WHERE id = $1`,
    [userId]
  );
  if (result.rows.length === 0) {
    throw { status: 404, message: 'User not found' };
  }
  const row = result.rows[0];
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    dateOfBirth: row.date_of_birth,
    role: row.role,
    is_verified: row.is_verified,
    created_at: row.created_at,
    last_activity: row.last_activity,
    notificationPrefs: row.notification_prefs,
    locale: row.locale || 'en',
    tradingPrefs: row.trading_prefs && typeof row.trading_prefs === 'object' ? row.trading_prefs : {},
    has2FA: row.has_2fa
  };
};

const deleteAccount = async (userId, password) => {
  const result = await pool.query('SELECT password_hash, is_active FROM users WHERE id = $1', [userId]);
  if (result.rows.length === 0) throw { status: 404, message: 'User not found' };
  const user = result.rows[0];
  if (!user.is_active) throw { status: 400, message: 'Account already deactivated' };

  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid) throw { status: 401, message: 'Incorrect password' };

  await pool.query(
    `UPDATE users SET is_active = false, email = $1, updated_at = NOW() WHERE id = $2`,
    [`deleted_${userId}@deleted.local`, userId]
  );
  await pool.query('UPDATE refresh_tokens SET is_revoked = true WHERE user_id = $1', [userId]);
  await pool.query('DELETE FROM user_sessions WHERE user_id = $1', [userId]);
  await pool.query('DELETE FROM push_subscriptions WHERE user_id = $1', [userId]);
  return { message: 'Account deactivated successfully' };
};

const updateProfile = async (userId, data = {}) => {
  const sets = [];
  const params = [];
  let i = 1;

  if (data.name != null) {
    if (typeof data.name !== 'string' || data.name.trim().length < 2) {
      throw { status: 400, message: 'Name must be at least 2 characters' };
    }
    sets.push(`name = $${i++}`);
    params.push(data.name.trim().slice(0, 100));
  }

  if (data.dateOfBirth != null) {
    sets.push(`date_of_birth = $${i++}`);
    params.push(data.dateOfBirth || null);
  }

  if (data.phone != null) {
    const ph = normalizePhone(data.phone);
    if (ph && ph.length !== 10) throw { status: 400, message: 'Invalid mobile number' };
    sets.push(`phone = $${i++}`);
    params.push(ph || null);
  }

  if (data.notificationPrefs != null) {
    sets.push(`notification_prefs = $${i++}::jsonb`);
    params.push(JSON.stringify(data.notificationPrefs));
  }

  if (data.locale != null) {
    const locale = String(data.locale).slice(0, 10);
    sets.push(`locale = $${i++}`);
    params.push(locale === 'hi' ? 'hi' : 'en');
  }

  if (data.tradingPrefs != null && typeof data.tradingPrefs === 'object') {
    sets.push(`trading_prefs = COALESCE(trading_prefs, '{}'::jsonb) || $${i}::jsonb`);
    params.push(JSON.stringify(data.tradingPrefs));
  }

  if (!sets.length) throw { status: 400, message: 'No profile fields to update' };

  sets.push('updated_at = NOW()');
  params.push(userId);

  const result = await pool.query(
    `UPDATE users SET ${sets.join(', ')} WHERE id = $${i}
     RETURNING id, name, email, phone, date_of_birth, role, is_verified, notification_prefs, locale, trading_prefs`,
    params
  );
  if (result.rows.length === 0) throw { status: 404, message: 'User not found' };
  const row = result.rows[0];
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    dateOfBirth: row.date_of_birth,
    role: row.role,
    is_verified: row.is_verified,
    notificationPrefs: row.notification_prefs,
    locale: row.locale,
    tradingPrefs: row.trading_prefs && typeof row.trading_prefs === 'object' ? row.trading_prefs : {}
  };
};

const verifyEmail = async (email) => {
  await pool.query('UPDATE users SET is_verified = true WHERE email = $1', [email]);
  return true;
};

module.exports = {
  register, login, verify2FA, setup2FA, disable2FA,
  refreshAccessToken, generateOTP, resendOTP, verifyOTP,
  resetPasswordWithOTP, changePassword,
  getSessions, revokeSession, revokeAllSessions, updateActivity, verifyEmail,
  getUserProfile, updateProfile, deleteAccount,
  generatePhoneOTP, registerWithPhone, loginWithPhone
};
