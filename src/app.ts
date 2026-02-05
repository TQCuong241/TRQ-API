import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import authRoutes from './modules/auth/auth.route';
import friendsRoutes from './modules/friends/friends.route';
import usersRoutes from './modules/users/users.route';
import notificationsRoutes from './modules/notifications/notifications.route';
import messageRoutes from './modules/message/message.route';

dotenv.config();

const app: Express = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ message: 'Dữ liệu JSON không hợp lệ' });
  }
  next();
});

const apiEndpoints = [
  { method: 'GET', path: '/api', description: 'Danh sách toàn bộ API' },
  { method: 'GET', path: '/health', description: 'Kiểm tra trạng thái máy chủ' },
  { method: 'GET', path: '/api/v1/auth/check-email', description: 'Kiểm tra email đã được đăng ký chưa', query: ['email'] },
  { method: 'POST', path: '/api/v1/auth/register', description: 'Đăng ký tài khoản (gửi email xác nhận, username tự động tạo từ displayName)', body: ['email', 'password', 'confirmPassword', 'displayName'] },
  { method: 'GET', path: '/api/v1/auth/verify-email', description: 'Xác nhận email (query: token)', query: ['token'] },
  { method: 'POST', path: '/api/v1/auth/resend-verification-email', description: 'Gửi lại email xác thực', body: ['email'] },
  { method: 'POST', path: '/api/v1/auth/send-login-otp', description: 'Gửi mã OTP đăng nhập (gửi email OTP 6 ký tự)', body: ['email', 'password'] },
  { method: 'POST', path: '/api/v1/auth/verify-login-otp', description: 'Xác nhận OTP và đăng nhập', body: ['email', 'otp', 'deviceId?', 'deviceName?', 'deviceType?'] },
  { method: 'POST', path: '/api/v1/auth/send-reset-password-otp', description: 'Gửi mã OTP đặt lại mật khẩu (quên mật khẩu)', body: ['email'] },
  { method: 'POST', path: '/api/v1/auth/verify-reset-password-otp', description: 'Xác nhận OTP và đặt lại mật khẩu (quên mật khẩu)', body: ['email', 'otp', 'newPassword'] },
  { method: 'POST', path: '/api/v1/auth/refresh', description: 'Refresh access token', body: ['refreshToken'] },
  { method: 'GET', path: '/api/v1/auth/sessions', description: 'Danh sách sessions (thiết bị đăng nhập)', auth: true },
  { method: 'DELETE', path: '/api/v1/auth/sessions/:id', description: 'Xóa session (đăng xuất thiết bị)', auth: true },
  { method: 'DELETE', path: '/api/v1/auth/sessions', description: 'Đăng xuất tất cả thiết bị khác', auth: true },
  { method: 'GET', path: '/api/v1/auth/users', description: 'Danh sách tất cả users', auth: true },
  { method: 'PUT', path: '/api/v1/auth/update', description: 'Cập nhật thông tin user', auth: true, body: ['username?', 'email?', 'displayName?'] },
  { method: 'POST', path: '/api/v1/auth/send-change-password-otp', description: 'Gửi mã OTP đổi mật khẩu (khi đã đăng nhập)', auth: true, body: ['oldPassword'] },
  { method: 'POST', path: '/api/v1/auth/verify-change-password-otp', description: 'Xác nhận OTP và đổi mật khẩu (khi đã đăng nhập)', auth: true, body: ['otp', 'newPassword'] },
  { method: 'POST', path: '/api/v1/auth/logout', description: 'Đăng xuất', auth: true },
  { method: 'POST', path: '/api/v1/friends/requests', description: 'Gửi lời mời kết bạn', auth: true, body: ['receiverId'] },
  { method: 'GET', path: '/api/v1/friends/requests', description: 'Lấy danh sách lời mời kết bạn', auth: true, query: ['type? (received|sent|all)'] },
  { method: 'POST', path: '/api/v1/friends/requests/:id/accept', description: 'Chấp nhận lời mời kết bạn', auth: true },
  { method: 'POST', path: '/api/v1/friends/requests/:id/reject', description: 'Từ chối lời mời kết bạn', auth: true },
  { method: 'DELETE', path: '/api/v1/friends/requests/:id', description: 'Hủy lời mời kết bạn (chỉ sender)', auth: true },
  { method: 'GET', path: '/api/v1/friends', description: 'Lấy danh sách bạn bè', auth: true },
  { method: 'DELETE', path: '/api/v1/friends/:friendId', description: 'Hủy kết bạn', auth: true },
  { method: 'GET', path: '/api/v1/friends/notifications/accepted', description: 'Lấy danh sách lời mời đã được chấp nhận', auth: true, query: ['limit?', 'page?'] },
  { method: 'GET', path: '/api/v1/friends/notifications/pending', description: 'Lấy danh sách lời mời đang chờ', auth: true, query: ['limit?', 'page?'] },
  { method: 'POST', path: '/api/v1/friends/block', description: 'Chặn một user', auth: true, body: ['blockedId'] },
  { method: 'DELETE', path: '/api/v1/friends/block/:blockedId', description: 'Bỏ chặn một user', auth: true },
  { method: 'GET', path: '/api/v1/friends/blocked', description: 'Lấy danh sách người bị chặn', auth: true },
  { method: 'GET', path: '/api/v1/users/me', description: 'Lấy thông tin user hiện tại', auth: true },
  { method: 'GET', path: '/api/v1/users/search', description: 'Tìm kiếm người dùng', auth: true, query: ['q (required)', 'limit?', 'page?', 'excludeSelf?', 'excludeBlocked?'] },
  { method: 'GET', path: '/api/v1/users/:id', description: 'Lấy thông tin user khác', auth: true },
  { method: 'POST', path: '/api/v1/users/avatar', description: 'Upload avatar', auth: true, body: ['avatar (file)'] },
  { method: 'DELETE', path: '/api/v1/users/avatar', description: 'Xóa avatar', auth: true },
  { method: 'POST', path: '/api/v1/users/cover', description: 'Upload ảnh bìa', auth: true, body: ['cover (file)'] },
  { method: 'DELETE', path: '/api/v1/users/cover', description: 'Xóa ảnh bìa', auth: true },
  { method: 'PUT', path: '/api/v1/users/profile', description: 'Cập nhật profile', auth: true, body: ['displayName?', 'bio?', 'phone?', 'privacy?', 'allowCalls?', 'allowMessagesFrom?', 'currentLocation?', 'hometown?', 'dateOfBirth?', 'maritalStatus?', 'gender?', 'work?', 'education?'] },
  { method: 'GET', path: '/api/v1/notifications', description: 'Lấy danh sách notifications', auth: true, query: ['limit?', 'page?', 'read?', 'type?'] },
  { method: 'GET', path: '/api/v1/notifications/unread-count', description: 'Lấy số lượng notifications chưa đọc', auth: true },
  { method: 'PATCH', path: '/api/v1/notifications/:id/read', description: 'Đánh dấu notification là đã đọc', auth: true },
  { method: 'PATCH', path: '/api/v1/notifications/read-all', description: 'Đánh dấu tất cả notifications là đã đọc', auth: true },
  { method: 'DELETE', path: '/api/v1/notifications/:id', description: 'Xóa notification', auth: true },
  { method: 'DELETE', path: '/api/v1/notifications/read', description: 'Xóa tất cả notifications đã đọc', auth: true },
  { method: 'POST', path: '/api/v1/users/push-token', description: 'Đăng ký push token (FCM/APNS)', auth: true, body: ['token', 'platform', 'deviceId?', 'deviceName?'] },
  { method: 'DELETE', path: '/api/v1/users/push-token', description: 'Hủy đăng ký push token', auth: true, body: ['token'] },
  { method: 'GET', path: '/api/v1/users/push-tokens', description: 'Lấy danh sách push tokens của user', auth: true }
  ,
  { method: 'GET', path: '/api/v1/conversations', description: 'Lấy danh sách phòng chat của user', auth: true, query: ['page?', 'limit?'] },
  { method: 'POST', path: '/api/v1/conversations/private', description: 'Tạo / lấy phòng chat 1-1', auth: true, body: ['userId'] },
  { method: 'POST', path: '/api/v1/conversations/group', description: 'Tạo phòng chat nhóm', auth: true, body: ['name', 'memberIds?'] },
  { method: 'GET', path: '/api/v1/conversations/:id/messages', description: 'Lấy danh sách tin nhắn trong phòng', auth: true, query: ['page?', 'limit?'] },
  { method: 'POST', path: '/api/v1/conversations/:id/messages', description: 'Gửi tin nhắn trong phòng', auth: true, body: ['type', 'text?', 'mediaUrl?'] },
  { method: 'PATCH', path: '/api/v1/conversations/:id/settings', description: 'Cập nhật cấu hình phòng (nickname, background, mute, pin, block)', auth: true, body: ['nickname?', 'customBackground?', 'isMuted?', 'isPinned?', 'isBlocked?'] }
];

app.get('/api', (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'Danh sách API hiện có',
    data: { version: 'v1', basePath: '/api/v1', endpoints: apiEndpoints },
    timestamp: new Date()
  });
});

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/friends', friendsRoutes);
app.use('/api/v1/users', usersRoutes);
app.use('/api/v1/notifications', notificationsRoutes);
app.use('/api/v1/conversations', messageRoutes);

app.get('/docs', (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '../public/docs.html'));
});

app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

app.use((req: Request, res: Response) => {
  res.status(404).json({ message: 'Không tìm thấy đường dẫn' });
});

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Lỗi:', err);

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Lỗi máy chủ nội bộ';

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

export default app;
