import { Router } from 'express';
import friendsController from './friends.controller';
import blockController from './block.controller';
import { authMiddleware } from '../../middlewares/auth.middleware';

const router = Router();

// Friend Requests
router.post('/requests', authMiddleware, (req, res, next) => friendsController.sendFriendRequest(req, res, next));
router.get('/requests', authMiddleware, (req, res, next) => friendsController.getFriendRequests(req, res, next));
router.post('/requests/:id/accept', authMiddleware, (req, res, next) => friendsController.acceptFriendRequest(req, res, next));
router.post('/requests/:id/reject', authMiddleware, (req, res, next) => friendsController.rejectFriendRequest(req, res, next));
router.delete('/requests/:id', authMiddleware, (req, res, next) => friendsController.cancelFriendRequest(req, res, next));

// Friends
router.get('/', authMiddleware, (req, res, next) => friendsController.getFriends(req, res, next));
router.delete('/:friendId', authMiddleware, (req, res, next) => friendsController.removeFriend(req, res, next));

// Notifications
router.get('/notifications/accepted', authMiddleware, (req, res, next) => friendsController.getAcceptedFriendRequests(req, res, next));
router.get('/notifications/pending', authMiddleware, (req, res, next) => friendsController.getPendingFriendRequests(req, res, next));

// Block
router.post('/block', authMiddleware, (req, res, next) => blockController.blockUser(req, res, next));
router.delete('/block/:blockedId', authMiddleware, (req, res, next) => blockController.unblockUser(req, res, next));
router.get('/blocked', authMiddleware, (req, res, next) => blockController.getBlockedUsers(req, res, next));

export default router;

