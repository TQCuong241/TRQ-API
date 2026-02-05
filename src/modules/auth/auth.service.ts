import crypto from 'crypto';
import User, { IUser } from './auth.model';
import Session, { ISession } from './models/session.model';
import { generateToken, generateRefreshToken, verifyToken } from '../../config/jwt';
import { sendVerificationEmail, sendLoginOtpEmail, sendResetPasswordOtpEmail, sendChangePasswordOtpEmail, BASE_URL } from '../../config/email';

export class AuthService {
  private generateOTP(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let otp = '';
    for (let i = 0; i < 6; i++) {
      otp += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return otp;
  }

  /**
   * Kiểm tra email đã được đăng ký chưa
   */
  async checkEmail(email: string): Promise<{ exists: boolean }> {
    const user = await User.findOne({ email });
    return { exists: !!user };
  }

  /**
   * Tạo username từ displayName
   * Ví dụ: "Nguyễn Văn A" -> "nguyen_van_a" hoặc "nguyen_van_a123"
   */
  private generateUsernameFromDisplayName(displayName: string): string {
    // Chuyển về lowercase và loại bỏ dấu tiếng Việt
    let username = displayName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Loại bỏ dấu
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'd')
      .trim();

    // Thay thế khoảng trắng và ký tự đặc biệt bằng dấu gạch dưới
    username = username.replace(/[^a-z0-9_]+/g, '_');

    // Loại bỏ dấu gạch dưới ở đầu và cuối
    username = username.replace(/^_+|_+$/g, '');

    // Loại bỏ nhiều dấu gạch dưới liên tiếp thành 1
    username = username.replace(/_+/g, '_');

    // Giới hạn độ dài (tối đa 30 ký tự, nhưng để lại chỗ cho suffix nếu cần)
    if (username.length > 25) {
      username = username.substring(0, 25);
      // Đảm bảo không kết thúc bằng dấu gạch dưới
      username = username.replace(/_+$/, '');
    }

    // Nếu quá ngắn hoặc rỗng, tạo username mặc định
    if (username.length < 3) {
      username = 'user_' + Math.random().toString(36).substring(2, 8);
    }

    return username;
  }

  /**
   * Tạo username unique từ displayName
   * Nếu username đã tồn tại, thêm số random vào cuối
   */
  private async generateUniqueUsername(displayName: string): Promise<string> {
    let baseUsername = this.generateUsernameFromDisplayName(displayName);
    let username = baseUsername;
    let attempts = 0;
    const maxAttempts = 100;

    // Kiểm tra username đã tồn tại chưa
    while (attempts < maxAttempts) {
      const existingUser = await User.findOne({ username });
      if (!existingUser) {
        return username;
      }
      // Thêm số random vào cuối (4 chữ số)
      const randomSuffix = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      // Đảm bảo tổng độ dài không vượt quá 30
      const suffix = `_${randomSuffix}`;
      const maxBaseLength = 30 - suffix.length;
      if (baseUsername.length > maxBaseLength) {
        baseUsername = baseUsername.substring(0, maxBaseLength);
        baseUsername = baseUsername.replace(/_+$/, ''); // Loại bỏ dấu gạch dưới ở cuối
      }
      username = `${baseUsername}${suffix}`;
      attempts++;
    }

    // Nếu vẫn trùng sau nhiều lần thử, dùng timestamp (rút ngắn)
    const timestamp = Date.now().toString().slice(-6); // Lấy 6 chữ số cuối
    const suffix = `_${timestamp}`;
    const maxBaseLength = 30 - suffix.length;
    if (baseUsername.length > maxBaseLength) {
      baseUsername = baseUsername.substring(0, maxBaseLength);
      baseUsername = baseUsername.replace(/_+$/, '');
    }
    return `${baseUsername}${suffix}`;
  }

  async register(email: string, password: string, displayName: string): Promise<{ user: IUser; token: string }> {
    try {
      // Kiểm tra email đã tồn tại chưa
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        throw new Error('Email đã được sử dụng');
      }

      // Tạo username tự động từ displayName
      if (!displayName || displayName.trim().length === 0) {
        throw new Error('Vui lòng nhập tên hiển thị');
      }

      const generatedUsername = await this.generateUniqueUsername(displayName);

      const emailVerifyToken = crypto.randomBytes(32).toString('hex');
      const emailVerifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 giờ

      const user = await User.create({
        username: generatedUsername,
        email,
        password,
        displayName: displayName.trim(),
        isVerified: false,
        emailVerifyToken,
        emailVerifyExpires
      });

      const verifyUrl = `${BASE_URL}/api/v1/auth/verify-email?token=${emailVerifyToken}`;
      await sendVerificationEmail(user.email, user.username, verifyUrl);

      const token = generateToken(user._id.toString());
      const userObj = user.toObject();
      delete (userObj as any).password;
      delete (userObj as any).emailVerifyToken;
      delete (userObj as any).emailVerifyExpires;

      return {
        user: userObj as IUser,
        token
      };
    } catch (error: any) {
      throw error;
    }
  }

  async verifyEmail(token: string): Promise<IUser> {
    const user = await User.findOne({
      emailVerifyToken: token,
      emailVerifyExpires: { $gt: new Date() }
    }).select('+emailVerifyToken +emailVerifyExpires');

    if (!user) {
      throw new Error('Link xác nhận không hợp lệ hoặc đã hết hạn');
    }

    user.isVerified = true;
    user.emailVerifyToken = undefined;
    user.emailVerifyExpires = undefined;
    await user.save({ validateBeforeSave: false });

    const userObj = user.toObject();
    delete (userObj as any).emailVerifyToken;
    delete (userObj as any).emailVerifyExpires;
    return userObj as IUser;
  }

  async resendVerificationEmail(email: string): Promise<{ message: string }> {
    const user = await User.findOne({ email });
    
    if (!user) {
      throw new Error('Email không tồn tại trong hệ thống');
    }

    if (user.isVerified) {
      throw new Error('Email đã được xác thực rồi');
    }

    // Tạo token mới
    const emailVerifyToken = crypto.randomBytes(32).toString('hex');
    const emailVerifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 giờ

    user.emailVerifyToken = emailVerifyToken;
    user.emailVerifyExpires = emailVerifyExpires;
    await user.save({ validateBeforeSave: false });

    const verifyUrl = `${BASE_URL}/api/v1/auth/verify-email?token=${emailVerifyToken}`;
    await sendVerificationEmail(user.email, user.username, verifyUrl);

    return {
      message: 'Email xác thực đã được gửi lại. Vui lòng kiểm tra hộp thư của bạn.'
    };
  }

  async sendLoginOtp(email: string, password: string): Promise<{ message: string }> {
    try {
      const user = await User.findOne({ email }).select('+password');
      
      if (!user) {
        throw new Error('Email hoặc mật khẩu không đúng');
      }

      const isPasswordValid = await user.comparePassword(password);
      if (!isPasswordValid) {
        throw new Error('Email hoặc mật khẩu không đúng');
      }

      // Kiểm tra email đã được xác thực chưa
      if (!user.isVerified) {
        throw new Error('EMAIL_NOT_VERIFIED');
      }

      const otp = this.generateOTP();
      const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

      user.loginOtp = otp;
      user.loginOtpExpires = otpExpires;
      await user.save({ validateBeforeSave: false });

      await sendLoginOtpEmail(user.email, user.username, otp);

      return {
        message: 'Mã OTP đã được gửi đến email của bạn'
      };
    } catch (error: any) {
      throw error;
    }
  }

  async verifyLoginOtp(
    email: string,
    otp: string,
    deviceId?: string,
    deviceName?: string,
    deviceType?: 'mobile' | 'web' | 'desktop' | 'tablet',
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ user: IUser; token: string; refreshToken: string; session: ISession }> {
    try {
      const user = await User.findOne({
        email,
        loginOtp: otp,
        loginOtpExpires: { $gt: new Date() }
      }).select('+loginOtp +loginOtpExpires');

      if (!user) {
        throw new Error('Mã OTP không hợp lệ hoặc đã hết hạn');
      }

      // Kiểm tra lại email đã được xác thực chưa (để đảm bảo an toàn)
      if (!user.isVerified) {
        throw new Error('EMAIL_NOT_VERIFIED');
      }

      user.loginOtp = undefined;
      user.loginOtpExpires = undefined;
      await user.save({ validateBeforeSave: false });

      const token = generateToken(user._id.toString());
      const refreshToken = generateRefreshToken();

      const sessionData: any = {
        userId: user._id,
        deviceId: deviceId || crypto.randomBytes(16).toString('hex'),
        refreshToken,
        deviceType: deviceType || 'web',
        lastActiveAt: new Date()
      };

      if (deviceName) sessionData.deviceName = deviceName;
      if (ipAddress) sessionData.ipAddress = ipAddress;
      if (userAgent) sessionData.userAgent = userAgent;

      let session = await Session.findOne({ userId: user._id, deviceId: sessionData.deviceId });
      if (session) {
        session.refreshToken = refreshToken;
        session.lastActiveAt = new Date();
        if (deviceName) session.deviceName = deviceName;
        if (ipAddress) session.ipAddress = ipAddress;
        if (userAgent) session.userAgent = userAgent;
        await session.save();
      } else {
        session = await Session.create(sessionData);
      }

      const userObj = user.toObject();
      delete (userObj as any).password;
      delete (userObj as any).loginOtp;
      delete (userObj as any).loginOtpExpires;

      return {
        user: userObj as IUser,
        token,
        refreshToken,
        session: session as ISession
      };
    } catch (error: any) {
      throw error;
    }
  }

  async refreshAccessToken(refreshToken: string): Promise<{ token: string; refreshToken: string }> {
    try {
      // Tìm session với refreshToken hiện tại
      const session = await Session.findOne({ refreshToken });
      
      if (!session) {
        // Kiểm tra xem token có phải là previousRefreshToken không (token reuse detection)
        const reusedSession = await Session.findOne({ previousRefreshToken: refreshToken });
        
        if (reusedSession) {
          // Token đã được rotate và đang được dùng lại - có thể bị đánh cắp
          // Vô hiệu hóa TẤT CẢ sessions của user này để bảo vệ
          console.warn(`⚠️ Token reuse detected for user ${reusedSession.userId}. Revoking all sessions.`);
          await Session.deleteMany({ userId: reusedSession.userId });
          throw new Error('Refresh token đã bị thu hồi. Vui lòng đăng nhập lại');
        }
        
        throw new Error('Refresh token không hợp lệ');
      }

      const user = await User.findById(session.userId);
      if (!user) {
        throw new Error('Người dùng không tồn tại');
      }

      // Refresh Token Rotation: Lưu token cũ vào previousRefreshToken
      const oldRefreshToken = session.refreshToken;
      const newToken = generateToken(user._id.toString());
      const newRefreshToken = generateRefreshToken();

      // Rotate token: lưu token cũ và tạo token mới
      session.previousRefreshToken = oldRefreshToken;
      session.refreshToken = newRefreshToken;
      session.lastActiveAt = new Date();
      await session.save();

      return {
        token: newToken,
        refreshToken: newRefreshToken
      };
    } catch (error: any) {
      throw error;
    }
  }

  async getSessions(userId: string): Promise<ISession[]> {
    return await Session.find({ userId }).sort({ lastActiveAt: -1 });
  }

  async deleteSession(userId: string, sessionId: string): Promise<void> {
    const session = await Session.findOne({ _id: sessionId, userId });
    if (!session) {
      throw new Error('Session không tồn tại');
    }
    await Session.deleteOne({ _id: sessionId });
  }

  async deleteAllSessions(userId: string, excludeSessionId?: string): Promise<void> {
    const query: any = { userId };
    if (excludeSessionId) {
      query._id = { $ne: excludeSessionId };
    }
    await Session.deleteMany(query);
  }

  async sendResetPasswordOtp(email: string): Promise<{ message: string }> {
    try {
      const user = await User.findOne({ email });
      if (!user) {
        throw new Error('Email không tồn tại trong hệ thống');
      }

      const otp = this.generateOTP();
      const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

      user.resetPasswordOtp = otp;
      user.resetPasswordOtpExpires = otpExpires;
      await user.save({ validateBeforeSave: false });

      await sendResetPasswordOtpEmail(user.email, user.username, otp);

      return {
        message: 'Mã OTP đã được gửi đến email của bạn'
      };
    } catch (error: any) {
      throw error;
    }
  }

  async verifyResetPasswordOtp(email: string, otp: string, newPassword: string): Promise<{ message: string }> {
    try {
      const user = await User.findOne({
        email,
        resetPasswordOtp: otp,
        resetPasswordOtpExpires: { $gt: new Date() }
      }).select('+resetPasswordOtp +resetPasswordOtpExpires +password');

      if (!user) {
        throw new Error('Mã OTP không hợp lệ hoặc đã hết hạn');
      }

      if (!newPassword || newPassword.length < 6) {
        throw new Error('Mật khẩu mới phải có ít nhất 6 ký tự');
      }

      user.password = newPassword;
      user.resetPasswordOtp = undefined;
      user.resetPasswordOtpExpires = undefined;
      await user.save();

      return {
        message: 'Đặt lại mật khẩu thành công'
      };
    } catch (error: any) {
      throw error;
    }
  }

  async sendChangePasswordOtp(userId: string, oldPassword: string): Promise<{ message: string }> {
    try {
      const user = await User.findById(userId).select('+password');
      if (!user) {
        throw new Error('Người dùng không tồn tại');
      }

      const isPasswordValid = await user.comparePassword(oldPassword);
      if (!isPasswordValid) {
        throw new Error('Mật khẩu cũ không đúng');
      }

      const otp = this.generateOTP();
      const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

      user.changePasswordOtp = otp;
      user.changePasswordOtpExpires = otpExpires;
      await user.save({ validateBeforeSave: false });

      await sendChangePasswordOtpEmail(user.email, user.username, otp);

      return {
        message: 'Mã OTP đã được gửi đến email của bạn'
      };
    } catch (error: any) {
      throw error;
    }
  }

  async verifyChangePasswordOtp(userId: string, otp: string, newPassword: string): Promise<{ message: string }> {
    try {
      const user = await User.findOne({
        _id: userId,
        changePasswordOtp: otp,
        changePasswordOtpExpires: { $gt: new Date() }
      }).select('+changePasswordOtp +changePasswordOtpExpires +password');

      if (!user) {
        throw new Error('Mã OTP không hợp lệ hoặc đã hết hạn');
      }

      if (!newPassword || newPassword.length < 6) {
        throw new Error('Mật khẩu mới phải có ít nhất 6 ký tự');
      }

      user.password = newPassword;
      user.changePasswordOtp = undefined;
      user.changePasswordOtpExpires = undefined;
      await user.save();

      return {
        message: 'Đổi mật khẩu thành công'
      };
    } catch (error: any) {
      throw error;
    }
  }

  async getUserById(userId: string): Promise<IUser | null> {
    return await User.findById(userId);
  }

  async getAllUsers(): Promise<IUser[]> {
    return await User.find({});
  }

  async updateUser(userId: string, updateData: Partial<IUser>): Promise<IUser | null> {
    return await User.findByIdAndUpdate(userId, updateData, { new: true });
  }

  async deleteUser(userId: string): Promise<IUser | null> {
    return await User.findByIdAndDelete(userId);
  }

  async verifyUserToken(token: string): Promise<any> {
    const decoded = verifyToken(token);
    if (!decoded) {
      throw new Error('Token không hợp lệ hoặc đã hết hạn');
    }
    return decoded;
  }
}

export default new AuthService();
