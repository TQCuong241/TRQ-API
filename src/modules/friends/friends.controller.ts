import { Response, NextFunction } from 'express';
import { AuthRequest } from '../auth/auth.controller';
import friendsService from './friends.service';
import { io } from '../../server';
import { 
  emitFriendRequestReceived, 
  emitFriendRequestUpdated, 
  emitFriendshipCreated,
  emitFriendshipRemoved,
  emitFriendRequestListUpdate
} from './friends.socket';

export class FriendsController {
  /**
   * Gửi lời mời kết bạn
   * POST /api/v1/friends/requests
   */
  async sendFriendRequest(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.userId) {
        return res.status(401).json({ message: 'Chưa xác thực' });
      }

      const { receiverId } = req.body;

      if (!receiverId) {
        return res.status(400).json({
          success: false,
          message: 'Vui lòng cung cấp ID người nhận'
        });
      }

      const friendRequest = await friendsService.sendFriendRequest(req.userId, receiverId);

      // Emit socket events cho realtime
      if (io) {
        // Populate sender info để gửi đầy đủ thông tin
        const populatedRequest = await friendsService.getFriendRequestById(friendRequest._id.toString());
        if (populatedRequest) {
          // Emit friend request received cho receiver
          emitFriendRequestReceived(io, receiverId, populatedRequest);
          // Emit list update cho receiver (để refresh danh sách friend requests)
          emitFriendRequestListUpdate(io, receiverId, 'received');
          // Emit list update cho sender (để refresh danh sách đã gửi)
          emitFriendRequestListUpdate(io, req.userId, 'sent');
        }
      }

      res.status(201).json({
        success: true,
        message: 'Đã gửi lời mời kết bạn',
        data: friendRequest
      });
    } catch (error: any) {
      if (error.message === 'Không thể gửi lời mời kết bạn cho chính mình') {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }
      if (error.message === 'Người dùng không tồn tại') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      if (error.message === 'Đã là bạn bè' || error.message === 'Đã có lời mời kết bạn đang chờ xử lý') {
        return res.status(409).json({
          success: false,
          message: error.message
        });
      }
      if (error.message === 'Không thể gửi lời mời kết bạn do bị chặn') {
        return res.status(403).json({
          success: false,
          message: error.message
        });
      }
      next(error);
    }
  }

  /**
   * Lấy danh sách lời mời kết bạn
   * GET /api/v1/friends/requests?type=received|sent|all
   */
  async getFriendRequests(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.userId) {
        return res.status(401).json({ message: 'Chưa xác thực' });
      }

      const type = (req.query.type as 'received' | 'sent' | 'all') || 'all';
      const requests = await friendsService.getFriendRequests(req.userId, type);

      res.status(200).json({
        success: true,
        data: requests
      });
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Chấp nhận lời mời kết bạn
   * POST /api/v1/friends/requests/:id/accept
   */
  async acceptFriendRequest(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.userId) {
        return res.status(401).json({ message: 'Chưa xác thực' });
      }

      const { id } = req.params;

      const result = await friendsService.acceptFriendRequest(id, req.userId);

      // Emit socket events cho realtime
      if (io) {
        // Populate request để có đầy đủ thông tin
        const populatedRequest = await friendsService.getFriendRequestById(id);
        if (populatedRequest) {
          // Handle populated senderId (có thể là object hoặc ObjectId)
          const senderIdObj = populatedRequest.senderId as any;
          const senderId = senderIdObj?._id ? String(senderIdObj._id) : String(senderIdObj);
          
          // Emit update cho sender (A) - request đã được accept
          emitFriendRequestUpdated(io, senderId, populatedRequest, 'accepted');
          
          // Emit friendship created cho cả 2 users
          emitFriendshipCreated(io, req.userId, senderId, result.friend);
          
          // Emit list update để refresh danh sách friend requests
          emitFriendRequestListUpdate(io, req.userId, 'received'); // Receiver (người accept)
          emitFriendRequestListUpdate(io, senderId, 'sent'); // Sender (người gửi request)
        }
      }

      res.status(200).json({
        success: true,
        message: 'Đã chấp nhận lời mời kết bạn',
        data: result
      });
    } catch (error: any) {
      if (error.message === 'Lời mời kết bạn không tồn tại hoặc đã được xử lý') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      next(error);
    }
  }

  /**
   * Từ chối lời mời kết bạn
   * POST /api/v1/friends/requests/:id/reject
   */
  async rejectFriendRequest(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.userId) {
        return res.status(401).json({ message: 'Chưa xác thực' });
      }

      const { id } = req.params;

      // Lấy thông tin request trước khi reject (để emit socket)
      const populatedRequestBefore = await friendsService.getFriendRequestById(id);
      
      const friendRequest = await friendsService.rejectFriendRequest(id, req.userId);

      // Emit socket events cho realtime
      if (io && populatedRequestBefore) {
        // Handle populated senderId (có thể là object hoặc ObjectId)
        const senderIdObj = populatedRequestBefore.senderId as any;
        const senderId = senderIdObj?._id ? String(senderIdObj._id) : String(senderIdObj);
        // Update status trong populatedRequest để emit
        const updatedRequest = { ...populatedRequestBefore, status: 'rejected' as const };
        
        // Emit update cho sender (A) - request đã bị reject
        emitFriendRequestUpdated(io, senderId, updatedRequest, 'rejected');
        
        // Emit list update để refresh danh sách friend requests
        emitFriendRequestListUpdate(io, req.userId, 'received'); // Receiver (người reject)
        emitFriendRequestListUpdate(io, senderId, 'sent'); // Sender (người gửi request)
      }

      res.status(200).json({
        success: true,
        message: 'Đã từ chối lời mời kết bạn',
        data: friendRequest
      });
    } catch (error: any) {
      if (error.message === 'Lời mời kết bạn không tồn tại hoặc đã được xử lý') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      next(error);
    }
  }

  /**
   * Hủy kết bạn
   * DELETE /api/v1/friends/:friendId
   */
  async removeFriend(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.userId) {
        return res.status(401).json({ message: 'Chưa xác thực' });
      }

      const { friendId } = req.params;

      if (!friendId) {
        return res.status(400).json({
          success: false,
          message: 'Vui lòng cung cấp ID người bạn'
        });
      }

      await friendsService.removeFriend(req.userId, friendId);

      // Emit socket event cho cả 2 users
      if (io) {
        emitFriendshipRemoved(io, req.userId, friendId);
      }

      res.status(200).json({
        success: true,
        message: 'Đã hủy kết bạn'
      });
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Hủy lời mời kết bạn (chỉ sender mới có thể hủy)
   * DELETE /api/v1/friends/requests/:id
   */
  async cancelFriendRequest(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.userId) {
        return res.status(401).json({ message: 'Chưa xác thực' });
      }

      const { id } = req.params;

      // Lấy thông tin request trước khi cancel (để emit socket)
      const populatedRequestBefore = await friendsService.getFriendRequestById(id);
      
      await friendsService.cancelFriendRequest(id, req.userId);

      // Emit socket events cho realtime
      if (io && populatedRequestBefore) {
        // Handle populated receiverId (có thể là object hoặc ObjectId)
        const receiverIdObj = populatedRequestBefore.receiverId as any;
        const receiverId = receiverIdObj?._id ? String(receiverIdObj._id) : String(receiverIdObj);
        
        // Emit update cho receiver (B) - request đã bị cancel
        emitFriendRequestUpdated(io, receiverId, populatedRequestBefore, 'cancelled');
        
        // Emit list update để refresh danh sách friend requests
        emitFriendRequestListUpdate(io, req.userId, 'sent'); // Sender (người cancel)
        emitFriendRequestListUpdate(io, receiverId, 'received'); // Receiver (người nhận request)
      }

      res.status(200).json({
        success: true,
        message: 'Đã hủy lời mời kết bạn'
      });
    } catch (error: any) {
      if (error.message === 'Lời mời kết bạn không tồn tại hoặc đã được xử lý') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      next(error);
    }
  }

  /**
   * Lấy danh sách bạn bè
   * GET /api/v1/friends
   */
  async getFriends(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.userId) {
        return res.status(401).json({ message: 'Chưa xác thực' });
      }

      const friends = await friendsService.getFriends(req.userId);

      res.status(200).json({
        success: true,
        data: friends
      });
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Lấy danh sách lời mời kết bạn đã được chấp nhận
   * GET /api/v1/friends/notifications/accepted
   */
  async getAcceptedFriendRequests(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.userId) {
        return res.status(401).json({ message: 'Chưa xác thực' });
      }

      const { limit, page } = req.query;

      // Validate limit
      let limitNum = 20;
      if (limit) {
        limitNum = parseInt(limit as string, 10);
        if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
          return res.status(400).json({
            success: false,
            message: 'limit phải là số từ 1 đến 100'
          });
        }
      }

      // Validate page
      let pageNum = 1;
      if (page) {
        pageNum = parseInt(page as string, 10);
        if (isNaN(pageNum) || pageNum < 1) {
          return res.status(400).json({
            success: false,
            message: 'page phải là số lớn hơn 0'
          });
        }
      }

      const result = await friendsService.getAcceptedFriendRequests(req.userId, limitNum, pageNum);

      res.status(200).json({
        success: true,
        message: 'Lấy danh sách lời mời đã được chấp nhận thành công',
        data: result
      });
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Lấy danh sách lời mời kết bạn đang chờ
   * GET /api/v1/friends/notifications/pending
   */
  async getPendingFriendRequests(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.userId) {
        return res.status(401).json({ message: 'Chưa xác thực' });
      }

      const { limit, page } = req.query;

      // Validate limit
      let limitNum = 20;
      if (limit) {
        limitNum = parseInt(limit as string, 10);
        if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
          return res.status(400).json({
            success: false,
            message: 'limit phải là số từ 1 đến 100'
          });
        }
      }

      // Validate page
      let pageNum = 1;
      if (page) {
        pageNum = parseInt(page as string, 10);
        if (isNaN(pageNum) || pageNum < 1) {
          return res.status(400).json({
            success: false,
            message: 'page phải là số lớn hơn 0'
          });
        }
      }

      const result = await friendsService.getPendingFriendRequests(req.userId, limitNum, pageNum);

      res.status(200).json({
        success: true,
        message: 'Lấy danh sách lời mời đang chờ thành công',
        data: result
      });
    } catch (error: any) {
      next(error);
    }
  }
}

export default new FriendsController();

