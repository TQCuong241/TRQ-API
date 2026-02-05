import mongoose, { Schema, Document } from 'mongoose';

export interface INotification extends Document {
  userId: mongoose.Types.ObjectId; // Người nhận notification
  fromUserId?: mongoose.Types.ObjectId; // Người gây ra notification (optional)
  type: 'friend_request' | 'friend_request_accepted' | 'friend_request_rejected' | 'friend_removed' | 'message' | 'call' | 'system';
  title: string;
  body: string;
  data?: {
    friendRequestId?: string;
    friendId?: string;
    senderId?: string;
    conversationId?: string;
    callId?: string;
    roomId?: string;
    [key: string]: any;
  };
  read: boolean;
  readAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    fromUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: undefined,
      index: true
    },
    type: {
      type: String,
      enum: ['friend_request', 'friend_request_accepted', 'friend_request_rejected', 'friend_removed', 'message', 'call', 'system'],
      required: true,
      index: true
    },
    title: {
      type: String,
      required: true,
      maxlength: [200, 'Tiêu đề không được quá 200 ký tự']
    },
    body: {
      type: String,
      required: true,
      maxlength: [500, 'Nội dung không được quá 500 ký tự']
    },
    data: {
      type: Schema.Types.Mixed,
      default: {}
    },
    read: {
      type: Boolean,
      default: false,
      index: true
    },
    readAt: {
      type: Date,
      default: undefined
    }
  },
  { timestamps: true }
);

// Compound index để tìm nhanh notifications chưa đọc của một user (theo checklist)
notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

// Index để tìm notifications theo type
notificationSchema.index({ userId: 1, type: 1, createdAt: -1 });

/**
 * TTL index: Tự động xoá các notification loại "message" sau 5 phút
 *
 * Lưu ý:
 * - MongoDB sẽ định kỳ quét và xoá document có createdAt quá hạn
 * - Chỉ áp dụng cho type === 'message' nhờ partialFilterExpression
 */
notificationSchema.index(
  { createdAt: 1 },
  {
    expireAfterSeconds: 5 * 60,
    partialFilterExpression: { type: 'message' }
  }
);

export default mongoose.model<INotification>('Notification', notificationSchema);

