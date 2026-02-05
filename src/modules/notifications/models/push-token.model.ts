import mongoose, { Schema, Document } from 'mongoose';

export interface IPushToken extends Document {
  userId: mongoose.Types.ObjectId;
  token: string; // FCM token hoặc APNS token
  platform: 'android' | 'ios' | 'web';
  deviceId?: string; // Optional: để track device
  deviceName?: string; // Optional: tên thiết bị
  active: boolean; // Có còn active không (có thể disable)
  createdAt: Date;
  updatedAt: Date;
}

const pushTokenSchema = new Schema<IPushToken>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    token: {
      type: String,
      required: true,
      unique: true, // Mỗi token chỉ thuộc về 1 user
      index: true
    },
    platform: {
      type: String,
      enum: ['android', 'ios', 'web'],
      required: true,
      index: true
    },
    deviceId: {
      type: String,
      default: undefined,
      index: true
    },
    deviceName: {
      type: String,
      default: undefined,
      maxlength: [200, 'Tên thiết bị không được quá 200 ký tự']
    },
    active: {
      type: Boolean,
      default: true,
      index: true
    }
  },
  { timestamps: true }
);

// Compound index để tìm tokens của một user
pushTokenSchema.index({ userId: 1, active: 1 });

// Index để tìm token nhanh
pushTokenSchema.index({ token: 1, active: 1 });

export default mongoose.model<IPushToken>('PushToken', pushTokenSchema);

