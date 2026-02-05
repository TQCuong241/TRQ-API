import { Request, Response, NextFunction } from 'express';
import authService from './auth.service';

export interface AuthRequest extends Request {
  userId?: string;
  user?: any;
}

export class AuthController {
  async checkEmail(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { email } = req.query;

      if (!email || typeof email !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'Vui lòng cung cấp email'
        });
      }

      const result = await authService.checkEmail(email);

      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error: any) {
      next(error);
    }
  }

  async register(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { email, password, confirmPassword, displayName } = req.body;

      if (!email || !password || !displayName) {
        return res.status(400).json({ message: 'Vui lòng điền đầy đủ thông tin (email, password, displayName)' });
      }

      if (password !== confirmPassword) {
        return res.status(400).json({ message: 'Mật khẩu xác nhận không khớp' });
      }

      const result = await authService.register(email, password, displayName);

      res.status(201).json({
        success: true,
        message: 'Đăng ký thành công. Vui lòng kiểm tra email để xác nhận tài khoản.',
        data: result
      });
    } catch (error: any) {
      next(error);
    }
  }

  async sendLoginOtp(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { email, password } = req.body;

      if (!email) {
        return res.status(400).json({ 
          success: false,
          message: 'Vui lòng nhập email' 
        });
      }

      if (!password) {
        return res.status(400).json({ 
          success: false,
          message: 'Vui lòng nhập mật khẩu' 
        });
      }

      const result = await authService.sendLoginOtp(email, password);

      res.status(200).json({
        success: true,
        message: result.message,
        data: {}
      });
    } catch (error: any) {
      if (error.message === 'Email hoặc mật khẩu không đúng') {
        return res.status(401).json({
          success: false,
          message: 'Email hoặc mật khẩu không đúng'
        });
      }
      if (error.message === 'EMAIL_NOT_VERIFIED') {
        return res.status(403).json({
          success: false,
          message: 'Email chưa được xác thực. Vui lòng kiểm tra email và xác nhận tài khoản trước khi đăng nhập.',
          code: 'EMAIL_NOT_VERIFIED'
        });
      }
      next(error);
    }
  }

  async verifyLoginOtp(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { email, otp, deviceId, deviceName, deviceType, pushToken, platform } = req.body;
      const ipAddress = req.ip || req.socket.remoteAddress;
      const userAgent = req.get('user-agent');

      if (!email || !otp) {
        return res.status(400).json({ message: 'Vui lòng nhập email và mã OTP' });
      }

      const result = await authService.verifyLoginOtp(
        email,
        otp,
        deviceId,
        deviceName,
        deviceType,
        ipAddress,
        userAgent
      );

      // Update push token nếu có (theo checklist: update token mỗi lần login)
      if (pushToken && platform && result.user._id) {
        try {
          const notificationsService = (await import('../notifications/notifications.service')).default;
          await notificationsService.registerPushToken(
            result.user._id.toString(),
            pushToken,
            platform,
            deviceId,
            deviceName
          );
        } catch (error: any) {
          // Không throw error để không ảnh hưởng đến flow login
          console.error('Lỗi update push token khi login:', error);
        }
      }

      res.status(200).json({
        success: true,
        message: 'Đăng nhập thành công',
        data: {
          user: result.user,
          token: result.token,
          refreshToken: result.refreshToken,
          session: {
            id: result.session._id,
            deviceId: result.session.deviceId,
            deviceName: result.session.deviceName,
            deviceType: result.session.deviceType
          }
        }
      });
    } catch (error: any) {
      if (error.message === 'EMAIL_NOT_VERIFIED') {
        return res.status(403).json({
          success: false,
          message: 'Email chưa được xác thực. Vui lòng kiểm tra email và xác nhận tài khoản trước khi đăng nhập.',
          code: 'EMAIL_NOT_VERIFIED'
        });
      }
      if (error.message === 'Mã OTP không hợp lệ hoặc đã hết hạn') {
        return res.status(400).json({
          success: false,
          message: 'Mã OTP không hợp lệ hoặc đã hết hạn'
        });
      }
      next(error);
    }
  }

  async refreshToken(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({
          success: false,
          message: 'Vui lòng cung cấp refresh token'
        });
      }

      const result = await authService.refreshAccessToken(refreshToken);

      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error: any) {
      if (error.message === 'Refresh token không hợp lệ') {
        return res.status(401).json({
          success: false,
          message: 'Refresh token không hợp lệ'
        });
      }
      next(error);
    }
  }

  async getSessions(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.userId) {
        return res.status(401).json({ message: 'Chưa xác thực' });
      }

      const sessions = await authService.getSessions(req.userId);

      res.status(200).json({
        success: true,
        data: sessions.map(session => ({
          id: session._id,
          deviceId: session.deviceId,
          deviceName: session.deviceName,
          deviceType: session.deviceType,
          ipAddress: session.ipAddress,
          lastActiveAt: session.lastActiveAt,
          createdAt: session.createdAt
        }))
      });
    } catch (error: any) {
      next(error);
    }
  }

  async deleteSession(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.userId) {
        return res.status(401).json({ message: 'Chưa xác thực' });
      }

      const { id } = req.params;

      await authService.deleteSession(req.userId, id);

      res.status(200).json({
        success: true,
        message: 'Đã xóa session thành công'
      });
    } catch (error: any) {
      next(error);
    }
  }

  async deleteAllSessions(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.userId) {
        return res.status(401).json({ message: 'Chưa xác thực' });
      }

      const currentSessionId = req.headers['x-session-id'] as string;

      await authService.deleteAllSessions(req.userId, currentSessionId);

      res.status(200).json({
        success: true,
        message: 'Đã đăng xuất tất cả thiết bị khác'
      });
    } catch (error: any) {
      next(error);
    }
  }

  async getCurrentUser(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.userId) {
        return res.status(401).json({ message: 'Chưa xác thực' });
      }

      const user = await authService.getUserById(req.userId);

      res.status(200).json({
        success: true,
        data: user
      });
    } catch (error: any) {
      next(error);
    }
  }

  async getAllUsers(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const users = await authService.getAllUsers();

      res.status(200).json({
        success: true,
        data: users
      });
    } catch (error: any) {
      next(error);
    }
  }

  async updateUser(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.userId) {
        return res.status(401).json({ message: 'Chưa xác thực' });
      }

      const { username, email } = req.body;

      if (!username && !email) {
        return res.status(400).json({ message: 'Không có dữ liệu để cập nhật' });
      }

      const updatedUser = await authService.updateUser(req.userId, { username, email });

      res.status(200).json({
        success: true,
        message: 'Cập nhật thông tin thành công',
        data: updatedUser
      });
    } catch (error: any) {
      next(error);
    }
  }

  async verifyEmail(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const token = req.query.token as string;
      if (!token) {
        return res.status(400).json({ message: 'Thiếu token xác nhận' });
      }
      const user = await authService.verifyEmail(token);
      res.status(200).json({
        success: true,
        message: 'Xác nhận email thành công. Tài khoản của bạn đã được xác thực.',
        data: { user }
      });
    } catch (error: any) {
      if (error.message === 'Link xác nhận không hợp lệ hoặc đã hết hạn') {
        return res.status(400).json({
          success: false,
          message: 'Link xác nhận không hợp lệ hoặc đã hết hạn'
        });
      }
      next(error);
    }
  }

  async resendVerificationEmail(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ 
          success: false,
          message: 'Vui lòng nhập email' 
        });
      }

      const result = await authService.resendVerificationEmail(email);

      res.status(200).json({
        success: true,
        message: result.message,
        data: {}
      });
    } catch (error: any) {
      if (error.message === 'Email không tồn tại trong hệ thống') {
        return res.status(404).json({
          success: false,
          message: 'Email không tồn tại trong hệ thống'
        });
      }
      if (error.message === 'Email đã được xác thực rồi') {
        return res.status(400).json({
          success: false,
          message: 'Email đã được xác thực rồi'
        });
      }
      next(error);
    }
  }

  async sendResetPasswordOtp(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ message: 'Vui lòng nhập email' });
      }

      const result = await authService.sendResetPasswordOtp(email);

      res.status(200).json({
        success: true,
        message: result.message,
        data: {}
      });
    } catch (error: any) {
      next(error);
    }
  }

  async verifyResetPasswordOtp(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { email, otp, newPassword } = req.body;

      if (!email || !otp || !newPassword) {
        return res.status(400).json({ message: 'Vui lòng nhập đầy đủ thông tin' });
      }

      const result = await authService.verifyResetPasswordOtp(email, otp, newPassword);

      res.status(200).json({
        success: true,
        message: result.message,
        data: {}
      });
    } catch (error: any) {
      next(error);
    }
  }

  async sendChangePasswordOtp(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.userId) {
        return res.status(401).json({ message: 'Chưa xác thực' });
      }

      const { oldPassword } = req.body;

      if (!oldPassword) {
        return res.status(400).json({ message: 'Vui lòng nhập mật khẩu cũ' });
      }

      const result = await authService.sendChangePasswordOtp(req.userId, oldPassword);

      res.status(200).json({
        success: true,
        message: result.message,
        data: {}
      });
    } catch (error: any) {
      next(error);
    }
  }

  async verifyChangePasswordOtp(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.userId) {
        return res.status(401).json({ message: 'Chưa xác thực' });
      }

      const { otp, newPassword } = req.body;

      if (!otp || !newPassword) {
        return res.status(400).json({ message: 'Vui lòng nhập mã OTP và mật khẩu mới' });
      }

      const result = await authService.verifyChangePasswordOtp(req.userId, otp, newPassword);

      res.status(200).json({
        success: true,
        message: result.message,
        data: {}
      });
    } catch (error: any) {
      next(error);
    }
  }

  logout(req: AuthRequest, res: Response) {
    res.status(200).json({
      success: true,
      message: 'Đăng xuất thành công'
    });
  }
}

export default new AuthController();
