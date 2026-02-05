import Block, { IBlock } from './models/block.model';
import User from '../auth/auth.model';
import FriendRequest from './models/friend-request.model';
import Friend from './models/friend.model';

export class BlockService {
  /**
   * Chặn một user
   */
  async blockUser(blockerId: string, blockedId: string): Promise<IBlock> {
    // Kiểm tra không được chặn chính mình
    if (blockerId === blockedId) {
      throw new Error('Không thể chặn chính mình');
    }

    // Kiểm tra blocked user có tồn tại không
    const blockedUser = await User.findById(blockedId);
    if (!blockedUser) {
      throw new Error('Người dùng không tồn tại');
    }

    // Kiểm tra đã chặn chưa
    const existingBlock = await Block.findOne({ blockerId, blockedId });
    if (existingBlock) {
      throw new Error('Đã chặn người dùng này');
    }

    // Tạo block record
    const block = await Block.create({
      blockerId,
      blockedId
    });

    // Xóa friend relationship nếu có
    await Friend.updateMany(
      {
        $or: [
          { userId: blockerId, friendId: blockedId, friendshipEndedAt: null },
          { userId: blockedId, friendId: blockerId, friendshipEndedAt: null }
        ]
      },
      {
        $set: { friendshipEndedAt: new Date() }
      }
    );

    // Xóa pending friend requests (cả 2 chiều)
    await FriendRequest.deleteMany({
      $or: [
        { senderId: blockerId, receiverId: blockedId, status: 'pending' },
        { senderId: blockedId, receiverId: blockerId, status: 'pending' }
      ]
    });

    return block;
  }

  /**
   * Bỏ chặn một user
   */
  async unblockUser(blockerId: string, blockedId: string): Promise<void> {
    const block = await Block.findOne({ blockerId, blockedId });
    if (!block) {
      throw new Error('Chưa chặn người dùng này');
    }

    await Block.deleteOne({ _id: block._id });
  }

  /**
   * Lấy danh sách người bị chặn
   */
  async getBlockedUsers(userId: string): Promise<any[]> {
    const blocks = await Block.find({ blockerId: userId })
      .populate('blockedId', 'username displayName email avatar')
      .sort({ createdAt: -1 })
      .lean();

    return blocks.map(b => ({
      _id: b._id,
      blockedUser: b.blockedId,
      createdAt: b.createdAt
    }));
  }

  /**
   * Kiểm tra 2 users có bị chặn không
   */
  async isBlocked(blockerId: string, blockedId: string): Promise<boolean> {
    const block = await Block.findOne({
      $or: [
        { blockerId, blockedId },
        { blockerId: blockedId, blockedId: blockerId }
      ]
    });
    return !!block;
  }
}

export default new BlockService();

