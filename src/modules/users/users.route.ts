import { Router } from 'express';
import usersController from './users.controller';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { uploadAvatar, uploadCover } from '../../middlewares/upload.middleware';

const router = Router();

// Lấy thông tin user
router.get('/me', authMiddleware, (req, res, next) => usersController.getCurrentUser(req, res, next));
router.get('/search', authMiddleware, (req, res, next) => usersController.searchUsers(req, res, next));
router.get('/:id', authMiddleware, (req, res, next) => usersController.getUserById(req, res, next));

// Avatar
router.post('/avatar', authMiddleware, (req, res, next) => {
  uploadAvatar.single('avatar')(req, res, (err) => {
    if (err) {
      // Xử lý lỗi từ multer trước khi vào controller
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: 'File quá lớn (tối đa 5MB)'
        });
      }
      if (err.message && err.message.includes('Chỉ chấp nhận file ảnh')) {
        return res.status(400).json({
          success: false,
          message: err.message
        });
      }
      return next(err);
    }
    usersController.updateAvatar(req, res, next);
  });
});
router.delete('/avatar', authMiddleware, (req, res, next) => usersController.removeAvatar(req, res, next));

// Cover Photo
router.post('/cover', authMiddleware, (req, res, next) => {
  uploadCover.single('cover')(req, res, (err) => {
    if (err) {
      // Xử lý lỗi từ multer trước khi vào controller
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: 'File quá lớn (tối đa 5MB)'
        });
      }
      if (err.message && err.message.includes('Chỉ chấp nhận file ảnh')) {
        return res.status(400).json({
          success: false,
          message: err.message
        });
      }
      return next(err);
    }
    usersController.updateCover(req, res, next);
  });
});
router.delete('/cover', authMiddleware, (req, res, next) => usersController.removeCover(req, res, next));

// Profile
router.put('/profile', authMiddleware, (req, res, next) => usersController.updateProfile(req, res, next));

// Push Tokens (theo checklist: POST /users/push-token)
import notificationsController from '../notifications/notifications.controller';
router.post('/push-token', authMiddleware, (req, res, next) => notificationsController.registerPushToken(req, res, next));
router.delete('/push-token', authMiddleware, (req, res, next) => notificationsController.unregisterPushToken(req, res, next));
router.get('/push-tokens', authMiddleware, (req, res, next) => notificationsController.getPushTokens(req, res, next));

export default router;

