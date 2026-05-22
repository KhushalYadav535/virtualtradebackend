const authService = require('../services/auth');
const { pool } = require('../config/database');
const { sendOTPEmail } = require('../services/email');
const securityService = require('../services/securityService');
const orderPinService = require('../services/orderPinService');
const { z } = require('zod');

const registerSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(100),
  role: z.enum(['student', 'trainer']).optional(),
  batchId: z.string().uuid().optional(),
  referralCode: z.string().min(4).max(12).optional()
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  deviceFingerprint: z.string().max(500).optional(),
  deviceLabel: z.string().max(120).optional()
});

const orderPinSchema = z.object({
  pin: z.string().length(4),
  password: z.string().min(1)
});

const verify2FASchema = z.object({
  userId: z.string().uuid(),
  token: z.string().length(6)
});

const changePasswordSchema = z.object({
  oldPassword: z.string(),
  newPassword: z.string().min(8).max(100)
});

const deleteAccountSchema = z.object({
  password: z.string().min(1)
});

const mobileOtpSchema = z.object({
  phone: z.string().min(10).max(15),
  purpose: z.enum(['mobile_register', 'mobile_login']).optional()
});

const mobileRegisterSchema = z.object({
  name: z.string().min(2).max(100),
  phone: z.string().min(10).max(15),
  password: z.string().min(8).max(100),
  otp: z.string().length(6)
});

const mobileLoginSchema = z.object({
  phone: z.string().min(10).max(15),
  otp: z.string().length(6)
});

const register = async (req, res, next) => {
  try {
    const { name, email, password, role, batchId, referralCode } = registerSchema.parse(req.body);
    const user = await authService.register(name, email, password, role, batchId, referralCode);
    res.status(201).json({ message: 'Registration successful', user });
  } catch (err) {
    next(err);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password, deviceFingerprint, deviceLabel } = loginSchema.parse(req.body);
    await securityService.checkSuspiciousLogin(email);
    try {
      const result = await authService.login(
        email,
        password,
        deviceLabel || 'Web',
        req.headers['user-agent'],
        req.ip
      );
      await securityService.recordLoginAttempt(email, true, req.ip);
      if (result.user?.id && deviceFingerprint) {
        await securityService.registerDevice(
          result.user.id,
          deviceFingerprint,
          deviceLabel || req.headers['user-agent']?.slice(0, 80) || 'Web'
        );
      }
      res.json(result);
    } catch (loginErr) {
      await securityService.recordLoginAttempt(email, false, req.ip);
      throw loginErr;
    }
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

const getProfile = async (req, res, next) => {
  try {
    const user = await authService.getUserProfile(req.user.id);
    res.json({ user });
  } catch (err) {
    next(err);
  }
};

const updateProfile = async (req, res, next) => {
  try {
    const user = await authService.updateProfile(req.user.id, req.body);
    res.json({ user, message: 'Profile updated' });
  } catch (err) {
    next(err);
  }
};

const getPreferences = async (req, res, next) => {
  try {
    const { mergeTradingPrefs, DEFAULT_TRADING_PREFS } = require('../utils/tradingPrefs');
    const user = await authService.getUserProfile(req.user.id);
    res.json({
      locale: user.locale || 'en',
      notificationPrefs: user.notificationPrefs || {},
      tradingPrefs: mergeTradingPrefs(user.tradingPrefs),
      defaults: DEFAULT_TRADING_PREFS
    });
  } catch (err) {
    next(err);
  }
};

const exportUserData = async (req, res, next) => {
  try {
    const { exportUserData: buildExport } = require('../services/userExport');
    const data = await buildExport(req.user.id);
    res.json(data);
  } catch (err) {
    next(err);
  }
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

const deleteAccount = async (req, res, next) => {
  try {
    const { password } = deleteAccountSchema.parse(req.body);
    const result = await authService.deleteAccount(req.user.id, password);
    res.json(result);
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

const sendMobileOTP = async (req, res, next) => {
  try {
    const { phone, purpose } = mobileOtpSchema.parse(req.body);
    const result = await authService.generatePhoneOTP(phone, purpose || 'mobile_login');
    res.json(result);
  } catch (err) {
    next(err);
  }
};

const registerWithPhone = async (req, res, next) => {
  try {
    const { name, phone, password, otp } = mobileRegisterSchema.parse(req.body);
    const result = await authService.registerWithPhone(name, phone, password, otp);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
};

const loginWithPhone = async (req, res, next) => {
  try {
    const { phone, otp } = mobileLoginSchema.parse(req.body);
    const result = await authService.loginWithPhone(
      phone,
      otp,
      req.headers['user-agent'],
      req.headers['user-agent'],
      req.ip
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
};

const setOrderPin = async (req, res, next) => {
  try {
    const { pin, password } = orderPinSchema.parse(req.body);
    const result = await orderPinService.setOrderPin(req.user.id, pin, password);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

const clearOrderPin = async (req, res, next) => {
  try {
    const { password } = z.object({ password: z.string().min(1) }).parse(req.body);
    const result = await orderPinService.clearOrderPin(req.user.id, password);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

const getOrderPinStatus = async (req, res, next) => {
  try {
    const required = await orderPinService.requiresOrderPin(req.user.id);
    res.json({ required, enabled: required });
  } catch (err) {
    next(err);
  }
};

const listDevices = async (req, res, next) => {
  try {
    const devices = await securityService.listDevices(req.user.id);
    res.json(devices);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  register, login, verify2FA, setup2FA, disable2FA,
  refreshToken, requestPasswordReset, verifyPasswordResetOTP, resetPassword, resendOTP,
  changePassword, getProfile, updateProfile, getPreferences, exportUserData,
  getSessions, revokeSession, revokeAllSessions, updateActivity, deleteAccount, verifyEmail,
  sendMobileOTP, registerWithPhone, loginWithPhone,
  setOrderPin, clearOrderPin, getOrderPinStatus, listDevices
};