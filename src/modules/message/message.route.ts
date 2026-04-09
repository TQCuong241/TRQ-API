import { Router } from 'express';
import messageController from './message.controller';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { uploadChatImage } from '../../middlewares/chat-image.middleware';
import { uploadChatVideo } from '../../middlewares/chat-video.middleware';
import { uploadChatAudio } from '../../middlewares/chat-audio.middleware';
import { uploadChatDocument } from '../../middlewares/chat-document.middleware';

const router = Router();

// ─────────────────────────────────────────────────────────
// Conversations
// ─────────────────────────────────────────────────────────

// Danh sách phòng chat
router.get('/', authMiddleware, (req, res, next) =>
  messageController.getConversations(req, res, next)
);

// Tạo / lấy phòng 1-1
router.post('/private', authMiddleware, (req, res, next) =>
  messageController.createPrivateConversation(req, res, next)
);

// Tạo phòng nhóm
router.post('/group', authMiddleware, (req, res, next) =>
  messageController.createGroupConversation(req, res, next)
);

// ─────────────────────────────────────────────────────────
// Upload media (đặt trước các :id routes để tránh conflict)
// ─────────────────────────────────────────────────────────

// Upload ảnh
router.post('/:id/upload/image', authMiddleware, (req, res, next) => {
  uploadChatImage.single('file')(req, res, (err: any) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, message: 'File ảnh quá lớn (tối đa 10MB)' });
      }
      if (err.message && err.message.includes('Chỉ chấp nhận file ảnh')) {
        return res.status(400).json({ success: false, message: err.message });
      }
      return next(err);
    }
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      return res.status(400).json({ success: false, message: 'Không có file được upload' });
    }
    res.status(201).json({
      success: true,
      data: {
        url: `/uploads/chat/${file.filename}`,
        mimeType: file.mimetype,
        fileName: file.originalname,
        fileSize: file.size
      }
    });
  });
});

// Upload video
router.post('/:id/upload/video', authMiddleware, (req, res, next) => {
  uploadChatVideo.single('file')(req, res, (err: any) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, message: 'File video quá lớn (tối đa 100MB)' });
      }
      if (err.message && err.message.includes('Chỉ chấp nhận file video')) {
        return res.status(400).json({ success: false, message: err.message });
      }
      return next(err);
    }
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      return res.status(400).json({ success: false, message: 'Không có file được upload' });
    }
    res.status(201).json({
      success: true,
      data: {
        url: `/uploads/chat/${file.filename}`,
        mimeType: file.mimetype,
        fileName: file.originalname,
        fileSize: file.size
      }
    });
  });
});

// Upload audio
router.post('/:id/upload/audio', authMiddleware, (req, res, next) => {
  uploadChatAudio.single('file')(req, res, (err: any) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, message: 'File audio quá lớn (tối đa 50MB)' });
      }
      if (err.message && err.message.includes('Chỉ chấp nhận file audio')) {
        return res.status(400).json({ success: false, message: err.message });
      }
      return next(err);
    }
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      return res.status(400).json({ success: false, message: 'Không có file được upload' });
    }
    res.status(201).json({
      success: true,
      data: {
        url: `/uploads/chat/${file.filename}`,
        mimeType: file.mimetype,
        fileName: file.originalname,
        fileSize: file.size
      }
    });
  });
});

// Upload tài liệu / file
router.post('/:id/upload/file', authMiddleware, (req, res, next) => {
  uploadChatDocument.single('file')(req, res, (err: any) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, message: 'File tài liệu quá lớn (tối đa 50MB)' });
      }
      if (err.message && err.message.includes('Chỉ chấp nhận file tài liệu')) {
        return res.status(400).json({ success: false, message: err.message });
      }
      return next(err);
    }
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      return res.status(400).json({ success: false, message: 'Không có file được upload' });
    }
    res.status(201).json({
      success: true,
      data: {
        url: `/uploads/chat/${file.filename}`,
        mimeType: file.mimetype,
        fileName: file.originalname,
        fileSize: file.size
      }
    });
  });
});

// ─────────────────────────────────────────────────────────
// Draft (phải đặt trước /:id/messages để tránh conflict)
// ─────────────────────────────────────────────────────────

// Lưu nháp
router.post('/:id/draft', authMiddleware, (req, res, next) =>
  messageController.saveDraft(req, res, next)
);

// Lấy nháp
router.get('/:id/draft', authMiddleware, (req, res, next) =>
  messageController.getDraft(req, res, next)
);

// ─────────────────────────────────────────────────────────
// Messages (đặt các static sub-paths trước /:messageId)
// ─────────────────────────────────────────────────────────

// Tìm kiếm tin nhắn (phải đặt trước /:id/messages để không conflict)
router.get('/:id/messages/search', authMiddleware, (req, res, next) =>
  messageController.searchMessages(req, res, next)
);

// Tin nhắn đã ghim
router.get('/:id/messages/pinned', authMiddleware, (req, res, next) =>
  messageController.getPinnedMessages(req, res, next)
);

// Lọc tin nhắn theo người gửi
router.get('/:id/messages/filter', authMiddleware, (req, res, next) =>
  messageController.getMessagesBySender(req, res, next)
);

// Danh sách tin nhắn trong phòng
router.get('/:id/messages', authMiddleware, (req, res, next) =>
  messageController.getMessages(req, res, next)
);

// Gửi tin nhắn
router.post('/:id/messages', authMiddleware, (req, res, next) =>
  messageController.sendMessage(req, res, next)
);

// Sửa tin nhắn
router.put('/:id/messages/:messageId', authMiddleware, (req, res, next) =>
  messageController.editMessage(req, res, next)
);

// Xóa tin nhắn
router.delete('/:id/messages/:messageId', authMiddleware, (req, res, next) =>
  messageController.deleteMessage(req, res, next)
);

// Forward tin nhắn
router.post('/:id/messages/:messageId/forward', authMiddleware, (req, res, next) =>
  messageController.forwardMessage(req, res, next)
);

// Ghim tin nhắn
router.post('/:id/messages/:messageId/pin', authMiddleware, (req, res, next) =>
  messageController.pinMessage(req, res, next)
);

// Bỏ ghim tin nhắn
router.delete('/:id/messages/:messageId/pin', authMiddleware, (req, res, next) =>
  messageController.unpinMessage(req, res, next)
);

// Đánh dấu đã đọc
router.patch('/:id/messages/:messageId/seen', authMiddleware, (req, res, next) =>
  messageController.markMessageSeen(req, res, next)
);

// ─────────────────────────────────────────────────────────
// Reactions
// ─────────────────────────────────────────────────────────

// Thêm / cập nhật reaction
router.post(
  '/:conversationId/messages/:messageId/reactions',
  authMiddleware,
  (req, res, next) => messageController.addReaction(req, res, next)
);

// Xóa reaction
router.delete(
  '/:conversationId/messages/:messageId/reactions',
  authMiddleware,
  (req, res, next) => messageController.removeReaction(req, res, next)
);

// ─────────────────────────────────────────────────────────
// Settings per-user & Room Theme
// ─────────────────────────────────────────────────────────

// Cập nhật cấu hình phòng cho user
router.patch('/:id/settings', authMiddleware, (req, res, next) =>
  messageController.updateMemberSettings(req, res, next)
);

// Cập nhật Theme Emoji
router.patch('/:id/theme-emoji', authMiddleware, (req, res, next) =>
  messageController.updateThemeEmoji(req, res, next)
);

// Lấy shared media (ảnh, video, audio, file) trong phòng
router.get('/:id/shared-media', authMiddleware, (req, res, next) =>
  messageController.getSharedMedia(req, res, next)
);

// Xóa lịch sử cuộc trò chuyện
router.delete('/:id/history', authMiddleware, (req, res, next) =>
  messageController.deleteConversationHistory(req, res, next)
);

// ─────────────────────────────────────────────────────────────────────────
// Group Management
// ─────────────────────────────────────────────────────────────────────────


// Lấy danh sách thành viên nhóm
router.get('/:id/members', authMiddleware, (req, res, next) =>
  messageController.getGroupMembers(req, res, next)
);

// Thêm thành viên vào nhóm
router.post('/:id/members', authMiddleware, (req, res, next) =>
  messageController.addGroupMembers(req, res, next)
);

// Xóa thành viên khỏi nhóm
router.delete('/:id/members/:userId', authMiddleware, (req, res, next) =>
  messageController.removeGroupMember(req, res, next)
);

// Đổi tên nhóm
router.patch('/:id/name', authMiddleware, (req, res, next) =>
  messageController.renameGroup(req, res, next)
);

// Đổi avatar nhóm
router.patch('/:id/avatar', authMiddleware, (req, res, next) =>
  messageController.updateGroupAvatar(req, res, next)
);

// Thoát nhóm
router.post('/:id/leave', authMiddleware, (req, res, next) =>
  messageController.leaveGroup(req, res, next)
);

export default router;

