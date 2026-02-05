import mongoose, { Schema, Document } from 'mongoose';

export interface IFriend extends Document {
  userId: mongoose.Types.ObjectId;
  friendId: mongoose.Types.ObjectId;
  friendshipEndedAt?: Date; // Thời điểm hủy kết bạn (nếu có)
  createdAt: Date;
  updatedAt: Date;
}

const friendSchema = new Schema<IFriend>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    friendId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    friendshipEndedAt: {
      type: Date,
      default: null,
      index: true // Index để query nhanh các friendship đã kết thúc
    }
  },
  { timestamps: true }
);

// Compound unique index để đảm bảo không có duplicate friend relationship
friendSchema.index({ userId: 1, friendId: 1 }, { unique: true });

// Index để tìm nhanh friends của một user
friendSchema.index({ userId: 1 });
friendSchema.index({ friendId: 1 });

export default mongoose.model<IFriend>('Friend', friendSchema);

