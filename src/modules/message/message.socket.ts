import { Server, Socket } from 'socket.io';
import { verifyToken } from '../../config/jwt';
import ConversationMember from './models/conversation-member.model';

interface MessageSocket extends Socket {
  userId?: string;
}

/**
 * Initialize Message Socket Events
 * - Auth bằng JWT (giống friends socket)
 * - Join room theo userId + conversationId
 * - Dùng cho realtime chat (tin nhắn mới, update unread, v.v.)
 */
export const initializeMessageSocket = (io: Server) => {
  // Middleware auth
  io.use((socket: MessageSocket, next) => {
    try {
      const token = socket.handshake.auth?.token;

      if (!token) {
        return next(new Error('Chưa cung cấp token'));
      }

      const decoded = verifyToken(token);

      if (!decoded) {
        return next(new Error('Token không hợp lệ hoặc đã hết hạn'));
      }

      socket.userId = (decoded as any).userId;
      next();
    } catch (error: any) {
      next(error);
    }
  });

  io.on('connection', (socket: MessageSocket) => {
    const userId = socket.userId;

    if (!userId) {
      socket.disconnect();
      return;
    }

    // Join room theo userId để nhận các update liên quan đến danh sách phòng
    socket.join(`user:${userId}`);

    console.log(`[Message Socket] User ${userId} đã kết nối (Socket ID: ${socket.id})`);

    /**
     * Client join 1 conversation khi mở phòng chat
     * data: { conversationId: string }
     */
    socket.on('conversation:join', async (data: { conversationId?: string }) => {
      const conversationId = data?.conversationId;
      if (!conversationId) return;

      socket.join(`conversation:${conversationId}`);

      try {
        // Reset unreadCount khi user mở phòng (theo rule: chỉ khi thật sự open)
        await ConversationMember.updateOne(
          {
            conversationId,
            userId
          },
          {
            $set: { unreadCount: 0 }
          }
        );

        // Thông báo client reload list phòng nếu cần
        socket.emit('conversations:updated', {
          userId,
          timestamp: new Date()
        });
      } catch (error) {
        console.error('[Message Socket] Lỗi reset unreadCount:', error);
      }

      console.log(
        `[Message Socket] User ${userId} joined conversation room conversation:${conversationId}`
      );
    });

    /**
     * Client rời phòng khi đóng màn chat
     */
    socket.on('conversation:leave', (data: { conversationId?: string }) => {
      const conversationId = data?.conversationId;
      if (!conversationId) return;

      socket.leave(`conversation:${conversationId}`);
      console.log(
        `[Message Socket] User ${userId} left conversation room conversation:${conversationId}`
      );
    });

    socket.on('disconnect', () => {
      console.log(`[Message Socket] User ${userId} đã ngắt kết nối`);
    });
  });
};

/**
 * Emit tin nhắn mới đến tất cả thành viên trong phòng
 */
export const emitNewMessage = (
  io: Server,
  conversationId: string,
  message: any,
  options: { senderId: string }
) => {
  io.to(`conversation:${conversationId}`).emit('message:new', {
    conversationId,
    message,
    senderId: options.senderId,
    timestamp: new Date()
  });
};

/**
 * Emit cập nhật reaction của 1 tin nhắn
 */
export const emitMessageReactionUpdated = (
  io: Server,
  conversationId: string,
  payload: {
    conversationId: string;
    messageId: string;
    userId: string;
    type: string | null;
    action: 'added' | 'removed';
    reactions: any[];
    timestamp: Date;
  }
) => {
  io.to(`conversation:${conversationId}`).emit('message:reaction', payload);
};

/**
 * Emit cập nhật danh sách phòng (lastMessage, unreadCount, v.v.)
 * Để client refresh list conversations
 */
export const emitConversationListUpdated = (io: Server, userId: string) => {
  io.to(`user:${userId}`).emit('conversations:updated', {
    userId,
    timestamp: new Date()
  });
};

export default initializeMessageSocket;


