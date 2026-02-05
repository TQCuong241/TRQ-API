import mongoose, { Schema, Document } from 'mongoose';

export interface IFriendRequest extends Document {
  senderId: mongoose.Types.ObjectId;
  receiverId: mongoose.Types.ObjectId;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: Date;
  updatedAt: Date;
}

const friendRequestSchema = new Schema<IFriendRequest>(
  {
    senderId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    receiverId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected'],
      default: 'pending',
      index: true
    }
  },
  { timestamps: true }
);

// Compound index để đảm bảo không có duplicate pending request giữa 2 users
friendRequestSchema.index({ senderId: 1, receiverId: 1, status: 1 }, { unique: true, partialFilterExpression: { status: 'pending' } });

// Index để tìm nhanh requests của một user
friendRequestSchema.index({ receiverId: 1, status: 1 });
friendRequestSchema.index({ senderId: 1, status: 1 });

export default mongoose.model<IFriendRequest>('FriendRequest', friendRequestSchema);

