import mongoose, { Schema, Document } from 'mongoose';

export type ConversationMemberRole = 'ADMIN' | 'MEMBER';

export interface IConversationMember extends Document {
  conversationId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;

  nickname?: string;
  customBackground?: string; // màu hoặc image url

  role: ConversationMemberRole;

  isConversationBlocked: boolean; // block phòng này (ignore)
  isMuted: boolean;
  isPinned: boolean;

  unreadCount: number;

  joinedAt: Date;
  leftAt?: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

const conversationMemberSchema = new Schema<IConversationMember>(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    nickname: {
      type: String,
      trim: true,
      maxlength: 255
    },
    customBackground: {
      type: String,
      trim: true,
      maxlength: 1024
    },
    role: {
      type: String,
      enum: ['ADMIN', 'MEMBER'],
      default: 'MEMBER'
    },
    isConversationBlocked: {
      type: Boolean,
      default: false
    },
    isMuted: {
      type: Boolean,
      default: false
    },
    isPinned: {
      type: Boolean,
      default: false
    },
    unreadCount: {
      type: Number,
      default: 0
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    leftAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Một user chỉ có 1 cấu hình cho mỗi phòng
conversationMemberSchema.index({ conversationId: 1, userId: 1 }, { unique: true });
// Truy vấn nhanh danh sách phòng của user
conversationMemberSchema.index({ userId: 1, conversationId: 1 });

// Dùng cho list phòng của user (pin trước, hoạt động gần nhất)
conversationMemberSchema.index({ userId: 1, isPinned: -1, updatedAt: -1 });

export default mongoose.model<IConversationMember>('ConversationMember', conversationMemberSchema);


