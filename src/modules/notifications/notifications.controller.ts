import { Response, NextFunction } from 'express';
import { AuthRequest } from '../auth/auth.controller';
import notificationsService from './notifications.service';

export class NotificationsController {
  /**
   * Lấy danh sách notifications
   * GET /api/v1/notifications
   */
  async getNotifications(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.userId) {
        return res.status(401).json({ message: 'Chưa xác thực' });
      }

      const { limit, page, read, type } = req.query;

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

      // Validate read
      let readFilter: boolean | undefined = undefined;
      if (read !== undefined) {
        if (read === 'true') {
          readFilter = true;
        } else if (read === 'false') {
          readFilter = false;
        } else {
          return res.status(400).json({
            success: false,
            message: 'read phải là "true" hoặc "false"'
          });
        }
      }

      const result = await notificationsService.getNotifications(req.userId, {
        limit: limitNum,
        page: pageNum,
        read: readFilter,
        type: type as string
      });

      res.status(200).json({
        success: true,
        message: 'Lấy danh sách notifications thành công',
        data: result
      });
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Lấy số lượng notifications chưa đọc
   * GET /api/v1/notifications/unread-count
   */
  async getUnreadCount(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.userId) {
        return res.status(401).json({ message: 'Chưa xác thực' });
      }

      const count = await notificationsService.getUnreadCount(req.userId);

      res.status(200).json({
        success: true,
        message: 'Lấy số lượng notifications chưa đọc thành công',
        data: { count }
      });
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Đánh dấu notification là đã đọc
   * PATCH /api/v1/notifications/:id/read
   */
  async markAsRead(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.userId) {
        return res.status(401).json({ message: 'Chưa xác thực' });
      }

      const { id } = req.params;

      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'Vui lòng cung cấp ID notification'
        });
      }

      const notification = await notificationsService.markAsRead(id, req.userId);

      res.status(200).json({
        success: true,
        message: 'Đã đánh dấu notification là đã đọc',
        data: notification
      });
    } catch (error: any) {
      if (error.message === 'Notification không tồn tại') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      next(error);
    }
  }

  /**
   * Đánh dấu tất cả notifications là đã đọc
   * PATCH /api/v1/notifications/read-all
   */
  async markAllAsRead(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.userId) {
        return res.status(401).json({ message: 'Chưa xác thực' });
      }

      const result = await notificationsService.markAllAsRead(req.userId);

      res.status(200).json({
        success: true,
        message: 'Đã đánh dấu tất cả notifications là đã đọc',
        data: result
      });
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Xóa notification
   * DELETE /api/v1/notifications/:id
   */
  async deleteNotification(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.userId) {
        return res.status(401).json({ message: 'Chưa xác thực' });
      }

      const { id } = req.params;

      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'Vui lòng cung cấp ID notification'
        });
      }

      await notificationsService.deleteNotification(id, req.userId);

      res.status(200).json({
        success: true,
        message: 'Đã xóa notification'
      });
    } catch (error: any) {
      if (error.message === 'Notification không tồn tại') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      next(error);
    }
  }

  /**
   * Xóa tất cả notifications đã đọc
   * DELETE /api/v1/notifications/read
   */
  async deleteAllRead(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.userId) {
        return res.status(401).json({ message: 'Chưa xác thực' });
      }

      const result = await notificationsService.deleteAllRead(req.userId);

      res.status(200).json({
        success: true,
        message: 'Đã xóa tất cả notifications đã đọc',
        data: result
      });
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Đăng ký push token
   * POST /api/v1/notifications/push-token
   */
  async registerPushToken(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.userId) {
        return res.status(401).json({ message: 'Chưa xác thực' });
      }

      const { token, platform, deviceId, deviceName } = req.body;

      if (!token || !platform) {
        return res.status(400).json({
          success: false,
          message: 'Vui lòng cung cấp token và platform'
        });
      }

      if (!['android', 'ios', 'web'].includes(platform)) {
        return res.status(400).json({
          success: false,
          message: 'platform phải là "android", "ios" hoặc "web"'
        });
      }

      const pushToken = await notificationsService.registerPushToken(
        req.userId,
        token,
        platform,
        deviceId,
        deviceName
      );

      res.status(200).json({
        success: true,
        message: 'Đã đăng ký push token thành công',
        data: pushToken
      });
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Hủy đăng ký push token
   * DELETE /api/v1/notifications/push-token
   */
  async unregisterPushToken(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.userId) {
        return res.status(401).json({ message: 'Chưa xác thực' });
      }

      const { token } = req.body;

      if (!token) {
        return res.status(400).json({
          success: false,
          message: 'Vui lòng cung cấp token'
        });
      }

      await notificationsService.unregisterPushToken(token, req.userId);

      res.status(200).json({
        success: true,
        message: 'Đã hủy đăng ký push token'
      });
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Lấy danh sách push tokens của user
   * GET /api/v1/notifications/push-tokens
   */
  async getPushTokens(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.userId) {
        return res.status(401).json({ message: 'Chưa xác thực' });
      }

      const tokens = await notificationsService.getPushTokens(req.userId);

      res.status(200).json({
        success: true,
        message: 'Lấy danh sách push tokens thành công',
        data: tokens
      });
    } catch (error: any) {
      next(error);
    }
  }
}

export default new NotificationsController();

