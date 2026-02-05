import { Router } from 'express';
import authController from './auth.controller';
import { authMiddleware } from '../../middlewares/auth.middleware';

const router = Router();

router.get('/check-email', (req, res, next) => authController.checkEmail(req, res, next));
router.post('/register', (req, res, next) => authController.register(req, res, next));
router.post('/send-login-otp', (req, res, next) => authController.sendLoginOtp(req, res, next));
router.post('/verify-login-otp', (req, res, next) => authController.verifyLoginOtp(req, res, next));
router.get('/verify-email', (req, res, next) => authController.verifyEmail(req, res, next));
router.post('/resend-verification-email', (req, res, next) => authController.resendVerificationEmail(req, res, next));
router.post('/send-reset-password-otp', (req, res, next) => authController.sendResetPasswordOtp(req, res, next));
router.post('/verify-reset-password-otp', (req, res, next) => authController.verifyResetPasswordOtp(req, res, next));

router.post('/refresh', (req, res, next) => authController.refreshToken(req, res, next));
router.get('/sessions', authMiddleware, (req, res, next) => authController.getSessions(req, res, next));
router.delete('/sessions/:id', authMiddleware, (req, res, next) => authController.deleteSession(req, res, next));
router.delete('/sessions', authMiddleware, (req, res, next) => authController.deleteAllSessions(req, res, next));
router.get('/users', authMiddleware, (req, res, next) => authController.getAllUsers(req, res, next));
router.put('/update', authMiddleware, (req, res, next) => authController.updateUser(req, res, next));
router.post('/send-change-password-otp', authMiddleware, (req, res, next) => authController.sendChangePasswordOtp(req, res, next));
router.post('/verify-change-password-otp', authMiddleware, (req, res, next) => authController.verifyChangePasswordOtp(req, res, next));
router.post('/logout', authMiddleware, (req, res) => authController.logout(req, res));

export default router;
