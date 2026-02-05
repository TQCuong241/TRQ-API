import { Server, Socket } from 'socket.io';
import notificationsService from './notifications.service';

/**
 * Initialize Notifications Socket
 * Socket join room theo userId (theo checklist)
 */
export const initializeNotificationsSocket = (io: Server) => {
  io.on('connection', (socket: Socket) => {
    // User join room theo userId khi đã authenticate
    socket.on('notifications:join', async (data: { userId: string }) => {
      try {
        const { userId } = data;
        if (!userId) {
          return;
        }

        // Join room theo userId
        socket.join(`user:${userId}`);
        console.log(`[Notifications] User ${userId} joined notification room`);
      } catch (error) {
        console.error('[Notifications] Error joining room:', error);
      }
    });

    // User leave room khi disconnect
    socket.on('disconnect', () => {
      console.log('[Notifications] User disconnected');
    });
  });
};

/**
 * Emit new notification to user (theo checklist: emit new_notification)
 */
export const emitNewNotification = (io: Server, userId: string, notification: any) => {
  io.to(`user:${userId}`).emit('new_notification', {
    notification,
    unreadCount: null // Sẽ được update sau
  });
};

/**
 * Emit unread count update
 */
export const emitUnreadCountUpdate = async (io: Server, userId: string) => {
  try {
    const count = await notificationsService.getUnreadCount(userId);
    io.to(`user:${userId}`).emit('notification:unread_count', {
      count
    });
  } catch (error) {
    console.error('[Notifications] Error emitting unread count:', error);
  }
};

