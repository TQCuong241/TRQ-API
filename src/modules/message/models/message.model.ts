import mongoose, { Schema, Document } from 'mongoose';

export type MessageType = 'TEXT' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FILE' | 'SYSTEM';

export type MessageReactionType = string;

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

export interface IMessageSeenBy {
  userId: mongoose.Types.ObjectId;
  seenAt: Date;
}

export interface IMessageForward {
  /** ID của tin nhắn gốc */
  fromMessageId: mongoose.Types.ObjectId;
  /** ID người gửi gốc */
  fromUserId: mongoose.Types.ObjectId;
  /** ID conversation gốc */
  fromConversationId: mongoose.Types.ObjectId;
  /** Thời điểm tin nhắn gốc được tạo */
  fromAt: Date;
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
  /**
   * Danh sách người đã xem tin nhắn
   */
  seenBy: IMessageSeenBy[];
  /**
   * Đã được edit chưa
   */
  isEdited: boolean;
  editedAt?: Date | null;
  /**
   * Tin nhắn có đang bị ghim không
   */
  isPinned: boolean;
  pinnedBy?: mongoose.Types.ObjectId | null;
  pinnedAt?: Date | null;
  /**
   * Thông tin forward (nếu đây là tin nhắn được forward)
   */
  forward?: IMessageForward | null;
  /**
   * Xóa cho mọi người (soft delete hiển thị "Tin nhắn đã bị xóa")
   */
  isDeleted: boolean;
  /**
   * Danh sách userId đã tự xóa tin nhắn này (chỉ ẩn với họ)
   */
  deletedForUsers: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
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
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: false }
);

const messageSeenBySchema = new Schema<IMessageSeenBy>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    seenAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: false }
);

const messageForwardSchema = new Schema<IMessageForward>(
  {
    fromMessageId: {
      type: Schema.Types.ObjectId,
      ref: 'Message',
      required: true
    },
    fromUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    fromConversationId: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true
    },
    fromAt: {
      type: Date,
      required: true
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
    seenBy: {
      type: [messageSeenBySchema],
      default: []
    },
    isEdited: {
      type: Boolean,
      default: false
    },
    editedAt: {
      type: Date,
      default: null
    },
    isPinned: {
      type: Boolean,
      default: false,
      index: true
    },
    pinnedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    pinnedAt: {
      type: Date,
      default: null
    },
    forward: {
      type: messageForwardSchema,
      default: null
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true
    },
    deletedForUsers: {
      type: [Schema.Types.ObjectId],
      ref: 'User',
      default: []
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

// Index tìm kiếm tin nhắn theo text (full-text search)
messageSchema.index({ 'content.text': 'text' });

// Index lấy tin nhắn đã ghim trong conversation
messageSchema.index({ conversationId: 1, isPinned: 1 });

export default mongoose.model<IMessage>('Message', messageSchema);
