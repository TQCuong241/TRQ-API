import mongoose from 'mongoose';
import FriendRequest, { IFriendRequest } from './models/friend-request.model';
import Friend, { IFriend } from './models/friend.model';
import messageService from '../message/message.service';
import User from '../auth/auth.model';
import blockService from './block.service';
import notificationsService from '../notifications/notifications.service';

export class FriendsService {

  /**
   * Gửi lời mời kết bạn
   */
  async sendFriendRequest(senderId: string, receiverId: string): Promise<IFriendRequest> {
    // Kiểm tra không được gửi lời mời cho chính mình
    if (senderId === receiverId) {
      throw new Error('Không thể gửi lời mời kết bạn cho chính mình');
    }

    // Kiểm tra receiver có tồn tại không
    const receiver = await User.findById(receiverId);
    if (!receiver) {
      throw new Error('Người dùng không tồn tại');
    }

    // Kiểm tra block status (nếu A block B hoặc B block A thì không thể gửi request)
    const isBlockedStatus = await blockService.isBlocked(senderId, receiverId);
    if (isBlockedStatus) {
      throw new Error('Không thể gửi lời mời kết bạn do bị chặn');
    }

    // Kiểm tra đã là bạn chưa (chỉ check những friendship chưa bị hủy)
    const existingFriend = await Friend.findOne({
      $or: [
        { userId: senderId, friendId: receiverId, friendshipEndedAt: null },
        { userId: receiverId, friendId: senderId, friendshipEndedAt: null }
      ]
    });
    if (existingFriend) {
      throw new Error('Đã là bạn bè');
    }

    // Kiểm tra đã có pending request chưa (check cả 2 chiều: A→B và B→A)
    const existingRequest = await FriendRequest.findOne({
      $or: [
        // A gửi B
        { senderId, receiverId, status: 'pending' },
        // B gửi A (ngược chiều)
        { senderId: receiverId, receiverId: senderId, status: 'pending' }
      ]
    });
    if (existingRequest) {
      throw new Error('Đã có lời mời kết bạn đang chờ xử lý');
    }

    // Tạo friend request mới
    const friendRequest = await FriendRequest.create({
      senderId,
      receiverId,
      status: 'pending'
    });

    // Tạo notification và gửi push cho receiver
    try {
      const sender = await User.findById(senderId).select('displayName username avatar').lean();
      if (sender) {
        await notificationsService.createNotification(
          receiverId, // userId: người nhận
          'friend_request',
          'Lời mời kết bạn mới',
          `${sender.displayName || sender.username} đã gửi lời mời kết bạn`,
          {
            friendRequestId: friendRequest._id.toString(),
            senderId: senderId
          },
          senderId, // fromUserId: người gửi lời mời
          true // Gửi push notification
        );
      }
    } catch (error: any) {
      // Không throw error để không ảnh hưởng đến flow chính
      console.error('Lỗi tạo notification cho friend request:', error);
    }

    return friendRequest;
  }

  /**
   * Lấy danh sách lời mời kết bạn (nhận được và đã gửi)
   */
  async getFriendRequests(userId: string, type: 'received' | 'sent' | 'all' = 'all'): Promise<IFriendRequest[]> {
    let query: any = {};

    if (type === 'received') {
      query = { receiverId: userId, status: 'pending' };
    } else if (type === 'sent') {
      query = { senderId: userId, status: 'pending' };
    } else {
      // all: cả nhận và gửi
      query = {
        $or: [
          { receiverId: userId, status: 'pending' },
          { senderId: userId, status: 'pending' }
        ]
      };
    }

    const requests = await FriendRequest.find(query)
      .populate('senderId', 'username displayName email avatar')
      .populate('receiverId', 'username displayName email avatar')
      .sort({ createdAt: -1 })
      .lean();

    return requests as IFriendRequest[];
  }

  /**
   * Lấy friend request theo ID với populate
   */
  async getFriendRequestById(requestId: string): Promise<IFriendRequest | null> {
    const request = await FriendRequest.findById(requestId)
      .populate('senderId', 'username displayName email avatar')
      .populate('receiverId', 'username displayName email avatar')
      .lean();
    
    return request as IFriendRequest | null;
  }

  /**
   * Chấp nhận lời mời kết bạn
   * Sử dụng MongoDB transaction để đảm bảo atomicity (nếu có replica set)
   * Fallback về non-transaction nếu không có replica set (development)
   */
  async acceptFriendRequest(requestId: string, userId: string): Promise<{ friendRequest: IFriendRequest; friend: IFriend }> {
    // Kiểm tra xem MongoDB có hỗ trợ transaction không (replica set)
    const isReplicaSet = mongoose.connection.readyState === 1 && 
                         mongoose.connection.db?.admin() !== undefined;

    // Thử dùng transaction nếu có replica set
    if (isReplicaSet) {
      try {
        return await this._acceptFriendRequestWithTransaction(requestId, userId);
      } catch (error: any) {
        // Nếu lỗi transaction (không có replica set), fallback về non-transaction
        if (error.code === 20 || error.codeName === 'IllegalOperation') {
          console.warn('[Friends] Transaction không được hỗ trợ, sử dụng non-transaction mode');
          return await this._acceptFriendRequestWithoutTransaction(requestId, userId);
        }
        throw error;
      }
    } else {
      // Không có replica set, dùng non-transaction
      return await this._acceptFriendRequestWithoutTransaction(requestId, userId);
    }
  }

  /**
   * Chấp nhận lời mời kết bạn với transaction (replica set)
   */
  private async _acceptFriendRequestWithTransaction(requestId: string, userId: string): Promise<{ friendRequest: IFriendRequest; friend: IFriend }> {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Tìm friend request (trong transaction)
      const friendRequest = await FriendRequest.findOne({
        _id: requestId,
        receiverId: userId,
        status: 'pending'
      }).session(session);

      if (!friendRequest) {
        await session.abortTransaction();
        throw new Error('Lời mời kết bạn không tồn tại hoặc đã được xử lý');
      }

      // Update status thành accepted (trong transaction)
      friendRequest.status = 'accepted';
      await friendRequest.save({ session });

      // Tạo / khôi phục quan hệ bạn bè (2 chiều: A-B và B-A) trong transaction
      // Nếu đã từng là bạn nhưng đã unfriend (friendshipEndedAt != null) thì chỉ cần set lại null
      const friend1 = await Friend.findOneAndUpdate(
        {
          userId: friendRequest.senderId,
          friendId: friendRequest.receiverId
        },
        {
          $set: {
            friendshipEndedAt: null
          }
        },
        {
          new: true,
          upsert: true,
          session
        }
      );

      const friend2 = await Friend.findOneAndUpdate(
        {
          userId: friendRequest.receiverId,
          friendId: friendRequest.senderId
        },
        {
          $set: {
            friendshipEndedAt: null
          }
        },
        {
          new: true,
          upsert: true,
          session
        }
      );

      // Commit transaction
      await session.commitTransaction();

      const senderIdStr = friendRequest.senderId.toString();
      const receiverIdStr = friendRequest.receiverId.toString();

      // Sau khi commit thành công:
      // 1) Tạo notification "friend_request_accepted" cho sender
      this._createFriendRequestAcceptedNotification(senderIdStr, receiverIdStr, friendRequest._id.toString()).catch(err => {
        console.error('Lỗi tạo notification cho friend request accepted:', err);
      });

      // 2) Đảm bảo tồn tại phòng PRIVATE 1-1 giữa 2 user (chỉ tạo nếu chưa có)
      messageService.ensurePrivateConversation(senderIdStr, receiverIdStr).catch(err => {
        console.error('Lỗi tạo phòng chat 1-1 sau khi kết bạn (transaction):', err);
      });

      return {
        friendRequest: friendRequest.toObject() as IFriendRequest,
        friend: friend1.toObject() as IFriend
      };
    } catch (error: any) {
      // Rollback transaction nếu có lỗi
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Chấp nhận lời mời kết bạn không dùng transaction (fallback cho development)
   */
  private async _acceptFriendRequestWithoutTransaction(requestId: string, userId: string): Promise<{ friendRequest: IFriendRequest; friend: IFriend }> {
    // Tìm friend request
    const friendRequest = await FriendRequest.findOne({
      _id: requestId,
      receiverId: userId,
      status: 'pending'
    });

    if (!friendRequest) {
      throw new Error('Lời mời kết bạn không tồn tại hoặc đã được xử lý');
    }

    // Update status thành accepted
    friendRequest.status = 'accepted';
    await friendRequest.save();

    // Tạo / khôi phục quan hệ bạn bè (2 chiều: A-B và B-A)
    // Nếu đã từng là bạn nhưng đã unfriend (friendshipEndedAt != null) thì chỉ cần set lại null
    const friend1 = await Friend.findOneAndUpdate(
      {
        userId: friendRequest.senderId,
        friendId: friendRequest.receiverId
      },
      {
        $set: {
          friendshipEndedAt: null
        }
      },
      {
        new: true,
        upsert: true
      }
    );

    const friend2 = await Friend.findOneAndUpdate(
      {
        userId: friendRequest.receiverId,
        friendId: friendRequest.senderId
      },
      {
        $set: {
          friendshipEndedAt: null
        }
      },
      {
        new: true,
        upsert: true
      }
    );

    const senderIdStr = friendRequest.senderId.toString();
    const receiverIdStr = friendRequest.receiverId.toString();

    // Tạo notification cho sender (người gửi lời mời)
    this._createFriendRequestAcceptedNotification(senderIdStr, receiverIdStr, friendRequest._id.toString()).catch(err => {
      console.error('Lỗi tạo notification cho friend request accepted:', err);
    });

    // Đảm bảo tồn tại phòng PRIVATE 1-1 giữa 2 user (chỉ tạo nếu chưa có)
    messageService.ensurePrivateConversation(senderIdStr, receiverIdStr).catch(err => {
      console.error('Lỗi tạo phòng chat 1-1 sau khi kết bạn (non-transaction):', err);
    });

    return {
      friendRequest: friendRequest.toObject() as IFriendRequest,
      friend: friend1.toObject() as IFriend
    };
  }

  /**
   * Helper: Tạo notification khi friend request được chấp nhận
   */
  private async _createFriendRequestAcceptedNotification(senderId: string, receiverId: string, friendRequestId: string): Promise<void> {
    try {
      const receiver = await User.findById(receiverId).select('displayName username avatar').lean();
      if (receiver) {
        await notificationsService.createNotification(
          senderId, // userId: người nhận (người gửi lời mời)
          'friend_request_accepted',
          'Lời mời kết bạn đã được chấp nhận',
          `${receiver.displayName || receiver.username} đã chấp nhận lời mời kết bạn của bạn`,
          {
            friendRequestId: friendRequestId,
            friendId: receiverId
          },
          receiverId, // fromUserId: người chấp nhận
          true // sendPush: Gửi push notification
        );
      }
    } catch (error: any) {
      console.error('Lỗi tạo notification cho friend request accepted:', error);
    }
  }

  /**
   * Từ chối lời mời kết bạn
   */
  async rejectFriendRequest(requestId: string, userId: string): Promise<IFriendRequest> {
    const friendRequest = await FriendRequest.findOne({
      _id: requestId,
      receiverId: userId,
      status: 'pending'
    });

    if (!friendRequest) {
      throw new Error('Lời mời kết bạn không tồn tại hoặc đã được xử lý');
    }

    friendRequest.status = 'rejected';
    await friendRequest.save();

    // Tạo notification cho sender (người gửi lời mời) - optional, có thể bỏ qua
    // Thường thì từ chối không cần thông báo để tránh làm người dùng khó chịu
    // Uncomment nếu muốn thông báo khi bị từ chối:
    // this._createFriendRequestRejectedNotification(friendRequest.senderId.toString(), friendRequest.receiverId.toString(), friendRequest._id.toString()).catch(err => {
    //   console.error('Lỗi tạo notification cho friend request rejected:', err);
    // });

    return friendRequest.toObject() as IFriendRequest;
  }

  /**
   * Hủy kết bạn
   * Lưu ý: KHÔNG xóa friend requests để giữ lại history cho audit và suggestions
   * Thay vì xóa, mark friendshipEndedAt để soft delete
   */
  async removeFriend(userId: string, friendIdOrFriendRecordId: string): Promise<void> {
    const now = new Date();

    // Case 1: friendIdOrFriendRecordId là userId của bạn (flow chuẩn)
    const primaryResult = await Friend.updateMany(
      {
        $or: [
          { userId, friendId: friendIdOrFriendRecordId },
          { userId: friendIdOrFriendRecordId, friendId: userId }
        ],
        friendshipEndedAt: null // Chỉ update những record chưa bị hủy
      },
      {
        $set: { friendshipEndedAt: now }
      }
    );

    if (primaryResult.matchedCount > 0) {
      // Đã soft-delete thành công theo userId pair
      return;
    }

    // Case 2: frontend truyền nhầm _id của Friend record thay vì userId
    const friendRecord = await Friend.findOne({
      _id: friendIdOrFriendRecordId
    });

    if (!friendRecord) {
      // Không tìm thấy gì để hủy, coi như xong (không throw để tránh 500)
      return;
    }

    const otherUserId = friendRecord.userId.toString() === userId
      ? friendRecord.friendId.toString()
      : friendRecord.userId.toString();

    await Friend.updateMany(
      {
        $or: [
          { userId, friendId: otherUserId },
          { userId: otherUserId, friendId: userId }
        ],
        friendshipEndedAt: null
      },
      {
        $set: { friendshipEndedAt: now }
      }
    );

    // Lưu ý: Friend requests được giữ lại để:
    // - Audit trail
    // - Suggestions sau này
    // - History tracking
  }

  /**
   * Hủy lời mời kết bạn (chỉ sender mới có thể hủy)
   */
  async cancelFriendRequest(requestId: string, userId: string): Promise<void> {
    const friendRequest = await FriendRequest.findOne({
      _id: requestId,
      senderId: userId,
      status: 'pending'
    });

    if (!friendRequest) {
      throw new Error('Lời mời kết bạn không tồn tại hoặc đã được xử lý');
    }

    // Xóa request (chỉ pending requests mới có thể hủy)
    await FriendRequest.deleteOne({ _id: requestId });
  }

  /**
   * Lấy danh sách bạn bè (chỉ những friendship chưa bị hủy)
   */
  async getFriends(userId: string): Promise<any[]> {
    const friends = await Friend.find({
      userId,
      friendshipEndedAt: null // Chỉ lấy những friendship chưa bị hủy
    })
      .populate('friendId', 'username displayName email avatar onlineStatus lastSeenAt')
      .sort({ createdAt: -1 })
      .lean();

    return friends.map(f => ({
      _id: f._id,
      friend: f.friendId,
      createdAt: f.createdAt
    }));
  }

  /**
   * Kiểm tra 2 users có phải bạn bè không (chỉ check những friendship chưa bị hủy)
   */
  async areFriends(userId1: string, userId2: string): Promise<boolean> {
    const friend = await Friend.findOne({
      $or: [
        { userId: userId1, friendId: userId2, friendshipEndedAt: null },
        { userId: userId2, friendId: userId1, friendshipEndedAt: null }
      ]
    });

    return !!friend;
  }

  /**
   * Lấy danh sách lời mời kết bạn đã được chấp nhận (user là sender)
   * Tức là những lời mời mà user đã gửi và được chấp nhận
   */
  async getAcceptedFriendRequests(userId: string, limit: number = 20, page: number = 1): Promise<{
    requests: any[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const skip = (page - 1) * limit;

    const [requests, total] = await Promise.all([
      FriendRequest.find({
        senderId: userId,
        status: 'accepted'
      })
        .populate('receiverId', 'username displayName email avatar onlineStatus lastSeenAt')
        .sort({ updatedAt: -1 }) // Sắp xếp theo thời gian chấp nhận (mới nhất trước)
        .skip(skip)
        .limit(limit)
        .lean(),
      FriendRequest.countDocuments({
        senderId: userId,
        status: 'accepted'
      })
    ]);

    return {
      requests: requests.map(req => ({
        _id: req._id,
        receiver: req.receiverId, // Người đã chấp nhận lời mời
        status: req.status,
        createdAt: req.createdAt,
        updatedAt: req.updatedAt // Thời gian chấp nhận
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit)
    };
  }

  /**
   * Lấy danh sách lời mời kết bạn đang chờ (user là receiver)
   * Tức là những lời mời mà user nhận được và chưa xử lý
   */
  async getPendingFriendRequests(userId: string, limit: number = 20, page: number = 1): Promise<{
    requests: any[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const skip = (page - 1) * limit;

    const [requests, total] = await Promise.all([
      FriendRequest.find({
        receiverId: userId,
        status: 'pending'
      })
        .populate('senderId', 'username displayName email avatar onlineStatus lastSeenAt')
        .sort({ createdAt: -1 }) // Sắp xếp theo thời gian gửi (mới nhất trước)
        .skip(skip)
        .limit(limit)
        .lean(),
      FriendRequest.countDocuments({
        receiverId: userId,
        status: 'pending'
      })
    ]);

    return {
      requests: requests.map(req => ({
        _id: req._id,
        sender: req.senderId, // Người gửi lời mời
        status: req.status,
        createdAt: req.createdAt,
        updatedAt: req.updatedAt
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit)
    };
  }
}

export default new FriendsService();

