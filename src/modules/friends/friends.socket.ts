import { Server } from 'socket.io';
import { verifyToken } from '../../config/jwt';

interface FriendsSocket {
  userId?: string;
}

/**
 * Initialize Friends Socket Events
 * Handles real-time friend request notifications
 */
export const initializeFriendsSocket = (io: Server) => {
  // Sử dụng middleware từ auth socket để verify token
  io.use((socket: any, next) => {
    try {
      const token = socket.handshake.auth.token;

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

  io.on('connection', (socket: any) => {
    const userId = socket.userId;
    
    if (!userId) {
      socket.disconnect();
      return;
    }

    // Join room cho user để nhận notifications
    socket.join(`user:${userId}`);
    socket.join(`friends:${userId}`);

    console.log(`[Friends Socket] User ${userId} đã kết nối (Socket ID: ${socket.id})`);

    socket.on('disconnect', () => {
      console.log(`[Friends Socket] User ${userId} đã ngắt kết nối`);
    });
  });
};

/**
 * Emit friend request notification to receiver
 */
export const emitFriendRequestReceived = (io: Server, receiverId: string, friendRequest: any) => {
  io.to(`user:${receiverId}`).emit('friend:request:received', {
    friendRequest,
    timestamp: new Date()
  });
  console.log(`[Friends Socket] Đã gửi friend request notification đến user ${receiverId}`);
};

/**
 * Emit friend request update to sender (when accepted/rejected)
 */
export const emitFriendRequestUpdated = (io: Server, senderId: string, friendRequest: any, action: 'accepted' | 'rejected' | 'cancelled') => {
  io.to(`user:${senderId}`).emit('friend:request:updated', {
    friendRequest,
    action,
    timestamp: new Date()
  });
  console.log(`[Friends Socket] Đã gửi friend request update (${action}) đến user ${senderId}`);
};

/**
 * Emit new friendship notification to both users
 */
export const emitFriendshipCreated = (io: Server, userId1: string, userId2: string, friendData: any) => {
  // Notify both users
  io.to(`user:${userId1}`).emit('friend:added', {
    friend: friendData,
    timestamp: new Date()
  });
  io.to(`user:${userId2}`).emit('friend:added', {
    friend: friendData,
    timestamp: new Date()
  });
  console.log(`[Friends Socket] Đã gửi friendship notification đến users ${userId1} và ${userId2}`);
};

/**
 * Emit friendship removed notification
 */
export const emitFriendshipRemoved = (io: Server, userId1: string, userId2: string) => {
  io.to(`user:${userId1}`).emit('friend:removed', {
    friendId: userId2,
    timestamp: new Date()
  });
  io.to(`user:${userId2}`).emit('friend:removed', {
    friendId: userId1,
    timestamp: new Date()
  });
  console.log(`[Friends Socket] Đã gửi friendship removed notification đến users ${userId1} và ${userId2}`);
};

/**
 * Emit friend request list update để app refresh danh sách
 */
export const emitFriendRequestListUpdate = (io: Server, userId: string, type: 'received' | 'sent' | 'all' = 'all') => {
  io.to(`user:${userId}`).emit('friend:request:list:update', {
    type,
    timestamp: new Date()
  });
  console.log(`[Friends Socket] Đã gửi friend request list update (${type}) đến user ${userId}`);
};

export default initializeFriendsSocket;

