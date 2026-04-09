import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth.middleware';
import messageService from './message.service';

class MessageController {
  /**
   * Lấy danh sách phòng chat của user
   * GET /api/v1/conversations
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

      const filters: { type?: 'PRIVATE' | 'GROUP'; search?: string } = {};

      if (type && (type === 'PRIVATE' || type === 'GROUP')) {
        filters.type = type;
      }
      if (search && search.trim()) {
        filters.search = search.trim();
      }

      const data = await messageService.getUserConversations(
        req.userId,
        page,
        limit,
        Object.keys(filters).length > 0 ? filters : undefined
      );

      res.status(200).json({ success: true, data });
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
        return res.status(400).json({ success: false, message: 'userId không hợp lệ' });
      }

      const result = await messageService.ensurePrivateConversation(req.userId, userId);

      res.status(200).json({ success: true, data: result });
    } catch (error: any) {
      if (error.message && error.message.includes('chặn nhau')) {
        return res.status(403).json({ success: false, message: error.message });
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
        return res.status(400).json({ success: false, message: 'Tên nhóm không hợp lệ' });
      }

      if (memberIds && !Array.isArray(memberIds)) {
        return res.status(400).json({ success: false, message: 'memberIds phải là một mảng' });
      }

      const normalizedMemberIds = (memberIds || []).filter(
        (id) => typeof id === 'string' && id !== req.userId
      );

      const result = await messageService.createGroupConversation(
        req.userId,
        name,
        normalizedMemberIds
      );

      res.status(201).json({ success: true, data: result });
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
      const type = req.query.type as string | undefined;

      const data = await messageService.getMessages(id, req.userId, page, limit, type);

      res.status(200).json({ success: true, data });
    } catch (error: any) {
      if (error.message === 'Bạn không ở trong phòng chat này') {
        return res.status(403).json({ success: false, message: error.message });
      }
      next(error);
    }
  }

  /**
   * Lọc tin nhắn theo người gửi
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

      res.status(200).json({ success: true, data });
    } catch (error: any) {
      if (error.message === 'Bạn không ở trong phòng chat này') {
        return res.status(403).json({ success: false, message: error.message });
      }
      if (error.message === 'Người gửi không ở trong phòng chat này') {
        return res.status(400).json({ success: false, message: error.message });
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
      const { type, text, mediaUrl, mimeType, fileName, fileSize, duration, replyToMessageId } =
        req.body as {
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
        return res.status(400).json({ success: false, message: 'Loại tin nhắn không hợp lệ' });
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

      res.status(201).json({ success: true, data: message });
    } catch (error: any) {
      if (
        error.message === 'Phòng chat không tồn tại' ||
        error.message === 'Bạn không ở trong phòng chat này'
      ) {
        return res.status(404).json({ success: false, message: error.message });
      }
      if (error.message && error.message.includes('chặn nhau')) {
        return res.status(403).json({ success: false, message: error.message });
      }
      if (error.message && error.message.startsWith('Tin nhắn')) {
        return res.status(400).json({ success: false, message: error.message });
      }
      next(error);
    }
  }

  /**
   * Sửa tin nhắn
   * PUT /api/v1/conversations/:id/messages/:messageId
   */
  async editMessage(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.userId) {
        return res.status(401).json({ message: 'Chưa xác thực' });
      }

      const { id, messageId } = req.params;
      const { text } = req.body as { text?: string };

      if (!text || typeof text !== 'string' || text.trim().length === 0) {
        return res.status(400).json({ success: false, message: 'Nội dung tin nhắn không được trống' });
      }

      const message = await messageService.editMessage(id, req.userId, messageId, text.trim());

      res.status(200).json({ success: true, data: message });
    } catch (error: any) {
      if (
        error.message === 'Bạn không ở trong phòng chat này' ||
        error.message === 'Tin nhắn không tồn tại'
      ) {
        return res.status(404).json({ success: false, message: error.message });
      }
      if (
        error.message === 'Bạn không có quyền sửa tin nhắn này' ||
        error.message === 'Không thể sửa tin nhắn đã xóa'
      ) {
        return res.status(403).json({ success: false, message: error.message });
      }
      next(error);
    }
  }

  /**
   * Xóa tin nhắn
   * DELETE /api/v1/conversations/:id/messages/:messageId
   */
  async deleteMessage(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.userId) {
        return res.status(401).json({ message: 'Chưa xác thực' });
      }

      const { id, messageId } = req.params;
      
      let deleteForEveryone = req.body?.deleteForEveryone;
      if (deleteForEveryone === undefined) {
        deleteForEveryone = req.query.deleteForEveryone === 'true';
      }

      const result = await messageService.deleteMessage(
        id,
        req.userId,
        messageId,
        deleteForEveryone === true || deleteForEveryone === 'true'
      );

      res.status(200).json({ success: true, data: result });
    } catch (error: any) {
      if (
        error.message === 'Bạn không ở trong phòng chat này' ||
        error.message === 'Tin nhắn không tồn tại'
      ) {
        return res.status(404).json({ success: false, message: error.message });
      }
      if (error.message === 'Bạn không có quyền xóa tin nhắn này') {
        return res.status(403).json({ success: false, message: error.message });
      }
      next(error);
    }
  }

  /**
   * Chuyển tiếp tin nhắn
   * POST /api/v1/conversations/:id/messages/:messageId/forward
   */
  async forwardMessage(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.userId) {
        return res.status(401).json({ message: 'Chưa xác thực' });
      }

      const { id, messageId } = req.params;
      const { targetConversationIds } = req.body as { targetConversationIds?: string[] };

      if (!Array.isArray(targetConversationIds) || targetConversationIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'targetConversationIds phải là mảng không rỗng'
        });
      }

      const result = await messageService.forwardMessage(
        id,
        req.userId,
        messageId,
        targetConversationIds
      );

      res.status(200).json({ success: true, data: result });
    } catch (error: any) {
      if (
        error.message === 'Bạn không ở trong phòng chat này' ||
        error.message === 'Tin nhắn không tồn tại'
      ) {
        return res.status(404).json({ success: false, message: error.message });
      }
      next(error);
    }
  }

  /**
   * Ghim tin nhắn
   * POST /api/v1/conversations/:id/messages/:messageId/pin
   */
  async pinMessage(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.userId) {
        return res.status(401).json({ message: 'Chưa xác thực' });
      }

      const { id, messageId } = req.params;
      const message = await messageService.pinMessage(id, req.userId, messageId);

      res.status(200).json({ success: true, data: message });
    } catch (error: any) {
      if (
        error.message === 'Bạn không ở trong phòng chat này' ||
        error.message === 'Tin nhắn không tồn tại'
      ) {
        return res.status(404).json({ success: false, message: error.message });
      }
      next(error);
    }
  }

  /**
   * Bỏ ghim tin nhắn
   * DELETE /api/v1/conversations/:id/messages/:messageId/pin
   */
  async unpinMessage(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.userId) {
        return res.status(401).json({ message: 'Chưa xác thực' });
      }

      const { id, messageId } = req.params;
      const result = await messageService.unpinMessage(id, req.userId, messageId);

      res.status(200).json({ success: true, data: result });
    } catch (error: any) {
      if (
        error.message === 'Bạn không ở trong phòng chat này' ||
        error.message === 'Tin nhắn không tồn tại'
      ) {
        return res.status(404).json({ success: false, message: error.message });
      }
      next(error);
    }
  }

  /**
   * Lấy danh sách tin nhắn đã ghim
   * GET /api/v1/conversations/:id/messages/pinned
   */
  async getPinnedMessages(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.userId) {
        return res.status(401).json({ message: 'Chưa xác thực' });
      }

      const { id } = req.params;
      const data = await messageService.getPinnedMessages(id, req.userId);

      res.status(200).json({ success: true, data });
    } catch (error: any) {
      if (error.message === 'Bạn không ở trong phòng chat này') {
        return res.status(403).json({ success: false, message: error.message });
      }
      next(error);
    }
  }

  /**
   * Đánh dấu tin nhắn đã xem
   * PATCH /api/v1/conversations/:id/messages/:messageId/seen
   */
  async markMessageSeen(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.userId) {
        return res.status(401).json({ message: 'Chưa xác thực' });
      }

      const { id, messageId } = req.params;
      const result = await messageService.markMessageSeen(id, req.userId, messageId);

      res.status(200).json({ success: true, data: result });
    } catch (error: any) {
      if (
        error.message === 'Bạn không ở trong phòng chat này' ||
        error.message === 'Tin nhắn không tồn tại'
      ) {
        return res.status(404).json({ success: false, message: error.message });
      }
      next(error);
    }
  }

  /**
   * Tìm kiếm tin nhắn trong phòng
   * GET /api/v1/conversations/:id/messages/search
   */
  async searchMessages(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.userId) {
        return res.status(401).json({ message: 'Chưa xác thực' });
      }

      const { id } = req.params;
      const q = req.query.q as string;
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

      if (!q || q.trim().length === 0) {
        return res.status(400).json({ success: false, message: 'Từ khóa tìm kiếm không được trống' });
      }

      const data = await messageService.searchMessages(id, req.userId, q.trim(), page, limit);

      res.status(200).json({ success: true, data });
    } catch (error: any) {
      if (error.message === 'Bạn không ở trong phòng chat này') {
        return res.status(403).json({ success: false, message: error.message });
      }
      next(error);
    }
  }

  /**
   * Lưu nháp tin nhắn
   * POST /api/v1/conversations/:id/draft
   */
  async saveDraft(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.userId) {
        return res.status(401).json({ message: 'Chưa xác thực' });
      }

      const { id } = req.params;
      const { text } = req.body as { text?: string };

      const result = await messageService.saveDraft(id, req.userId, text || '');

      res.status(200).json({ success: true, data: result });
    } catch (error: any) {
      if (error.message === 'Bạn không ở trong phòng chat này') {
        return res.status(403).json({ success: false, message: error.message });
      }
      next(error);
    }
  }

  /**
   * Lấy nháp tin nhắn
   * GET /api/v1/conversations/:id/draft
   */
  async getDraft(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.userId) {
        return res.status(401).json({ message: 'Chưa xác thực' });
      }

      const { id } = req.params;
      const result = await messageService.getDraft(id, req.userId);

      res.status(200).json({ success: true, data: result });
    } catch (error: any) {
      if (error.message === 'Bạn không ở trong phòng chat này') {
        return res.status(403).json({ success: false, message: error.message });
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

      res.status(200).json({ success: true, data: member });
    } catch (error: any) {
      if (error.message === 'Không có dữ liệu nào để cập nhật') {
        return res.status(400).json({ success: false, message: error.message });
      }
      if (error.message === 'Bạn không ở trong phòng chat này') {
        return res.status(403).json({ success: false, message: error.message });
      }
      next(error);
    }
  }

  /**
   * Cập nhật theme emoji của phòng chat
   * PATCH /api/v1/conversations/:id/theme-emoji
   */
  async updateThemeEmoji(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.userId) {
        return res.status(401).json({ message: 'Chưa xác thực' });
      }

      const { id } = req.params;
      const { themeEmoji } = req.body as { themeEmoji?: string };

      if (!themeEmoji || typeof themeEmoji !== 'string') {
        return res.status(400).json({ success: false, message: 'themeEmoji không hợp lệ' });
      }

      const result = await messageService.updateThemeEmoji(id, req.userId, themeEmoji);

      res.status(200).json({ success: true, data: result });
    } catch (error: any) {
      if (error.message === 'Bạn không ở trong phòng chat này') {
        return res.status(403).json({ success: false, message: error.message });
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
        return res.status(400).json({ success: false, message: 'Loại reaction không hợp lệ' });
      }

      const message = await messageService.addOrUpdateReaction(
        conversationId,
        req.userId,
        messageId,
        type as any
      );

      res.status(200).json({ success: true, data: message });
    } catch (error: any) {
      if (
        error.message === 'Bạn không ở trong phòng chat này' ||
        error.message === 'Tin nhắn không tồn tại'
      ) {
        return res.status(404).json({ success: false, message: error.message });
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

      const message = await messageService.removeReaction(conversationId, req.userId, messageId);

      res.status(200).json({ success: true, data: message });
    } catch (error: any) {
      if (
        error.message === 'Bạn không ở trong phòng chat này' ||
        error.message === 'Tin nhắn không tồn tại'
      ) {
        return res.status(404).json({ success: false, message: error.message });
      }
      next(error);
    }
  }

  /**
   * Xóa toàn bộ lịch sử trò chuyện (bên phía mình)
   * DELETE /api/v1/conversations/:id/history
   */
  async deleteConversationHistory(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.userId) {
        return res.status(401).json({ message: 'Chưa xác thực' });
      }

      const { id } = req.params;

      const result = await messageService.deleteConversationHistory(id, req.userId);

      res.status(200).json({ success: true, data: result });
    } catch (error: any) {
      if (error.message === 'Bạn không ở trong phòng chat này') {
        return res.status(403).json({ success: false, message: error.message });
      }
      next(error);
    }
  }

  // ─────────────────────────────────────────────────────────
  // Group Management
  // ─────────────────────────────────────────────────────────

  /**
   * Lấy danh sách thành viên nhóm
   * GET /api/v1/conversations/:id/members
   */
  async getGroupMembers(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.userId) {
        return res.status(401).json({ message: 'Chưa xác thực' });
      }

      const { id } = req.params;
      const data = await messageService.getGroupMembers(id, req.userId);

      res.status(200).json({ success: true, data });
    } catch (error: any) {
      if (error.message === 'Bạn không ở trong phòng chat này') {
        return res.status(403).json({ success: false, message: error.message });
      }
      next(error);
    }
  }

  /**
   * Thêm thành viên vào nhóm
   * POST /api/v1/conversations/:id/members
   */
  async addGroupMembers(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.userId) {
        return res.status(401).json({ message: 'Chưa xác thực' });
      }

      const { id } = req.params;
      const { memberIds } = req.body as { memberIds?: string[] };

      if (!Array.isArray(memberIds) || memberIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'memberIds phải là mảng không rỗng'
        });
      }

      const result = await messageService.addGroupMembers(id, req.userId, memberIds);

      res.status(200).json({ success: true, data: result });
    } catch (error: any) {
      if (error.message === 'Bạn không ở trong phòng chat này') {
        return res.status(403).json({ success: false, message: error.message });
      }
      if (error.message === 'Bạn không có quyền thêm thành viên') {
        return res.status(403).json({ success: false, message: error.message });
      }
      next(error);
    }
  }

  /**
   * Xóa thành viên khỏi nhóm
   * DELETE /api/v1/conversations/:id/members/:userId
   */
  async removeGroupMember(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.userId) {
        return res.status(401).json({ message: 'Chưa xác thực' });
      }

      const { id, userId: targetUserId } = req.params;
      const result = await messageService.removeGroupMember(id, req.userId, targetUserId);

      res.status(200).json({ success: true, data: result });
    } catch (error: any) {
      if (error.message === 'Bạn không ở trong phòng chat này') {
        return res.status(403).json({ success: false, message: error.message });
      }
      if (error.message === 'Bạn không có quyền xóa thành viên') {
        return res.status(403).json({ success: false, message: error.message });
      }
      next(error);
    }
  }

  /**
   * Đổi tên nhóm
   * PATCH /api/v1/conversations/:id/name
   */
  async renameGroup(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.userId) {
        return res.status(401).json({ message: 'Chưa xác thực' });
      }

      const { id } = req.params;
      const { name } = req.body as { name?: string };

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ success: false, message: 'Tên nhóm không hợp lệ' });
      }

      const result = await messageService.renameGroup(id, req.userId, name.trim());

      res.status(200).json({ success: true, data: result });
    } catch (error: any) {
      if (error.message === 'Bạn không ở trong phòng chat này') {
        return res.status(403).json({ success: false, message: error.message });
      }
      if (error.message === 'Bạn không có quyền đổi tên nhóm') {
        return res.status(403).json({ success: false, message: error.message });
      }
      next(error);
    }
  }

  /**
   * Đổi avatar nhóm
   * PATCH /api/v1/conversations/:id/avatar
   */
  async updateGroupAvatar(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.userId) {
        return res.status(401).json({ message: 'Chưa xác thực' });
      }

      const { id } = req.params;
      const { avatarUrl } = req.body as { avatarUrl?: string };

      if (!avatarUrl || typeof avatarUrl !== 'string') {
        return res.status(400).json({ success: false, message: 'avatarUrl không hợp lệ' });
      }

      const result = await messageService.updateGroupAvatar(id, req.userId, avatarUrl);

      res.status(200).json({ success: true, data: result });
    } catch (error: any) {
      if (error.message === 'Bạn không ở trong phòng chat này') {
        return res.status(403).json({ success: false, message: error.message });
      }
      next(error);
    }
  }

  /**
   * Lấy shared media (ảnh, video, audio, file)
   * GET /api/v1/conversations/:id/shared-media
   */
  async getSharedMedia(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.userId) {
        return res.status(401).json({ message: 'Chưa xác thực' });
      }

      const { id } = req.params;
      const type = req.query.type as 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FILE' | undefined;
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 30;

      if (type && !['IMAGE', 'VIDEO', 'AUDIO', 'FILE'].includes(type)) {
        return res.status(400).json({ success: false, message: 'type không hợp lệ' });
      }

      const data = await messageService.getSharedMedia(id, req.userId, type, page, limit);

      res.status(200).json({ success: true, data });
    } catch (error: any) {
      if (error.message === 'Bạn không ở trong phòng chat này') {
        return res.status(403).json({ success: false, message: error.message });
      }
      next(error);
    }
  }

  /**
   * Thoát nhóm
   * POST /api/v1/conversations/:id/leave
   */
  async leaveGroup(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.userId) {
        return res.status(401).json({ message: 'Chưa xác thực' });
      }

      const { id } = req.params;
      const result = await messageService.leaveGroup(id, req.userId);

      res.status(200).json({ success: true, data: result });
    } catch (error: any) {
      if (error.message === 'Bạn không ở trong phòng chat này') {
        return res.status(403).json({ success: false, message: error.message });
      }
      if (error.message === 'Admin không thể thoát nhóm khi còn thành viên khác') {
        return res.status(400).json({ success: false, message: error.message });
      }
      next(error);
    }
  }
}

const messageController = new MessageController();
export default messageController;
