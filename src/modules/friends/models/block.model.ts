import mongoose, { Schema, Document } from 'mongoose';

export interface IBlock extends Document {
  blockerId: mongoose.Types.ObjectId; // Người chặn
  blockedId: mongoose.Types.ObjectId; // Người bị chặn
  createdAt: Date;
  updatedAt: Date;
}

const blockSchema = new Schema<IBlock>(
  {
    blockerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    blockedId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    }
  },
  { timestamps: true }
);

// Compound unique index để đảm bảo không có duplicate block
blockSchema.index({ blockerId: 1, blockedId: 1 }, { unique: true });

// Index để tìm nhanh
blockSchema.index({ blockerId: 1 }); // Danh sách người bị chặn của một user
blockSchema.index({ blockedId: 1 }); // Danh sách người đã chặn một user

export default mongoose.model<IBlock>('Block', blockSchema);

