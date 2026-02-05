import dotenv from 'dotenv';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import app from './app';
import connectDB from './config/database';
import initializeAuthSocket from './modules/auth/auth.socket';
import initializeFriendsSocket from './modules/friends/friends.socket';
import { initializeNotificationsSocket } from './modules/notifications/notifications.socket';
import initializeMessageSocket from './modules/message/message.socket';
import { initializeFirebaseAdmin } from './modules/notifications/push.service';

dotenv.config();

// Khởi tạo Firebase Admin SDK cho push notifications
initializeFirebaseAdmin();

const PORT = process.env.PORT || 3000;

const server = http.createServer(app);

const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

initializeAuthSocket(io);
initializeFriendsSocket(io);
initializeNotificationsSocket(io);
initializeMessageSocket(io);

const startServer = async () => {
  try {
    await connectDB();

    server.listen(PORT, () => {
      console.log(`
╔══════════════════════════════════════════╗
║     Máy chủ đã khởi động thành công      ║
║        ${process.env.BASE_URL}          ║
║                                          ║
║   MongoDB đã kết nối                    ║
║   Socket.io đã sẵn sàng                  ║
║   Xác thực JWT đã sẵn sàng               ║
╚══════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    console.error('Khởi động máy chủ thất bại:', error);
    process.exit(1);
  }
};

process.on('SIGINT', () => {
  console.log('\nĐang tắt máy chủ...');
  server.close(() => {
    console.log('Máy chủ đã đóng');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\nĐang tắt máy chủ...');
  server.close(() => {
    console.log('Máy chủ đã đóng');
    process.exit(0);
  });
});

startServer();

export { server, io };
