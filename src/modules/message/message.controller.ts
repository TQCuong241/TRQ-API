import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth.middleware';
import messageService from './message.service';

class MessageController {
  /**
   * Lấy danh sách phòng chat của user
   * GET /api/v1/conversations
   * 
   * Query params:
   * - page?: number (default: 1)
   * - limit?: number (default: 20)
   * - type?: 'PRIVATE' | 'GROUP' (filter theo loại phòng)
   * - search?: string (tìm kiếm theo tên phòng hoặc tên user kia)
   */
  async getConversations(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.userId) {
        return res.status(401).json({ message: 'Chưa xác thực' });
      }

      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
      const type = req.query.type as 'PRIVATE' | 'GROUP' | undefined;
      const search = req.query.search as string | undefined;

      const filters: {
        type?: 'PRIVATE' | 'GROUP';
        search?: string;
      } = {};

      if (type && (type === 'PRIVATE' || type === 'GROUP')) {
        filters.type = type;
      }

      if (search && search.trim()) {
        filters.search = search.trim();
      }

      const data = await messageService.getUserConversations(req.userId, page, limit, Object.keys(filters).length > 0 ? filters : undefined);

      res.status(200).json({
        success: true,
        data
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Tạo / lấy phòng chat 1-1
   * POST /api/v1/conversations/private
   */
  async createPrivateConversation(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.userId) {
        return res.status(401).json({ message: 'Chưa xác thực' });
      }

      const { userId } = req.body;

      if (!userId || typeof userId !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'userId không hợp lệ'
        });
      }

      const result = await messageService.ensurePrivateConversation(req.userId, userId);

      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error: any) {
      if (error.message && error.message.includes('chặn nhau')) {
        return res.status(403).json({
          success: false,
          message: error.message
        });
      }
      next(error);
    }
  }

  /**
   * Tạo phòng chat nhóm
   * POST /api/v1/conversations/group
   */
  async createGroupConversation(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.userId) {
        return res.status(401).json({ message: 'Chưa xác thực' });
      }

      const { name, memberIds } = req.body as { name?: string; memberIds?: string[] };

      if (!name || typeof name !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'Tên nhóm không hợp lệ'
        });
      }

      if (memberIds && !Array.isArray(memberIds)) {
        return res.status(400).json({
          success: false,
          message: 'memberIds phải là một mảng'
        });
      }

      const normalizedMemberIds = (memberIds || []).filter(
        (id) => typeof id === 'string' && id !== req.userId
      );

      const result = await messageService.createGroupConversation(
        req.userId,
        name,
        normalizedMemberIds
      );

      res.status(201).json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Lấy danh sách tin nhắn trong phòng
   * GET /api/v1/conversations/:id/messages
   */
  async getMessages(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.userId) {
        return res.status(401).json({ message: 'Chưa xác thực' });
      }

      const { id } = req.params;
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;

      const data = await messageService.getMessages(id, req.userId, page, limit);

      res.status(200).json({
        success: true,
        data
      });
    } catch (error: any) {
      if (error.message === 'Bạn không ở trong phòng chat này') {
        return res.status(403).json({
          success: false,
          message: error.message
        });
      }
      next(error);
    }
  }

  /**
   * Lọc tin nhắn theo người gửi trong phòng
   * GET /api/v1/conversations/:id/messages/filter
   */
  async getMessagesBySender(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.userId) {
        return res.status(401).json({ message: 'Chưa xác thực' });
      }

      const { id } = req.params;
      const senderId = req.query.senderId as string;
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;

      if (!senderId || typeof senderId !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'senderId là bắt buộc và phải là string hợp lệ'
        });
      }

      const data = await messageService.getMessagesBySender(id, req.userId, senderId, page, limit);

      res.status(200).json({
        success: true,
        data
      });
    } catch (error: any) {
      if (error.message === 'Bạn không ở trong phòng chat này') {
        return res.status(403).json({
          success: false,
          message: error.message
        });
      }

      if (error.message === 'Người gửi không ở trong phòng chat này') {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }

      next(error);
    }
  }

  /**
   * Gửi tin nhắn
   * POST /api/v1/conversations/:id/messages
   */
  async sendMessage(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.userId) {
        return res.status(401).json({ message: 'Chưa xác thực' });
      }

      const { id } = req.params;
      const {
        type,
        text,
        mediaUrl,
        mimeType,
        fileName,
        fileSize,
        duration,
        replyToMessageId
      } = req.body as {
        type?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FILE' | 'SYSTEM';
        text?: string;
        mediaUrl?: string;
        mimeType?: string;
        fileName?: string;
        fileSize?: number;
        duration?: number;
        replyToMessageId?: string;
      };

      if (!type || !['TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'FILE', 'SYSTEM'].includes(type)) {
        return res.status(400).json({
          success: false,
          message: 'Loại tin nhắn không hợp lệ'
        });
      }

      const message = await messageService.sendMessage(id, req.userId, {
        type,
        text,
        mediaUrl,
        mimeType,
        fileName,
        fileSize,
        duration,
        replyToMessageId
      });

      res.status(201).json({
        success: true,
        data: message
      });
    } catch (error: any) {
      if (
        error.message === 'Phòng chat không tồn tại' ||
        error.message === 'Bạn không ở trong phòng chat này'
      ) {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }

      if (error.message && error.message.includes('chặn nhau')) {
        return res.status(403).json({
          success: false,
          message: error.message
        });
      }

      if (error.message && error.message.startsWith('Tin nhắn')) {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }

      next(error);
    }
  }

  /**
   * Cập nhật cấu hình phòng cho user (nickname, background, mute, pin, block)
   * PATCH /api/v1/conversations/:id/settings
   */
  async updateMemberSettings(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.userId) {
        return res.status(401).json({ message: 'Chưa xác thực' });
      }

      const { id } = req.params;
      const { nickname, customBackground, isMuted, isPinned, isConversationBlocked } = req.body;

      const member = await messageService.updateMemberSettings(id, req.userId, {
        nickname,
        customBackground,
        isMuted,
        isPinned,
        isConversationBlocked
      });

      res.status(200).json({
        success: true,
        data: member
      });
    } catch (error: any) {
      if (error.message === 'Không có dữ liệu nào để cập nhật') {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }

      if (error.message === 'Bạn không ở trong phòng chat này') {
        return res.status(403).json({
          success: false,
          message: error.message
        });
      }

      next(error);
    }
  }

  /**
   * Thêm / cập nhật reaction cho tin nhắn
   * POST /api/v1/conversations/:conversationId/messages/:messageId/reactions
   */
  async addReaction(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.userId) {
        return res.status(401).json({ message: 'Chưa xác thực' });
      }

      const { conversationId, messageId } = req.params as {
        conversationId: string;
        messageId: string;
      };

      const { type } = req.body as { type?: string };

      const allowedTypes = ['LIKE', 'LOVE', 'HAHA', 'WOW', 'SAD', 'ANGRY'];
      if (!type || !allowedTypes.includes(type)) {
        return res.status(400).json({
          success: false,
          message: 'Loại reaction không hợp lệ'
        });
      }

      const message = await messageService.addOrUpdateReaction(
        conversationId,
        req.userId,
        messageId,
        type as any
      );

      res.status(200).json({
        success: true,
        data: message
      });
    } catch (error: any) {
      if (
        error.message === 'Bạn không ở trong phòng chat này' ||
        error.message === 'Tin nhắn không tồn tại'
      ) {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }

      next(error);
    }
  }

  /**
   * Xóa reaction của user trên tin nhắn
   * DELETE /api/v1/conversations/:conversationId/messages/:messageId/reactions
   */
  async removeReaction(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.userId) {
        return res.status(401).json({ message: 'Chưa xác thực' });
      }

      const { conversationId, messageId } = req.params as {
        conversationId: string;
        messageId: string;
      };

      const message = await messageService.removeReaction(
        conversationId,
        req.userId,
        messageId
      );

      res.status(200).json({
        success: true,
        data: message
      });
    } catch (error: any) {
      if (
        error.message === 'Bạn không ở trong phòng chat này' ||
        error.message === 'Tin nhắn không tồn tại'
      ) {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }

      next(error);
    }
  }
}

const messageController = new MessageController();
export default messageController;


