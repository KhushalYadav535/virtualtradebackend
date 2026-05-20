const authService = require('../services/auth');
const { pool } = require('../config/database');
const { sendOTPEmail } = require('../services/email');
const { z } = require('zod');

const registerSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(100),
  role: z.enum(['student', 'trainer']).optional(),
  batchId: z.string().uuid().optional()
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string()
});

const verify2FASchema = z.object({
  userId: z.string().uuid(),
  token: z.string().length(6)
});

const changePasswordSchema = z.object({
  oldPassword: z.string(),
  newPassword: z.string().min(8).max(100)
});

const register = async (req, res, next) => {
  try {
    const { name, email, password, role, batchId } = registerSchema.parse(req.body);
    const user = await authService.register(name, email, password, role, batchId);
    res.status(201).json({ message: 'Registration successful', user });
  } catch (err) {
    next(err);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const result = await authService.login(email, password);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

const verify2FA = async (req, res, next) => {
  try {
    const { userId, token } = verify2FASchema.parse(req.body);
    const result = await authService.verify2FA(userId, token);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

const setup2FA = async (req, res, next) => {
  try {
    const result = await authService.setup2FA(req.user.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

const disable2FA = async (req, res, next) => {
  try {
    const { token } = req.body;
    await authService.disable2FA(req.user.id, token);
    res.json({ message: '2FA disabled successfully' });
  } catch (err) {
    next(err);
  }
};

const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    const result = await authService.refreshAccessToken(refreshToken);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

const requestPasswordReset = async (req, res, next) => {
  try {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    const user = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (user.rows.length === 0) {
      return res.json({ message: 'If the email exists, an OTP has been sent' });
    }
    const otp = await authService.generateOTP(email, 'password_reset');
    await sendOTPEmail(email, otp, 'password_reset');
    res.json({ message: 'OTP sent to email' });
  } catch (err) {
    next(err);
  }
};

const verifyPasswordResetOTP = async (req, res, next) => {
  try {
    const { email, otp } = req.body;
    await authService.verifyOTP(email, otp, 'password_reset');
    res.json({ message: 'OTP verified' });
  } catch (err) {
    next(err);
  }
};

const resetPassword = async (req, res, next) => {
  try {
    const { email, otp, newPassword } = z.object({
      email: z.string().email(),
      otp: z.string().length(6),
      newPassword: z.string().min(8).max(100)
    }).parse(req.body);
    await authService.resetPasswordWithOTP(email, otp, newPassword);
    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    next(err);
  }
};

const resendOTP = async (req, res, next) => {
  try {
    const { email, purpose } = z.object({
      email: z.string().email(),
      purpose: z.enum(['verification', 'password_reset'])
    }).parse(req.body);
    await authService.resendOTP(email, purpose);
    res.json({ message: 'OTP sent to email' });
  } catch (err) {
    next(err);
  }
};

const changePassword = async (req, res, next) => {
  try {
    const { oldPassword, newPassword } = changePasswordSchema.parse(req.body);
    await authService.changePassword(req.user.id, oldPassword, newPassword);
    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    next(err);
  }
};

const getProfile = async (req, res) => {
  res.json({ user: req.user });
};

const getSessions = async (req, res, next) => {
  try {
    const sessions = await authService.getSessions(req.user.id);
    res.json(sessions);
  } catch (err) {
    next(err);
  }
};

const revokeSession = async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    await authService.revokeSession(req.user.id, sessionId);
    res.json({ message: 'Session revoked' });
  } catch (err) {
    next(err);
  }
};

const revokeAllSessions = async (req, res, next) => {
  try {
    await authService.revokeAllSessions(req.user.id, true);
    res.json({ message: 'All other sessions revoked' });
  } catch (err) {
    next(err);
  }
};

const updateActivity = async (req, res, next) => {
  try {
    await authService.updateActivity(req.user.id);
    res.json({ message: 'Activity updated' });
  } catch (err) {
    next(err);
  }
};

const verifyEmail = async (req, res, next) => {
  try {
    const { email, otp } = req.body;
    await authService.verifyOTP(email, otp, 'verification');
    await authService.verifyEmail(email);
    res.json({ message: 'Email verified successfully' });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  register, login, verify2FA, setup2FA, disable2FA,
  refreshToken, requestPasswordReset, verifyPasswordResetOTP, resetPassword, resendOTP,
  changePassword, getProfile, getSessions, revokeSession,
  revokeAllSessions, updateActivity, verifyEmail
};