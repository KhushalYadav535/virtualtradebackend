const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/verify-2fa', authController.verify2FA);
router.post('/refresh-token', authController.refreshToken);
router.post('/verify-email', authController.verifyEmail);

router.post('/password/reset-request', authController.requestPasswordReset);
router.post('/password/reset-verify', authController.verifyPasswordResetOTP);
router.post('/password/reset', authController.resetPassword);
router.post('/resend-otp', authController.resendOTP);

router.use(authenticate);
router.get('/profile', authController.getProfile);
router.post('/2fa/setup', authController.setup2FA);
router.post('/2fa/disable', authController.disable2FA);
router.post('/password/change', authController.changePassword);
router.get('/sessions', authController.getSessions);
router.delete('/sessions/:sessionId', authController.revokeSession);
router.post('/sessions/revoke-all', authController.revokeAllSessions);
router.post('/activity', authController.updateActivity);

module.exports = router;