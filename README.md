# TRQ Chat - Realtime Chat API

Hệ thống chat realtime hoàn chỉnh với Express, MongoDB, JWT, và Socket.io.

## 🚀 Bắt Đầu Nhanh

### 1. Cài Đặt

```bash
npm install
```

### 2. Cấu Hình

Tạo file `.env` (xem [Hướng Dẫn Chi Tiết](./docs/HUONG_DAN.md))

### 3. Khởi Động

```bash
npm run dev
```

### 4. Xem Documentation

**Truy cập: http://localhost:3000/docs** 🌐

## 📚 Documentation

### 🌐 Trang Web Documentation (Khuyến Nghị)

**Cách truy cập:**

1. Khởi động server:
   ```bash
   npm run dev
   ```

2. Mở trình duyệt và truy cập:
   ```
   http://localhost:3000/docs
   ```

**Tính năng:**
- ✅ Giao diện đẹp, dễ đọc (giống Appwrite)
- ✅ Sidebar navigation với tất cả API endpoints
- ✅ Code examples cho mỗi API
- ✅ Request/Response examples
- ✅ cURL commands
- ✅ Responsive (hoạt động tốt trên mobile)
- ✅ Dark theme

### 📖 Tài Liệu Chi Tiết

- [Hướng Dẫn Sử Dụng](./docs/HUONG_DAN.md) - Hướng dẫn đầy đủ bằng tiếng Việt
- [Forward Message Guide](./docs/FORWARD_MESSAGE.md) - Telegram-style forward message implementation
- [Call Feature](./docs/CALL_FEATURE.md) - Voice/Video call implementation
- [Socket Events](./docs/SOCKET_EVENTS.md) - Complete Socket.io events reference
- [Final Checklist](./docs/CHECKLIST_FINAL.md) - Telegram-grade backend verification

### 📋 API Endpoints List

Xem danh sách tất cả API endpoints:
```
GET http://localhost:3000/api
```

## Features

- ✅ User registration and login
- ✅ JWT authentication
- ✅ MongoDB for data persistence
- ✅ Realtime user status updates via Socket.io
- ✅ Password hashing with bcryptjs
- ✅ Protected routes with middleware

## Installation

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables (`.env`):
```
PORT=3000
MONGODB_URI=mongodb://localhost:27017/trq-auth
JWT_SECRET=your_jwt_secret_key_here
JWT_EXPIRE=7d
NODE_ENV=development

# Xác nhận email (nếu không cấu hình SMTP, link xác nhận sẽ in ra console)
BASE_URL=http://localhost:3000
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your_email
SMTP_PASS=your_password
EMAIL_FROM=noreply@example.com
```

3. Make sure MongoDB is running locally or update the connection string.

## Development

Start the development server with hot reload:
```bash
npm run dev
```

## Build

Build the project for production:
```bash
npm run build
```

Start production server:
```bash
npm start
```

## API Endpoints

Cấu trúc API: `api/v1/...`. Xem danh sách toàn bộ API: **GET /api**

### Danh sách API
```
GET /api
Response: { success, message, data: { version, basePath, endpoints: [...] } }
```

### Authentication

#### Register User
```
POST /api/v1/auth/register
Content-Type: application/json

{
  "username": "john_doe",
  "email": "john@example.com",
  "password": "securepassword",
  "confirmPassword": "securepassword"
}

Response:
{
  "success": true,
  "message": "Đăng ký thành công. Vui lòng kiểm tra email để xác nhận tài khoản.",
  "data": {
    "user": { "_id": "...", "username": "john_doe", "email": "john@example.com", "isVerified": false },
    "token": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

Sau khi đăng ký, hệ thống gửi email chứa link xác nhận. User mở link để chuyển trạng thái tài khoản sang đã xác thực (`isVerified: true`).

#### Xác nhận email
```
GET /api/v1/auth/verify-email?token=<token_từ_email>

Response:
{
  "success": true,
  "message": "Xác nhận email thành công. Tài khoản của bạn đã được xác thực.",
  "data": { "user": { "_id": "...", "username": "...", "email": "...", "isVerified": true } }
}
```

#### Login User
```
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "securepassword"
}

Response:
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": { "_id": "...", "username": "john_doe", "email": "john@example.com" },
    "token": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

#### Get Current User
```
GET /api/v1/auth/me
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": { "_id": "...", "username": "john_doe", "email": "john@example.com", "isVerified": true }
}
```

#### Get All Users
```
GET /api/v1/auth/users
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": [
    { "_id": "...", "username": "john_doe", "email": "john@example.com" },
    { "_id": "...", "username": "jane_doe", "email": "jane@example.com" }
  ]
}
```

#### Logout
```
POST /api/v1/auth/logout
Authorization: Bearer <token>

Response:
{
  "success": true,
  "message": "Logged out successfully"
}
```

### Messages

#### Forward Message
```
POST /api/v1/messages/:id/forward
Authorization: Bearer <token>
Content-Type: application/json

{
  "conversationIds": ["convId1", "convId2"],
  "fromConversationId": "originalConvId"
}

Response:
{
  "success": true,
  "message": "Đã forward tin nhắn đến 2 cuộc trò chuyện",
  "data": [
    { "_id": "...", "text": "...", "forward": { "fromMessageId": "...", "fromUserId": "...", "fromConversationId": "...", "fromAt": "..." } },
    ...
  ]
}
```

**Note**: Forwarded messages preserve original metadata (sender, conversation, timestamp). Media files are not re-uploaded (reuses `fileUrl`). Even if original message is deleted, forwarded messages remain.

### Conversations

#### Save Draft
```
POST /api/v1/conversations/:id/draft
Authorization: Bearer <token>
Content-Type: application/json

{
  "draft": "Message text being typed..."
}

Response:
{
  "success": true,
  "message": "Đã lưu draft"
}
```

#### Get Draft
```
GET /api/v1/conversations/:id/draft
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": { "draft": "Message text being typed..." }
}
```

**Note**: Draft is automatically saved per user per conversation. Returns empty string if no draft exists.

## Socket.io Realtime Events

### Connection
Connect with JWT token:
```javascript
const socket = io('http://localhost:3000', {
  auth: {
    token: 'your_jwt_token'
  }
});
```

### Authentication Events

**auth:connected** - Emitted when user connects
```javascript
socket.on('auth:connected', (data) => {
  console.log('Connected:', data);
  // { message, userId, timestamp }
});
```

**users:online:list** - List of currently online users (emitted on connection)
```javascript
socket.on('users:online:list', (data) => {
  console.log('Online users:', data);
  // { userIds: ['userId1', 'userId2', ...] }
});
```

**user:online** - Broadcast when user comes online
```javascript
socket.on('user:online', (data) => {
  console.log('User online:', data);
  // { userId, socketId, timestamp }
});
```

**user:offline** - Broadcast when user goes offline
```javascript
socket.on('user:offline', (data) => {
  console.log('User offline:', data);
  // { userId, timestamp }
});
```

**user:activity** - Broadcast user activity
```javascript
socket.emit('user:activity', { action: 'typing', message: 'Hello' });
socket.on('user:activity', (data) => {
  console.log('Activity:', data);
  // { userId, activity, timestamp }
});
```

### Chat Events

**join:conversation** - Join a conversation room
```javascript
socket.emit('join:conversation', 'conversationId');
```

**leave:conversation** - Leave a conversation room
```javascript
socket.emit('leave:conversation', 'conversationId');
```

**message:send** - Send a message
```javascript
socket.emit('message:send', {
  conversationId: 'convId',
  text: 'Hello',
  type: 'text'
});
socket.on('message:sent', (data) => {
  // { message, conversationId }
});
```

**typing:start** - User starts typing (auto-stops after 3 seconds)
```javascript
socket.emit('typing:start', 'conversationId');
socket.on('typing:start', (data) => {
  // { userId, conversationId }
});
```

**typing:stop** - User stops typing
```javascript
socket.emit('typing:stop', 'conversationId');
socket.on('typing:stop', (data) => {
  // { userId, conversationId, timestamp }
});
```

**message:seen** - Mark message as seen
```javascript
socket.emit('message:seen', {
  conversationId: 'convId',
  messageId: 'msgId'
});
socket.on('message:seen', (data) => {
  // { messageId, userId, conversationId, seenAt, message }
});
```

**message:edit** - Edit a message
```javascript
socket.emit('message:edit', {
  conversationId: 'convId',
  messageId: 'msgId',
  text: 'Updated text'
});
socket.on('message:edited', (data) => {
  // { messageId, message, conversationId }
});
```

**message:delete** - Delete a message
```javascript
socket.emit('message:delete', {
  conversationId: 'convId',
  messageId: 'msgId',
  deleteForEveryone: true
});
socket.on('message:deleted', (data) => {
  // { messageId, conversationId, deletedForEveryone }
});
```

**message:reaction** - Add reaction to message
```javascript
socket.emit('message:reaction', {
  conversationId: 'convId',
  messageId: 'msgId',
  reactionType: 'like'
});
socket.on('message:reaction:added', (data) => {
  // { messageId, message, conversationId }
});
```

**message:forward** - Forward a message to multiple conversations
```javascript
socket.emit('message:forward', {
  messageId: 'msgId',
  fromConversationId: 'convId',
  conversationIds: ['convId1', 'convId2']
});
socket.on('message:forwarded', (data) => {
  // { messageId, forwardedCount, conversationIds }
});
socket.on('message:sent', (data) => {
  // Forwarded messages are emitted as message:sent to target conversations
  // { message, conversationId }
});
```

**conversation:update** - Conversation updated (members, settings, etc.)
```javascript
socket.on('conversation:update', (data) => {
  // { conversationId, conversation, type: 'member_added' | 'member_removed' | 'settings_changed' }
});
```

## Example Client Usage

```html
<!DOCTYPE html>
<html>
<head>
  <script src="https://cdn.socket.io/4.6.1/socket.io.min.js"></script>
</head>
<body>
  <script>
    // Register
    async function register() {
      const res = await fetch('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'john_doe',
          email: 'john@example.com',
          password: 'securepassword',
          confirmPassword: 'securepassword'
        })
      });
      const data = await res.json();
      return data.data.token;
    }

    // Login
    async function login() {
      const res = await fetch('http://localhost:3000/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'john@example.com',
          password: 'securepassword'
        })
      });
      const data = await res.json();
      return data.data.token;
    }

    // Connect to realtime
    async function connectRealtime() {
      const token = await login();
      
      const socket = io('http://localhost:3000', {
        auth: { token }
      });

      socket.on('auth:connected', (data) => {
        console.log('Connected to realtime:', data);
      });

      socket.on('user:online', (data) => {
        console.log('User online:', data);
      });

      socket.on('user:offline', (data) => {
        console.log('User offline:', data);
      });

      socket.on('user:activity', (data) => {
        console.log('User activity:', data);
      });

      // Emit activity
      socket.emit('user:activity', { action: 'viewing_page' });
    }

    connectRealtime();
  </script>
</body>
</html>
```

## Project Structure

```
src/
├── app.ts                 # Express app setup
├── server.ts              # Server entry point with Socket.io
├── config/
│   ├── database.ts        # MongoDB connection
│   └── jwt.ts             # JWT utilities
├── middlewares/
│   └── auth.middleware.ts # JWT verification middleware
└── modules/
    └── auth/
        ├── auth.controller.ts    # Request handlers
        ├── auth.model.ts         # MongoDB schema
        ├── auth.service.ts       # Business logic
        ├── auth.route.ts         # API routes
        └── auth.socket.ts        # Socket.io handlers
```

## Security Notes

1. Change `JWT_SECRET` in `.env` for production
2. Use HTTPS in production
3. Implement rate limiting on login/register endpoints
4. Add email verification for production
5. Use secure cookie settings for production
6. Validate and sanitize all inputs

## Technologies

- **Express.js** - Web framework
- **MongoDB** - Database
- **Mongoose** - ODM
- **JWT** - Authentication
- **Socket.io** - Realtime communication
- **bcryptjs** - Password hashing
- **TypeScript** - Type safety

## License

MIT
