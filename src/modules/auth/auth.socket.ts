import { Server, Socket } from 'socket.io';
import { verifyToken } from '../../config/jwt';
import User from './auth.model';

interface AuthSocket extends Socket {
  userId?: string;
}

export const initializeAuthSocket = (io: Server) => {
  io.use((socket: AuthSocket, next) => {
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

  io.on('connection', async (socket: AuthSocket) => {
    console.log(`Người dùng đã kết nối: ${socket.userId} (Socket ID: ${socket.id})`);

    socket.join(`user:${socket.userId}`);

    // Update last seen - removed usersService dependency
    // await usersService.updateLastSeen(socket.userId!);

    const connectedUserIds = new Set<string>();
    io.sockets.sockets.forEach((s: AuthSocket) => {
      if (s.userId) connectedUserIds.add(s.userId);
    });
    socket.emit('users:online:list', { userIds: Array.from(connectedUserIds) });

    socket.broadcast.emit('user:online', {
      userId: socket.userId,
      socketId: socket.id,
      timestamp: new Date()
    });

    socket.on('user:update', (data) => {
      io.emit('user:info:updated', {
        userId: socket.userId,
        username: data.username,
        email: data.email,
        timestamp: new Date()
      });
    });

    socket.on('user:activity', (data) => {
      io.emit('user:activity', {
        userId: socket.userId,
        activity: data,
        timestamp: new Date()
      });
    });

    socket.on('disconnect', async () => {
      console.log(`Người dùng đã ngắt kết nối: ${socket.userId}`);
      
      // Update online status on disconnect - removed usersService dependency
      // await usersService.updateOnlineStatusOnDisconnect(socket.userId!);

      socket.broadcast.emit('user:offline', {
        userId: socket.userId,
        timestamp: new Date()
      });
    });

    socket.on('error', (error) => {
      console.error(`Lỗi từ người dùng ${socket.userId}:`, error);
    });

    socket.emit('auth:connected', {
      message: 'Kết nối realtime thành công',
      userId: socket.userId,
      timestamp: new Date()
    });
  });
};

export default initializeAuthSocket;
