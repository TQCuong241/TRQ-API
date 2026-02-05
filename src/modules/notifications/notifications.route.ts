import { Router } from 'express';
import notificationsController from './notifications.controller';
import { authMiddleware } from '../../middlewares/auth.middleware';

const router = Router();

// Notifications
router.get('/', authMiddleware, (req, res, next) => notificationsController.getNotifications(req, res, next));
router.get('/unread-count', authMiddleware, (req, res, next) => notificationsController.getUnreadCount(req, res, next));
router.patch('/:id/read', authMiddleware, (req, res, next) => notificationsController.markAsRead(req, res, next));
router.patch('/read-all', authMiddleware, (req, res, next) => notificationsController.markAllAsRead(req, res, next));
router.delete('/:id', authMiddleware, (req, res, next) => notificationsController.deleteNotification(req, res, next));
router.delete('/read', authMiddleware, (req, res, next) => notificationsController.deleteAllRead(req, res, next));

export default router;

