import Notification, { INotification } from './models/notification.model';
import PushToken, { IPushToken } from './models/push-token.model';
import User from '../auth/auth.model';
import { sendPushNotification } from './push.service';

export class NotificationsService {
  /**
   * Tạo notification và gửi push notification
   * KHÔNG cho client tạo notification trực tiếp - chỉ dùng trong service
   */
  async createNotification(
    userId: string,
    type: 'friend_request' | 'friend_request_accepted' | 'friend_request_rejected' | 'friend_removed' | 'message' | 'call' | 'system',
    title: string,
    body: string,
    data?: any,
    fromUserId?: string,
    sendPush: boolean = true
  ): Promise<INotification> {
    // Notification type 'message' luôn được đánh dấu đã đọc ngay từ đầu
    const isRead = type === 'message';
    
    // Tạo notification trong DB
    const notification = await Notification.create({
      userId,
      fromUserId: fromUserId || undefined,
      type,
      title,
      body,
      data: data || {},
      read: isRead,
      readAt: isRead ? new Date() : undefined
    });

    // Gửi push notification nếu được yêu cầu
    if (sendPush) {
      await this.sendPushNotificationToUser(userId, title, body, {
        notificationId: notification._id.toString(),
        type,
        ...data
      });
    }

    // Emit socket event cho realtime (theo checklist: socket cho đang mở app)
    try {
      const { io } = await import('../../server');
      if (io) {
        const { emitNewNotification, emitUnreadCountUpdate } = await import('./notifications.socket');
        emitNewNotification(io, userId, notification.toObject());
        emitUnreadCountUpdate(io, userId);
      }
    } catch (error: any) {
      // Không throw error nếu socket chưa sẵn sàng
      console.error('Lỗi emit socket notification:', error);
    }

    return notification;
  }

  /**
   * Gửi push notification đến user
   * Chỉ gửi push khi user offline (theo checklist: Push chỉ gửi khi user offline)
   */
  private async sendPushNotificationToUser(
    userId: string,
    title: string,
    body: string,
    data: any
  ): Promise<void> {
    try {
      // Kiểm tra user có online không
      const user = await User.findById(userId).select('onlineStatus lastSeenAt').lean();
      
      // Nếu user online và vừa active gần đây (trong 5 phút), không gửi push
      // Vì user đang dùng app, sẽ nhận notification qua socket
      if (user?.onlineStatus === 'online') {
        const lastSeen = user.lastSeenAt ? new Date(user.lastSeenAt) : null;
        if (lastSeen) {
          const minutesSinceLastSeen = (Date.now() - lastSeen.getTime()) / (1000 * 60);
          if (minutesSinceLastSeen < 5) {
            // User đang online và active, không gửi push
            return;
          }
        }
      }

      // Lấy tất cả active push tokens của user
      const pushTokens = await PushToken.find({
        userId,
        active: true
      }).lean();

      if (pushTokens.length === 0) {
        // User chưa có push token, không thể gửi push
        return;
      }

      // Convert data object thành string (theo checklist: data là string)
      const dataString = Object.keys(data).reduce((acc, key) => {
        acc[key] = String(data[key]);
        return acc;
      }, {} as any);

      // Gửi push notification đến tất cả devices của user
      const pushPromises = pushTokens.map(token => 
        sendPushNotification(token.token, token.platform, title, body, dataString)
          .catch(error => {
            // Nếu token không hợp lệ, mark as inactive
            if (error.code === 'messaging/registration-token-not-registered' || 
                error.code === 'messaging/invalid-registration-token') {
              PushToken.updateOne(
                { _id: token._id },
                { active: false }
              ).catch(() => {});
            }
            console.error(`Error sending push to token ${token._id}:`, error.message);
          })
      );

      await Promise.allSettled(pushPromises);
    } catch (error: any) {
      console.error('Error sending push notification:', error);
      // Không throw error để không ảnh hưởng đến flow chính
    }
  }

  /**
   * Lấy danh sách notifications của user
   */
  async getNotifications(
    userId: string,
    options: {
      limit?: number;
      page?: number;
      read?: boolean;
      type?: string;
    } = {}
  ): Promise<{
    notifications: any[];
    total: number;
    page: number;
    totalPages: number;
    unreadCount: number;
  }> {
    const { limit = 20, page = 1, read, type } = options;
    const skip = (page - 1) * limit;

    // Build query
    const query: any = { userId };
    if (read !== undefined) {
      query.read = read;
    }
    if (type) {
      query.type = type;
    }

    // Get notifications and total count
    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Notification.countDocuments(query),
      Notification.countDocuments({ userId, read: false })
    ]);

    return {
      notifications,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      unreadCount
    };
  }

  /**
   * Đánh dấu notification là đã đọc
   */
  async markAsRead(notificationId: string, userId: string): Promise<INotification> {
    const notification = await Notification.findOne({
      _id: notificationId,
      userId
    });

    if (!notification) {
      throw new Error('Notification không tồn tại');
    }

    if (!notification.read) {
      notification.read = true;
      notification.readAt = new Date();
      await notification.save();
    }

    return notification;
  }

  /**
   * Đánh dấu tất cả notifications là đã đọc
   */
  async markAllAsRead(userId: string): Promise<{ count: number }> {
    const result = await Notification.updateMany(
      { userId, read: false },
      { 
        $set: { 
          read: true,
          readAt: new Date()
        }
      }
    );

    return { count: result.modifiedCount };
  }

  /**
   * Xóa notification
   */
  async deleteNotification(notificationId: string, userId: string): Promise<void> {
    const notification = await Notification.findOne({
      _id: notificationId,
      userId
    });

    if (!notification) {
      throw new Error('Notification không tồn tại');
    }

    await Notification.deleteOne({ _id: notificationId });
  }

  /**
   * Xóa tất cả notifications đã đọc
   */
  async deleteAllRead(userId: string): Promise<{ count: number }> {
    const result = await Notification.deleteMany({
      userId,
      read: true
    });

    return { count: result.deletedCount };
  }

  /**
   * Lấy số lượng notifications chưa đọc
   */
  async getUnreadCount(userId: string): Promise<number> {
    return Notification.countDocuments({
      userId,
      read: false
    });
  }

  /**
   * Đăng ký push token
   */
  async registerPushToken(
    userId: string,
    token: string,
    platform: 'android' | 'ios' | 'web',
    deviceId?: string,
    deviceName?: string
  ): Promise<IPushToken> {
    // Kiểm tra token đã tồn tại chưa
    const existingToken = await PushToken.findOne({ token });

    if (existingToken) {
      // Nếu token đã tồn tại nhưng thuộc user khác, update lại
      if (existingToken.userId.toString() !== userId) {
        existingToken.userId = userId as any;
        existingToken.platform = platform;
        existingToken.deviceId = deviceId;
        existingToken.deviceName = deviceName;
        existingToken.active = true;
        await existingToken.save();
        return existingToken;
      }
      // Nếu đã thuộc user này, update thông tin
      existingToken.platform = platform;
      existingToken.deviceId = deviceId;
      existingToken.deviceName = deviceName;
      existingToken.active = true;
      await existingToken.save();
      return existingToken;
    }

    // Tạo token mới
    const pushToken = await PushToken.create({
      userId,
      token,
      platform,
      deviceId,
      deviceName,
      active: true
    });

    return pushToken;
  }

  /**
   * Hủy đăng ký push token
   */
  async unregisterPushToken(token: string, userId: string): Promise<void> {
    await PushToken.updateOne(
      { token, userId },
      { active: false }
    );
  }

  /**
   * Lấy danh sách push tokens của user
   */
  async getPushTokens(userId: string): Promise<IPushToken[]> {
    return PushToken.find({
      userId,
      active: true
    }).lean();
  }

  /**
   * Helper: Tạo notification cho message mới
   * Sẽ được gọi từ message service khi có tin nhắn mới
   */
  async createMessageNotification(
    receiverId: string,
    senderId: string,
    conversationId: string,
    messagePreview: string,
    senderName: string
  ): Promise<INotification> {
    return this.createNotification(
      receiverId,
      'message',
      'Tin nhắn mới',
      `${senderName}: ${messagePreview.length > 50 ? messagePreview.substring(0, 50) + '...' : messagePreview}`,
      {
        conversationId,
        senderId,
        roomId: conversationId // Alias cho conversationId
      },
      senderId, // fromUserId
      true // sendPush
    );
  }
}

export default new NotificationsService();

