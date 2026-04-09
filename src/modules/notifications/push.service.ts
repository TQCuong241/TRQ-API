/**
 * Push Notification Service
 * Hỗ trợ FCM (Firebase Cloud Messaging) cho Android và Web
 * Hỗ trợ APNS (Apple Push Notification Service) cho iOS
 */

// Firebase Admin SDK sẽ được import khi đã cài đặt
let admin: any = null;

try {
  // Dynamic import để tránh lỗi nếu chưa cài đặt firebase-admin
  const firebaseAdmin = require('firebase-admin');
  admin = firebaseAdmin;
} catch (error) {
  console.warn('firebase-admin chưa được cài đặt. Push notifications sẽ không hoạt động.');
  console.warn('Chạy: npm install firebase-admin');
}

/**
 * Kiểm tra Firebase Admin SDK đã được khởi tạo chưa
 */
export function isFirebaseAdminInitialized(): boolean {
  return admin !== null && admin.apps !== undefined && admin.apps.length > 0;
}

/**
 * Khởi tạo Firebase Admin SDK
 * Cần gọi function này trong server.ts sau khi load .env
 */
export function initializeFirebaseAdmin(): void {
  if (!admin) {
    console.warn('⚠️  firebase-admin chưa được cài đặt. Push notifications sẽ không hoạt động.');
    console.warn('   Chạy: npm install firebase-admin');
    return;
  }

  try {
    // Kiểm tra đã initialize chưa
    if (admin.apps && admin.apps.length > 0) {
      console.log('✅ Firebase Admin SDK đã được khởi tạo trước đó');
      return;
    }

    // Lấy service account từ environment variable
    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

    if (!serviceAccountPath && !serviceAccountJson) {
      console.warn('⚠️  FIREBASE_SERVICE_ACCOUNT_PATH hoặc FIREBASE_SERVICE_ACCOUNT_JSON chưa được cấu hình');
      console.warn('   Push notifications sẽ không hoạt động.');
      console.warn('   Cấu hình một trong hai biến môi trường sau:');
      console.warn('   - FIREBASE_SERVICE_ACCOUNT_PATH=/path/to/serviceAccountKey.json');
      console.warn('   - FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}');
      return;
    }

    let serviceAccount: any;

    if (serviceAccountJson) {
      // Parse JSON từ environment variable
      try {
        serviceAccount = JSON.parse(serviceAccountJson);
        console.log(' Đã load Firebase service account từ FIREBASE_SERVICE_ACCOUNT_JSON');
      } catch (error) {
        console.error('❌ Lỗi parse FIREBASE_SERVICE_ACCOUNT_JSON:', error);
        return;
      }
    } else if (serviceAccountPath) {
      // Load từ file
      const fs = require('fs');
      const path = require('path');
      const serviceAccountFile = path.resolve(serviceAccountPath);
      
      if (!fs.existsSync(serviceAccountFile)) {
        console.error(`❌ File service account không tồn tại: ${serviceAccountFile}`);
        return;
      }

      serviceAccount = require(serviceAccountFile);
      console.log(`📝 Đã load Firebase service account từ: ${serviceAccountFile}`);
    }

    // Validate service account
    if (!serviceAccount || !serviceAccount.project_id) {
      console.error('❌ Service account không hợp lệ: thiếu project_id');
      return;
    }

    // Initialize Firebase Admin
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });

    console.log(`✅ Firebase Admin SDK đã được khởi tạo thành công (Project: ${serviceAccount.project_id})`);
  } catch (error: any) {
    console.error('❌ Lỗi khởi tạo Firebase Admin SDK:', error.message || error);
    console.error('   Push notifications sẽ không hoạt động.');
  }
}

/**
 * Gửi push notification
 */
export async function sendPushNotification(
  token: string,
  platform: 'android' | 'ios' | 'web',
  title: string,
  body: string,
  data: any = {}
): Promise<void> {
  if (!isFirebaseAdminInitialized()) {
    throw new Error('Firebase Admin SDK chưa được khởi tạo');
  }

  const isAndroidMessage = platform === 'android' && data?.type === 'message';

  const message: any = {
    data: {
      ...Object.keys(data).reduce((acc, key) => {
        acc[key] = String(data[key]);
        return acc;
      }, {} as any)
    },
    token
  };

  if (!isAndroidMessage) {
    message.notification = {
      title,
      body
    };
  } else {
    message.data.custom_title = title;
    message.data.custom_body = body;
  }

  // Platform-specific configuration
  if (platform === 'android') {
    message.android = {
      priority: 'high',
      notification: {
        sound: 'default',
        channelId: 'default'
      }
    };
  } else if (platform === 'ios') {
    message.apns = {
      payload: {
        aps: {
          sound: 'default',
          badge: 1
        }
      }
    };
  } else if (platform === 'web') {
    message.webpush = {
      notification: {
        icon: '/icon-192x192.png',
        badge: '/badge-72x72.png'
      }
    };
  }

  try {
    const response = await admin.messaging().send(message);
    console.log('✅ Push notification đã được gửi:', response);
  } catch (error: any) {
    console.error('❌ Lỗi gửi push notification:', error);
    throw error;
  }
}

/**
 * Gửi push notification đến nhiều tokens (multicast)
 */
export async function sendPushNotificationToMultiple(
  tokens: string[],
  platform: 'android' | 'ios' | 'web',
  title: string,
  body: string,
  data: any = {}
): Promise<{ successCount: number; failureCount: number }> {
  if (!admin || !admin.apps || admin.apps.length === 0) {
    throw new Error('Firebase Admin SDK chưa được khởi tạo');
  }

  if (tokens.length === 0) {
    return { successCount: 0, failureCount: 0 };
  }

  const isAndroidMessage = platform === 'android' && data?.type === 'message';

  const message: any = {
    data: {
      ...Object.keys(data).reduce((acc, key) => {
        acc[key] = String(data[key]);
        return acc;
      }, {} as any)
    }
  };

  if (!isAndroidMessage) {
    message.notification = {
      title,
      body
    };
  } else {
    message.data.custom_title = title;
    message.data.custom_body = body;
  }

  // Platform-specific configuration
  if (platform === 'android') {
    message.android = {
      priority: 'high',
      notification: {
        sound: 'default',
        channelId: 'default'
      }
    };
  } else if (platform === 'ios') {
    message.apns = {
      payload: {
        aps: {
          sound: 'default',
          badge: 1
        }
      }
    };
  } else if (platform === 'web') {
    message.webpush = {
      notification: {
        icon: '/icon-192x192.png',
        badge: '/badge-72x72.png'
      }
    };
  }

  try {
    const response = await admin.messaging().sendEachForMulticast({
      tokens,
      ...message
    });

    return {
      successCount: response.successCount,
      failureCount: response.failureCount
    };
  } catch (error: any) {
    console.error('❌ Lỗi gửi multicast push notification:', error);
    throw error;
  }
}

