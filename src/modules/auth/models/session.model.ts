import mongoose, { Schema, Document } from 'mongoose';

export interface ISession extends Document {
  userId: mongoose.Types.ObjectId;
  deviceId: string;
  deviceName?: string;
  deviceType: 'mobile' | 'web' | 'desktop' | 'tablet';
  refreshToken: string;
  previousRefreshToken?: string; // Token cũ sau khi rotate (để phát hiện reuse)
  ipAddress?: string;
  userAgent?: string;
  lastActiveAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const sessionSchema = new Schema<ISession>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    deviceId: {
      type: String,
      required: true,
      index: true
    },
    deviceName: {
      type: String,
      default: null
    },
    deviceType: {
      type: String,
      enum: ['mobile', 'web', 'desktop', 'tablet'],
      default: 'web'
    },
    refreshToken: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    previousRefreshToken: {
      type: String,
      default: null,
      index: true // Index để tìm nhanh khi check reuse
    },
    ipAddress: {
      type: String,
      default: null
    },
    userAgent: {
      type: String,
      default: null
    },
    lastActiveAt: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);

sessionSchema.index({ userId: 1, deviceId: 1 }, { unique: true });
sessionSchema.index({ refreshToken: 1 });
sessionSchema.index({ previousRefreshToken: 1 }); // Index để tìm nhanh khi check reuse

/**
 * TTL index cho session:
 * - Tự động xoá session sau 30 ngày không hoạt động (dựa trên lastActiveAt)
 * - Giúp implement behavior "ghi nhớ đăng nhập trên thiết bị trong 30 ngày"
 *
 * Mỗi lần refresh token, lastActiveAt sẽ được cập nhật,
 * nên nếu user vẫn dùng app thường xuyên thì session sẽ được giữ,
 * còn nếu bỏ app > 30 ngày thì session + refresh token sẽ tự bị xoá.
 */
sessionSchema.index(
  { lastActiveAt: 1 },
  {
    expireAfterSeconds: 30 * 24 * 60 * 60
  }
);

export default mongoose.model<ISession>('Session', sessionSchema);

