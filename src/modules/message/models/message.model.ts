import mongoose, { Schema, Document } from 'mongoose';

export type MessageType = 'TEXT' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FILE' | 'SYSTEM';

export type MessageReactionType =
  | 'LIKE'
  | 'LOVE'
  | 'HAHA'
  | 'WOW'
  | 'SAD'
  | 'ANGRY';

export interface IMessageContent {
  text?: string | null;
  mediaUrl?: string | null;
  /**
   * MIME type của file (image/png, video/mp4, application/pdf, ...)
   * Giúp client render đúng kiểu mà không cần đoán từ đuôi file
   */
  mimeType?: string | null;
  /**
   * Thông tin file để hiển thị (đặc biệt cho FILE / DOCUMENT)
   */
  fileName?: string | null;
  fileSize?: number | null; // bytes
  /**
   * Thời lượng (giây) cho audio / video (nếu có)
   */
  duration?: number | null;
}

export interface IMessageReaction {
  userId: mongoose.Types.ObjectId;
  type: MessageReactionType;
  createdAt: Date;
}

export interface IMessage extends Document {
  conversationId: mongoose.Types.ObjectId;
  senderId: mongoose.Types.ObjectId;
  type: MessageType;
  content: IMessageContent;
  /**
   * Trả lời một tin nhắn trước đó trong cùng conversation
   */
  replyToMessageId?: mongoose.Types.ObjectId | null;
  /**
   * Danh sách reactions (like, tim, haha, ...)
   */
  reactions: IMessageReaction[];
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
}

const messageContentSchema = new Schema<IMessageContent>(
  {
    text: {
      type: String,
      default: null
    },
    mediaUrl: {
      type: String,
      default: null
    },
    mimeType: {
      type: String,
      default: null
    },
    fileName: {
      type: String,
      default: null
    },
    fileSize: {
      type: Number,
      default: null
    },
    duration: {
      type: Number,
      default: null
    }
  },
  { _id: false }
);

const messageReactionSchema = new Schema<IMessageReaction>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    type: {
      type: String,
      enum: ['LIKE', 'LOVE', 'HAHA', 'WOW', 'SAD', 'ANGRY'],
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: false }
);

const messageSchema = new Schema<IMessage>(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true
    },
    senderId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    type: {
      type: String,
      enum: ['TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'FILE', 'SYSTEM'],
      required: true
    },
    content: {
      type: messageContentSchema,
      required: true
    },
    replyToMessageId: {
      type: Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
      index: true
    },
    reactions: {
      type: [messageReactionSchema],
      default: []
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true
    }
  },
  {
    timestamps: true
  }
);

// Index để phân trang messages theo thời gian
messageSchema.index({ conversationId: 1, createdAt: -1 });

// Index hỗ trợ query theo reply / reactions (ví dụ cho thống kê hoặc load thread)
messageSchema.index({ replyToMessageId: 1 });

export default mongoose.model<IMessage>('Message', messageSchema);


