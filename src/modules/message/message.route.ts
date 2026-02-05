import { Router } from 'express';
import messageController from './message.controller';
import { authMiddleware } from '../../middlewares/auth.middleware';
import {
  uploadChatImage,
  uploadChatVideo,
  uploadChatAudio,
  uploadChatDocument
} from '../../middlewares/upload-chat.middleware';

const router = Router();

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

// Upload media cho chat (ảnh)
router.post('/:id/upload/image', authMiddleware, (req, res, next) => {
  uploadChatImage.single('file')(req, res, (err: any) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: 'File ảnh quá lớn (tối đa 10MB)'
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

    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      return res.status(400).json({
        success: false,
        message: 'Không có file được upload'
      });
    }

    const url = `/uploads/chat/${file.filename}`;

    res.status(201).json({
      success: true,
      data: {
        url,
        mimeType: file.mimetype,
        fileName: file.originalname,
        fileSize: file.size
      }
    });
  });
});

// Upload media cho chat (video)
router.post('/:id/upload/video', authMiddleware, (req, res, next) => {
  uploadChatVideo.single('file')(req, res, (err: any) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: 'File video quá lớn (tối đa 100MB)'
        });
      }
      if (err.message && err.message.includes('Chỉ chấp nhận file video')) {
        return res.status(400).json({
          success: false,
          message: err.message
        });
      }
      return next(err);
    }

    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      return res.status(400).json({
        success: false,
        message: 'Không có file được upload'
      });
    }

    const url = `/uploads/chat/${file.filename}`;

    res.status(201).json({
      success: true,
      data: {
        url,
        mimeType: file.mimetype,
        fileName: file.originalname,
        fileSize: file.size
      }
    });
  });
});

// Upload media cho chat (audio)
router.post('/:id/upload/audio', authMiddleware, (req, res, next) => {
  uploadChatAudio.single('file')(req, res, (err: any) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: 'File audio quá lớn (tối đa 50MB)'
        });
      }
      if (err.message && err.message.includes('Chỉ chấp nhận file audio')) {
        return res.status(400).json({
          success: false,
          message: err.message
        });
      }
      return next(err);
    }

    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      return res.status(400).json({
        success: false,
        message: 'Không có file được upload'
      });
    }

    const url = `/uploads/chat/${file.filename}`;

    res.status(201).json({
      success: true,
      data: {
        url,
        mimeType: file.mimetype,
        fileName: file.originalname,
        fileSize: file.size
      }
    });
  });
});

// Upload tài liệu / file cho chat
router.post('/:id/upload/file', authMiddleware, (req, res, next) => {
  uploadChatDocument.single('file')(req, res, (err: any) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: 'File tài liệu quá lớn (tối đa 50MB)'
        });
      }
      if (err.message && err.message.includes('Chỉ chấp nhận file tài liệu')) {
        return res.status(400).json({
          success: false,
          message: err.message
        });
      }
      return next(err);
    }

    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      return res.status(400).json({
        success: false,
        message: 'Không có file được upload'
      });
    }

    const url = `/uploads/chat/${file.filename}`;

    res.status(201).json({
      success: true,
      data: {
        url,
        mimeType: file.mimetype,
        fileName: file.originalname,
        fileSize: file.size
      }
    });
  });
});

// Lọc tin nhắn theo người gửi (phải đặt trước /:id/messages để không bị conflict)
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

// Reactions cho tin nhắn
router.post(
  '/:conversationId/messages/:messageId/reactions',
  authMiddleware,
  (req, res, next) => messageController.addReaction(req, res, next)
);

router.delete(
  '/:conversationId/messages/:messageId/reactions',
  authMiddleware,
  (req, res, next) => messageController.removeReaction(req, res, next)
);

// Cập nhật cấu hình phòng cho user
router.patch('/:id/settings', authMiddleware, (req, res, next) =>
  messageController.updateMemberSettings(req, res, next)
);

export default router;


