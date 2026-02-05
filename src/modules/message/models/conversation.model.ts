import mongoose, { Schema, Document } from 'mongoose';

export type ConversationType = 'PRIVATE' | 'GROUP';

export interface IConversationLastMessage {
  messageId: mongoose.Types.ObjectId;
  senderId: mongoose.Types.ObjectId;
  text: string;
  createdAt: Date;
}

export interface IConversation extends Document {
  type: ConversationType;
  name?: string;
  avatar?: string;
  // Cho phòng PRIVATE: lưu thông tin user kia
  otherUserId?: mongoose.Types.ObjectId;
  otherUserName?: string; // displayName hoặc username của user kia
  groupSettings?: {
    onlyAdminSend: boolean;
    allowRename: boolean;
  };
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  lastMessage?: IConversationLastMessage;
  memberCount: number;
  isDeleted: boolean;
}

const lastMessageSchema = new Schema<IConversationLastMessage>(
  {
    messageId: {
      type: Schema.Types.ObjectId,
      ref: 'Message'
    },
    senderId: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    text: {
      type: String,
      default: ''
    },
    createdAt: {
      type: Date
    }
  },
  { _id: false }
);

const conversationSchema = new Schema<IConversation>(
  {
    type: {
      type: String,
      enum: ['PRIVATE', 'GROUP'],
      required: true,
      index: true
    },
    name: {
      type: String,
      trim: true,
      maxlength: 255
    },
    avatar: {
      type: String,
      trim: true
    },
    // Cho phòng PRIVATE: lưu thông tin user kia để hiển thị tên
    otherUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true
    },
    otherUserName: {
      type: String,
      trim: true,
      maxlength: 255
    },
    groupSettings: {
      onlyAdminSend: {
        type: Boolean,
        default: false
      },
      allowRename: {
        type: Boolean,
        default: true
      }
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    lastMessage: {
      type: lastMessageSchema
    },
    memberCount: {
      type: Number,
      default: 0,
      index: true
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

// Index để sort nhanh theo hoạt động gần nhất trong danh sách phòng
conversationSchema.index({ 'lastMessage.createdAt': -1 });
conversationSchema.index({ updatedAt: -1 });

export default mongoose.model<IConversation>('Conversation', conversationSchema);


