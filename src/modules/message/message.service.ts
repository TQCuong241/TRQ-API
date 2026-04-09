import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import Conversation, { IConversation } from './models/conversation.model';
import ConversationMember, { IConversationMember } from './models/conversation-member.model';
import Message, {
  IMessage,
  MessageType,
  MessageReactionType
} from './models/message.model';
import Block from '../friends/models/block.model';
import User from '../auth/auth.model';
import notificationsService from '../notifications/notifications.service';

// ─── Helper: xóa file media vật lý trên disk ──────────────────────────────────
function deleteMediaFiles(mediaUrl: string | null | undefined): void {
  if (!mediaUrl) return;
  // Hỗ trợ JSON array (nhiều ảnh)
  let urls: string[] = [];
  try {
    const parsed = JSON.parse(mediaUrl);
    if (Array.isArray(parsed)) urls = parsed;
  } catch {
    urls = [mediaUrl];
  }
  for (const u of urls) {
    if (!u || !u.startsWith('/uploads/')) continue;
    try {
      const filePath = path.join(process.cwd(), u);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log('[Media] Đã xóa file:', filePath);
      }
    } catch (err) {
      console.error('[Media] Lỗi xóa file:', u, err);
    }
  }
}

export interface CreatePrivateConversationResult {
  conversation: IConversation;
  memberSettings: IConversationMember;
}

export interface CreateGroupConversationResult {
  conversation: IConversation;
  members: IConversationMember[];
}

export interface SendMessagePayload {
  type: MessageType;
  text?: string;
  mediaUrl?: string;
  mimeType?: string;
  fileName?: string;
  fileSize?: number;
  duration?: number;
  replyToMessageId?: string;
}

class MessageService {
  /**
   * Lấy danh sách phòng chat của user (kèm cấu hình per-user)
   * Hỗ trợ filter theo type và search theo tên
   */
  async getUserConversations(
    userId: string,
    page: number = 1,
    limit: number = 20,
    filters?: {
      type?: 'PRIVATE' | 'GROUP';
      search?: string; // Tìm kiếm theo tên phòng hoặc tên user kia
    }
  ): Promise<{
    conversations: any[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const skip = (page - 1) * limit;

    // Build query cho ConversationMember
    const memberQuery: any = { userId: userObjectId };
    
    // Build query cho Conversation để filter
    const conversationQuery: any = { isDeleted: false };
    if (filters?.type) {
      conversationQuery.type = filters.type;
    }

    // Nếu có search, tìm conversations có tên khớp
    let conversationIdsForSearch: mongoose.Types.ObjectId[] | null = null;
    if (filters?.search && filters.search.trim()) {
      const searchRegex = new RegExp(filters.search.trim(), 'i');
      const searchConversations = await Conversation.find({
        ...conversationQuery,
        $or: [
          { name: searchRegex },
          { otherUserName: searchRegex }
        ]
      }).select('_id').lean();
      conversationIdsForSearch = searchConversations.map((c: any) => c._id);
      
      // Nếu không tìm thấy conversation nào khớp, trả về empty
      if (conversationIdsForSearch.length === 0) {
        return {
          conversations: [],
          total: 0,
          page,
          totalPages: 0
        };
      }
    }

    // Lấy members với filter
    const memberQueryFinal: any = { ...memberQuery };
    if (conversationIdsForSearch) {
      memberQueryFinal.conversationId = { $in: conversationIdsForSearch };
    }

    const [members, total] = await Promise.all([
      ConversationMember.find(memberQueryFinal)
        .sort({ isPinned: -1, updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ConversationMember.countDocuments(memberQueryFinal)
    ]);

    const conversationIds = members.map((m) => m.conversationId);

    const conversations = await Conversation.find({
      _id: { $in: conversationIds },
      ...conversationQuery
    })
      .populate('otherUserId', 'displayName username avatar')
      .lean()
      .exec();

    const conversationMap = new Map<string, any>();
    conversations.forEach((c: any) => {
      conversationMap.set(c._id.toString(), c);
    });

    // Với phòng PRIVATE, cần tìm user kia và populate thông tin
    const privateConversationIds = conversations
      .filter((c: any) => c.type === 'PRIVATE')
      .map((c: any) => c._id);

    // Lấy tất cả members của các phòng PRIVATE để tìm user kia
    const allPrivateMembers = privateConversationIds.length > 0
      ? await ConversationMember.find({
          conversationId: { $in: privateConversationIds },
          userId: { $ne: userObjectId }
        })
        .populate('userId', 'displayName username avatar')
        .lean()
      : [];

    // Tạo map conversationId -> otherUser
    const otherUserMap = new Map<string, any>();
    allPrivateMembers.forEach((m: any) => {
      const convId = m.conversationId.toString();
      if (!otherUserMap.has(convId)) {
        const otherUser = m.userId as any;
        otherUserMap.set(convId, {
          _id: otherUser._id || otherUser,
          displayName: otherUser.displayName,
          username: otherUser.username,
          avatar: otherUser.avatar
        });
      }
    });

    // Với phòng PRIVATE, cập nhật tên từ user kia
    const result = members
      .map((member) => {
        const conv = conversationMap.get(member.conversationId.toString());
        if (!conv) return null;

        // Nếu là phòng PRIVATE, lấy thông tin user kia
        if (conv.type === 'PRIVATE') {
          const otherUser = otherUserMap.get(conv._id.toString());
          if (otherUser) {
            conv.otherUserId = otherUser._id;
            conv.otherUserName = otherUser.displayName || otherUser.username || 'Người dùng';
            conv.otherUserAvatar = otherUser.avatar;
          } else if (conv.otherUserId) {
            // Fallback: dùng otherUserId đã lưu
            const populatedOtherUser = conv.otherUserId as any;
            if (populatedOtherUser && typeof populatedOtherUser === 'object') {
              conv.otherUserName = populatedOtherUser.displayName || populatedOtherUser.username || conv.otherUserName || 'Người dùng';
              conv.otherUserAvatar = populatedOtherUser.avatar;
            }
          }
        }

        return {
          conversation: conv,
          memberSettings: member
        };
      })
      .filter(Boolean) as any[];

    return {
      conversations: result,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    };
  }

  /**
   * Đảm bảo tồn tại phòng PRIVATE giữa 2 user
   * Nếu đã tồn tại thì trả về, nếu chưa thì tạo mới
   */
  async ensurePrivateConversation(
    currentUserId: string,
    otherUserId: string
  ): Promise<CreatePrivateConversationResult> {
    if (currentUserId === otherUserId) {
      throw new Error('Không thể tạo phòng chat với chính mình');
    }

    const currentId = new mongoose.Types.ObjectId(currentUserId);
    const otherId = new mongoose.Types.ObjectId(otherUserId);

    // Kiểm tra block user 2 chiều
    const blocked = await Block.findOne({
      $or: [
        { blockerId: currentId, blockedId: otherId },
        { blockerId: otherId, blockedId: currentId }
      ]
    });

    if (blocked) {
      throw new Error('Không thể tạo cuộc trò chuyện vì một trong hai bên đã chặn nhau');
    }

    // Tìm phòng PRIVATE đã tồn tại giữa 2 user
    const currentConvIds = await ConversationMember.find({ userId: currentId }).distinct('conversationId');
    const otherConvIds = await ConversationMember.find({ userId: otherId }).distinct('conversationId');

    const sharedIds = currentConvIds.filter((id1) =>
      otherConvIds.some((id2) => id2.toString() === id1.toString())
    );

    if (sharedIds.length > 0) {
      const existingConversation = await Conversation.findOne({
        _id: { $in: sharedIds },
        type: 'PRIVATE',
        isDeleted: false
      })
        .populate('otherUserId', 'displayName username avatar')
        .exec();

      if (existingConversation) {
        // Lấy thông tin user kia (có thể là otherUserId hoặc user khác trong phòng)
        let otherUserInfo: any = null;
        if (existingConversation.otherUserId) {
          const populatedOtherUser = existingConversation.otherUserId as any;
          if (populatedOtherUser && typeof populatedOtherUser === 'object') {
            // Nếu otherUserId trùng với currentUserId, thì user kia là otherId
            if (populatedOtherUser._id.toString() === currentUserId) {
              const actualOtherUser = await User.findById(otherId).select('displayName username avatar').lean();
              otherUserInfo = actualOtherUser;
            } else {
              otherUserInfo = populatedOtherUser;
            }
          }
        }

        // Nếu chưa có otherUserInfo, lấy từ DB
        if (!otherUserInfo) {
          otherUserInfo = await User.findById(otherId).select('displayName username avatar').lean();
        }

        // Cập nhật tên user kia nếu đã thay đổi
        if (otherUserInfo) {
          const newOtherUserName = otherUserInfo.displayName || otherUserInfo.username || 'Người dùng';
          // Cập nhật otherUserId và otherUserName để phù hợp với currentUserId
          if (existingConversation.otherUserId?.toString() !== otherId.toString()) {
            existingConversation.otherUserId = otherId;
          }
          if (existingConversation.otherUserName !== newOtherUserName) {
            existingConversation.otherUserName = newOtherUserName;
            await existingConversation.save();
          }
        }

        const memberSettings = await ConversationMember.findOne({
          conversationId: existingConversation._id,
          userId: currentId
        }).exec();

        if (!memberSettings) {
          throw new Error('Không tìm thấy cấu hình cuộc trò chuyện');
        }

        return {
          conversation: existingConversation,
          memberSettings
        };
      }
    }

    // Nếu chưa có, tạo mới
    // Thử dùng transaction trước (production với replica set)
    try {
      return await this._ensurePrivateConversationWithTransaction(currentId, otherId, currentUserId);
    } catch (error: any) {
      // Nếu lỗi là về transaction (MongoDB không phải replica set), fallback sang cách không dùng transaction
      if (error.code === 20 || error.codeName === 'IllegalOperation') {
        return await this._ensurePrivateConversationWithoutTransaction(currentId, otherId, currentUserId);
      }
      throw error;
    }
  }

  /**
   * Tạo phòng chat 1-1 với transaction (production với replica set)
   */
  private async _ensurePrivateConversationWithTransaction(
    currentId: mongoose.Types.ObjectId,
    otherId: mongoose.Types.ObjectId,
    currentUserId: string
  ): Promise<CreatePrivateConversationResult> {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Lấy thông tin user kia để lưu tên
      const otherUser = await User.findById(otherId).select('displayName username').lean();
      const otherUserName = otherUser?.displayName || otherUser?.username || 'Người dùng';

      const conversation = await Conversation.create(
        [
          {
            type: 'PRIVATE',
            createdBy: currentId,
            memberCount: 2,
            otherUserId: otherId,
            otherUserName: otherUserName
          }
        ],
        { session }
      );

      const conversationDoc = conversation[0];

      const members = await ConversationMember.create(
        [
          {
            conversationId: conversationDoc._id,
            userId: currentId,
            role: 'MEMBER'
          },
          {
            conversationId: conversationDoc._id,
            userId: otherId,
            role: 'MEMBER'
          }
        ],
        { session }
      );

      await session.commitTransaction();
      session.endSession();

      const currentMember = members.find((m) => m.userId.toString() === currentUserId);

      if (!currentMember) {
        throw new Error('Không tìm thấy cấu hình cuộc trò chuyện sau khi tạo');
      }

      return {
        conversation: conversationDoc,
        memberSettings: currentMember
      };
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  }

  /**
   * Tạo phòng chat 1-1 không dùng transaction (fallback cho development)
   */
  private async _ensurePrivateConversationWithoutTransaction(
    currentId: mongoose.Types.ObjectId,
    otherId: mongoose.Types.ObjectId,
    currentUserId: string
  ): Promise<CreatePrivateConversationResult> {
    // Lấy thông tin user kia để lưu tên
    const otherUser = await User.findById(otherId).select('displayName username').lean();
    const otherUserName = otherUser?.displayName || otherUser?.username || 'Người dùng';

    const conversation = await Conversation.create({
      type: 'PRIVATE',
      createdBy: currentId,
      memberCount: 2,
      otherUserId: otherId,
      otherUserName: otherUserName
    });

    const [currentMember, otherMember] = await Promise.all([
      ConversationMember.create({
        conversationId: conversation._id,
        userId: currentId,
        role: 'MEMBER'
      }),
      ConversationMember.create({
        conversationId: conversation._id,
        userId: otherId,
        role: 'MEMBER'
      })
    ]);

    return {
      conversation,
      memberSettings: currentMember
    };
  }

  /**
   * Tạo nhóm chat
   */
  async createGroupConversation(
    currentUserId: string,
    name: string,
    memberIds: string[]
  ): Promise<CreateGroupConversationResult> {
    if (!name || name.trim().length === 0) {
      throw new Error('Tên nhóm không được để trống');
    }

    const uniqueMemberIds = Array.from(new Set([currentUserId, ...memberIds]));
    const memberObjectIds = uniqueMemberIds.map((id) => new mongoose.Types.ObjectId(id));
    const creatorId = new mongoose.Types.ObjectId(currentUserId);

    // Thử dùng transaction trước (production với replica set)
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const conversation = await Conversation.create(
        [
          {
            type: 'GROUP',
            name: name.trim(),
            createdBy: creatorId,
            memberCount: memberObjectIds.length
          }
        ],
        { session }
      );

      const conversationDoc = conversation[0];

      const membersToCreate = memberObjectIds.map((uid) => ({
        conversationId: conversationDoc._id,
        userId: uid,
        role: uid.toString() === currentUserId ? 'ADMIN' : 'MEMBER'
      }));

      const members = await ConversationMember.create(membersToCreate, { session });

      await session.commitTransaction();
      session.endSession();

      return {
        conversation: conversationDoc,
        members
      };
    } catch (error: any) {
      await session.abortTransaction();
      session.endSession();

      // Fallback cho MongoDB standalone (không hỗ trợ transaction)
      if (error.code === 20 || error.codeName === 'IllegalOperation') {
        return await this._createGroupConversationWithoutTransaction(
          creatorId,
          currentUserId,
          name,
          memberObjectIds
        );
      }

      throw error;
    }
  }

  /**
   * Tạo nhóm chat không dùng transaction (fallback cho development / MongoDB standalone)
   */
  private async _createGroupConversationWithoutTransaction(
    creatorId: mongoose.Types.ObjectId,
    currentUserId: string,
    name: string,
    memberObjectIds: mongoose.Types.ObjectId[]
  ): Promise<CreateGroupConversationResult> {
    const conversation = await Conversation.create({
      type: 'GROUP',
      name: name.trim(),
      createdBy: creatorId,
      memberCount: memberObjectIds.length
    });

    const membersToCreate = memberObjectIds.map((uid) => ({
      conversationId: conversation._id,
      userId: uid,
      role: uid.toString() === currentUserId ? 'ADMIN' : 'MEMBER'
    }));

    const members = await ConversationMember.create(membersToCreate);

    return {
      conversation,
      members
    };
  }

  /**
   * Lấy danh sách tin nhắn trong phòng
   */
  async getMessages(
    conversationId: string,
    userId: string,
    page: number = 1,
    limit: number = 50,
    type?: string
  ): Promise<{
    messages: IMessage[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const convObjectId = new mongoose.Types.ObjectId(conversationId);
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const member = await ConversationMember.findOne({
      conversationId: convObjectId,
      userId: userObjectId
    });

    if (!member) {
      throw new Error('Bạn không ở trong phòng chat này');
    }

    const skip = (page - 1) * limit;

    const query: any = {
      conversationId: convObjectId,
      deletedForUsers: { $ne: userObjectId }
    };

    if (type) {
      query.type = type;
    }

    const [messages, total] = await Promise.all([
      Message.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      Message.countDocuments(query)
    ]);

    return {
      messages,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    };
  }

  /**
   * Lọc tin nhắn theo người gửi trong phòng
   */
  async getMessagesBySender(
    conversationId: string,
    userId: string,
    senderId: string,
    page: number = 1,
    limit: number = 50
  ): Promise<{
    messages: IMessage[];
    total: number;
    page: number;
    totalPages: number;
    senderId: string;
  }> {
    const convObjectId = new mongoose.Types.ObjectId(conversationId);
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const senderObjectId = new mongoose.Types.ObjectId(senderId);

    // Kiểm tra user hiện tại có trong phòng không
    const currentMember = await ConversationMember.findOne({
      conversationId: convObjectId,
      userId: userObjectId
    });

    if (!currentMember) {
      throw new Error('Bạn không ở trong phòng chat này');
    }

    // Kiểm tra senderId có trong phòng không
    const senderMember = await ConversationMember.findOne({
      conversationId: convObjectId,
      userId: senderObjectId
    });

    if (!senderMember) {
      throw new Error('Người gửi không ở trong phòng chat này');
    }

    const skip = (page - 1) * limit;

    const [messages, total] = await Promise.all([
      Message.find({
        conversationId: convObjectId,
        senderId: senderObjectId,
        deletedForUsers: { $ne: userObjectId }
      })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      Message.countDocuments({
        conversationId: convObjectId,
        senderId: senderObjectId,
        deletedForUsers: { $ne: userObjectId }
      })
    ]);

    return {
      messages,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      senderId
    };
  }

  /**
   * Gửi tin nhắn
   */
  async sendMessage(
    conversationId: string,
    userId: string,
    payload: SendMessagePayload
  ): Promise<IMessage> {
    const convObjectId = new mongoose.Types.ObjectId(conversationId);
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const conversation = await Conversation.findOne({
      _id: convObjectId,
      isDeleted: false
    });

    if (!conversation) {
      throw new Error('Phòng chat không tồn tại');
    }

    const member = await ConversationMember.findOne({
      conversationId: convObjectId,
      userId: userObjectId
    });

    if (!member) {
      throw new Error('Bạn không ở trong phòng chat này');
    }

    // Kiểm tra block user (global)
    // PRIVATE: chặn 2 chiều
    if (conversation.type === 'PRIVATE') {
      const otherMember = await ConversationMember.findOne({
        conversationId: convObjectId,
        userId: { $ne: userObjectId }
      }).lean();

      if (otherMember) {
        const otherUserId = otherMember.userId as any as mongoose.Types.ObjectId;

        const blocked = await Block.findOne({
          $or: [
            { blockerId: userObjectId, blockedId: otherUserId },
            { blockerId: otherUserId, blockedId: userObjectId }
          ]
        });

        if (blocked) {
          throw new Error('Không thể gửi tin nhắn vì một trong hai bên đã chặn nhau');
        }
      }
    }

    // Validate payload
    if (!payload.type) {
      throw new Error('Loại tin nhắn không hợp lệ');
    }

    if (payload.type === 'TEXT' && (!payload.text || payload.text.trim().length === 0)) {
      throw new Error('Nội dung tin nhắn không được để trống');
    }

    const mediaTypes: MessageType[] = ['IMAGE', 'VIDEO', 'AUDIO', 'FILE'];

    if (mediaTypes.includes(payload.type) && !payload.mediaUrl) {
      throw new Error('Tin nhắn media phải có mediaUrl');
    }

    // Nếu có replyToMessageId, đảm bảo message đó thuộc cùng conversation
    let replyToMessageId: mongoose.Types.ObjectId | null = null;
    if (payload.replyToMessageId) {
      try {
        const replyId = new mongoose.Types.ObjectId(payload.replyToMessageId);
        const repliedMessage = await Message.findOne({
          _id: replyId,
          conversationId: convObjectId
        }).lean();

        if (!repliedMessage) {
          throw new Error('Tin nhắn được trả lời không tồn tại trong phòng này');
        }

        replyToMessageId = replyId;
      } catch {
        throw new Error('replyToMessageId không hợp lệ');
      }
    }

    const message = await Message.create({
      conversationId: convObjectId,
      senderId: userObjectId,
      type: payload.type,
      content: {
        text: payload.text || null,
        mediaUrl: payload.mediaUrl || null,
        mimeType: payload.mimeType || null,
        fileName: payload.fileName || null,
        fileSize: typeof payload.fileSize === 'number' ? payload.fileSize : null,
        duration: typeof payload.duration === 'number' ? payload.duration : null
      },
      replyToMessageId
    });

    // Lấy tên người gửi trước để dùng trong lastMessage
    const senderUser = await User.findById(userId).select('displayName username').lean();
    const senderDisplayName = senderUser?.displayName || senderUser?.username || 'Người dùng';

    // Cập nhật lastMessage + unreadCount
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      let lastMessageText: string;
      switch (payload.type) {
        case 'TEXT':
          lastMessageText = payload.text || '';
          break;
        case 'IMAGE':
          lastMessageText = 'Đã gửi một hình ảnh';
          break;
        case 'VIDEO':
          lastMessageText = 'Đã gửi một video';
          break;
        case 'AUDIO':
          lastMessageText = 'Đã gửi một âm thanh';
          break;
        case 'FILE':
          lastMessageText = payload.fileName
            ? `Đã gửi tệp ${payload.fileName}`
            : 'Đã gửi một tệp';
          break;
        default:
          lastMessageText = 'Tin nhắn hệ thống';
      }

      await Conversation.updateOne(
        { _id: convObjectId },
        {
          $set: {
            lastMessage: {
              messageId: message._id,
              senderId: userObjectId,
              senderName: senderDisplayName,
              text: lastMessageText,
              createdAt: message.createdAt
            }
          }
        },
        { session }
      );

      const now = new Date();
      // Cập nhật updatedAt cho người gửi để đưa lên đầu danh sách
      await ConversationMember.updateOne(
        { conversationId: convObjectId, userId: userObjectId },
        { $set: { updatedAt: now } },
        { session }
      );

      // Tăng unreadCount và cập nhật updatedAt cho các member khác
      await ConversationMember.updateMany(
        {
          conversationId: convObjectId,
          userId: { $ne: userObjectId }
        },
        {
          $inc: { unreadCount: 1 },
          $set: { updatedAt: now }
        },
        { session }
      );

      await session.commitTransaction();
      session.endSession();
    } catch (error: any) {
      await session.abortTransaction();
      session.endSession();

      // Fallback cho môi trường MongoDB standalone (không hỗ trợ transaction)
      if (error && (error.code === 20 || error.codeName === 'IllegalOperation')) {
        let lastMessageText: string;
        switch (payload.type) {
          case 'TEXT':
            lastMessageText = payload.text || '';
            break;
          case 'IMAGE':
            lastMessageText = 'Đã gửi một hình ảnh';
            break;
          case 'VIDEO':
            lastMessageText = 'Đã gửi một video';
            break;
          case 'AUDIO':
            lastMessageText = 'Đã gửi một âm thanh';
            break;
          case 'FILE':
            lastMessageText = payload.fileName
              ? `Đã gửi tệp ${payload.fileName}`
              : 'Đã gửi một tệp';
            break;
          default:
            lastMessageText = 'Tin nhắn hệ thống';
        }

        // Thực hiện update mà không dùng transaction
        await Conversation.updateOne(
          { _id: convObjectId },
          {
            $set: {
              lastMessage: {
                messageId: message._id,
                senderId: userObjectId,
                senderName: senderDisplayName,
                text: lastMessageText,
                createdAt: message.createdAt
              }
            }
          }
        );

        const fallbackNow = new Date();
        await ConversationMember.updateOne(
          { conversationId: convObjectId, userId: userObjectId },
          { $set: { updatedAt: fallbackNow } }
        );

        await ConversationMember.updateMany(
          {
            conversationId: convObjectId,
            userId: { $ne: userObjectId }
          },
          {
            $inc: { unreadCount: 1 },
            $set: { updatedAt: fallbackNow }
          }
        );
      } else {
        throw error;
      }
    }

    // Emit realtime + tạo notification
    try {
      const { io } = await import('../../server');
      if (io) {
        const {
          emitNewMessage,
          emitConversationListUpdated
        } = await import('./message.socket');

        // Emit message:new cho tất cả clients đang join phòng
        emitNewMessage(io, conversationId, message.toObject(), {
          senderId: userId
        });

        // Lấy danh sách members để emit update list + tạo notification
        const members = await ConversationMember.find({
          conversationId: convObjectId
        }).lean();

        // Lấy thông tin sender để hiển thị title/body đẹp hơn
        const sender = await User.findById(userId).select('displayName username').lean();
        const senderName = sender?.displayName || sender?.username || 'Tin nhắn mới';

        for (const m of members) {
          const memberUserId = (m.userId as any).toString();
          if (memberUserId === userId) {
            continue;
          }

          // Emit cập nhật list phòng cho từng member
          emitConversationListUpdated(io, memberUserId);

          // Tạo notification "message" cho từng member
          // Theo checklist: DB là gốc, socket cho đang mở app, push cho app tắt
          const isMuted = (m as any).isMuted === true;

          const previewText =
            payload.type === 'TEXT'
              ? payload.text || ''
              : payload.type === 'IMAGE'
              ? 'Đã gửi một hình ảnh'
              : 'Tin nhắn hệ thống';

          await notificationsService.createNotification(
            memberUserId,
            'message',
            senderName,
            previewText,
            {
              conversationId: conversationId,
              messageId: message._id.toString(),
              senderId: userId
            },
            userId,
            !isMuted // Nếu phòng bị mute thì không gửi push (vẫn lưu DB + socket)
          );
        }
      }
    } catch (error) {
      // Không throw để không làm fail gửi tin nhắn nếu socket/notification lỗi
      console.error('Lỗi emit realtime / tạo notification cho message:', error);
    }

    return message;
  }

  /**
   * Thêm hoặc cập nhật reaction cho 1 tin nhắn
   * - Mỗi user chỉ có 1 reaction trên 1 message
   */
  async addOrUpdateReaction(
    conversationId: string,
    userId: string,
    messageId: string,
    reactionType: MessageReactionType
  ): Promise<IMessage> {
    const convObjectId = new mongoose.Types.ObjectId(conversationId);
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const messageObjectId = new mongoose.Types.ObjectId(messageId);

    // Kiểm tra user có trong phòng không
    const member = await ConversationMember.findOne({
      conversationId: convObjectId,
      userId: userObjectId
    });

    if (!member) {
      throw new Error('Bạn không ở trong phòng chat này');
    }

    const message = await Message.findOne({
      _id: messageObjectId,
      conversationId: convObjectId,
      isDeleted: false
    });

    if (!message) {
      throw new Error('Tin nhắn không tồn tại');
    }

    // Xóa reaction cũ (nếu có) của user này
    message.reactions = message.reactions.filter(
      (r) => r.userId.toString() !== userObjectId.toString()
    );

    // Thêm reaction mới
    message.reactions.push({
      userId: userObjectId,
      type: reactionType,
      createdAt: new Date()
    } as any);

    await message.save();

    // Emit realtime
    try {
      const { io } = await import('../../server');
      if (io) {
        // Dùng any để tránh vấn đề type khi dynamic import
        const socketModule: any = await import('./message.socket');
        socketModule.emitMessageReactionUpdated(io, conversationId, {
          conversationId,
          messageId: message._id.toString(),
          userId,
          type: reactionType,
          action: 'added',
          reactions: message.reactions,
          timestamp: new Date()
        });
      }
    } catch (error) {
      console.error('Lỗi emit realtime cho reaction:', error);
    }

    return message;
  }

  /**
   * Xóa reaction của user trên 1 tin nhắn
   */
  async removeReaction(
    conversationId: string,
    userId: string,
    messageId: string
  ): Promise<IMessage> {
    const convObjectId = new mongoose.Types.ObjectId(conversationId);
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const messageObjectId = new mongoose.Types.ObjectId(messageId);

    // Kiểm tra user có trong phòng không
    const member = await ConversationMember.findOne({
      conversationId: convObjectId,
      userId: userObjectId
    });

    if (!member) {
      throw new Error('Bạn không ở trong phòng chat này');
    }

    const message = await Message.findOne({
      _id: messageObjectId,
      conversationId: convObjectId,
      isDeleted: false
    });

    if (!message) {
      throw new Error('Tin nhắn không tồn tại');
    }

    const beforeCount = message.reactions.length;
    message.reactions = message.reactions.filter(
      (r) => r.userId.toString() !== userObjectId.toString()
    );

    // Nếu không có thay đổi thì trả về luôn
    if (beforeCount === message.reactions.length) {
      return message;
    }

    await message.save();

    // Emit realtime
    try {
      const { io } = await import('../../server');
      if (io) {
        // Dùng any để tránh vấn đề type khi dynamic import
        const socketModule: any = await import('./message.socket');
        socketModule.emitMessageReactionUpdated(io, conversationId, {
          conversationId,
          messageId: message._id.toString(),
          userId,
          type: null,
          action: 'removed',
          reactions: message.reactions,
          timestamp: new Date()
        });
      }
    } catch (error) {
      console.error('Lỗi emit realtime cho reaction:', error);
    }

    return message;
  }

  /**
   * Cập nhật cấu hình phòng cho từng user
   */
  async updateMemberSettings(
    conversationId: string,
    userId: string,
    updates: {
      nickname?: string;
      customBackground?: string;
      isMuted?: boolean;
      isPinned?: boolean;
      isConversationBlocked?: boolean;
    }
  ): Promise<IConversationMember> {
    const convObjectId = new mongoose.Types.ObjectId(conversationId);
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const allowedUpdates: any = {};

    if (typeof updates.nickname === 'string') {
      allowedUpdates.nickname = updates.nickname.trim();
    }

    if (typeof updates.customBackground === 'string') {
      allowedUpdates.customBackground = updates.customBackground.trim();
    }

    if (typeof updates.isMuted === 'boolean') {
      allowedUpdates.isMuted = updates.isMuted;
    }

    if (typeof updates.isPinned === 'boolean') {
      allowedUpdates.isPinned = updates.isPinned;
    }

    if (typeof updates.isConversationBlocked === 'boolean') {
      allowedUpdates.isConversationBlocked = updates.isConversationBlocked;
    }

    if (Object.keys(allowedUpdates).length === 0) {
      throw new Error('Không có dữ liệu nào để cập nhật');
    }

    const oldMember = await ConversationMember.findOne({
      conversationId: convObjectId,
      userId: userObjectId
    });

    if (!oldMember) throw new Error('Bạn không ở trong phòng chat này');

    // Xóa file ảnh nền cũ nếu người dùng cập nhật sang màu hoặc ảnh khác
    if (
      allowedUpdates.customBackground !== undefined &&
      oldMember.customBackground &&
      oldMember.customBackground !== allowedUpdates.customBackground &&
      oldMember.customBackground.startsWith('/uploads/')
    ) {
      try {
        const oldPath = path.join(process.cwd(), oldMember.customBackground);
        if (fs.existsSync(oldPath)) {
          fs.unlinkSync(oldPath);
        }
      } catch (err) {
        console.error('Lỗi khi xóa nền cũ:', err);
      }
    }

    const member = await ConversationMember.findOneAndUpdate(
      {
        conversationId: convObjectId,
        userId: userObjectId
      },
      {
        $set: allowedUpdates
      },
      {
        new: true
      }
    );

    if (!member) {
      throw new Error('Bạn không ở trong phòng chat này');
    }

    return member;
  }

  /**
   * Sửa nội dung tin nhắn
   */
  async editMessage(
    conversationId: string,
    userId: string,
    messageId: string,
    text: string
  ): Promise<IMessage> {
    const convObjectId = new mongoose.Types.ObjectId(conversationId);
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const messageObjectId = new mongoose.Types.ObjectId(messageId);

    const member = await ConversationMember.findOne({
      conversationId: convObjectId,
      userId: userObjectId
    });
    if (!member) throw new Error('Bạn không ở trong phòng chat này');

    const message = await Message.findOne({
      _id: messageObjectId,
      conversationId: convObjectId
    });
    if (!message) throw new Error('Tin nhắn không tồn tại');
    if (message.isDeleted) throw new Error('Không thể sửa tin nhắn đã xóa');
    if (message.senderId.toString() !== userId)
      throw new Error('Bạn không có quyền sửa tin nhắn này');

    message.content.text = text;
    message.isEdited = true;
    message.editedAt = new Date();
    await message.save();

    // Emit realtime
    try {
      const { io } = await import('../../server');
      if (io) {
        const { emitMessageEdited } = await import('./message.socket');
        emitMessageEdited(io, conversationId, {
          conversationId,
          messageId,
          content: message.content,
          isEdited: true,
          editedAt: message.editedAt,
          timestamp: new Date()
        });
      }
    } catch (error) {
      console.error('Lỗi emit editMessage:', error);
    }

    return message;
  }

  /**
   * Xóa tin nhắn (deleteForEveryone: true → xóa tất cả, false → chỉ ẩn với mình)
   */
  async deleteMessage(
    conversationId: string,
    userId: string,
    messageId: string,
    deleteForEveryone: boolean = false
  ): Promise<{ messageId: string; deletedForEveryone: boolean }> {
    const convObjectId = new mongoose.Types.ObjectId(conversationId);
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const messageObjectId = new mongoose.Types.ObjectId(messageId);

    const member = await ConversationMember.findOne({
      conversationId: convObjectId,
      userId: userObjectId
    });
    if (!member) throw new Error('Bạn không ở trong phòng chat này');

    const message = await Message.findOne({
      _id: messageObjectId,
      conversationId: convObjectId
    });
    if (!message) throw new Error('Tin nhắn không tồn tại');

    if (deleteForEveryone) {
      if (message.senderId.toString() !== userId) {
        throw new Error('Bạn không có quyền thu hồi tin nhắn này');
      }
      message.isDeleted = true;

      // Xóa file media vật lý khi thu hồi tin nhắn cho tất cả
      const mediaTypes: MessageType[] = ['IMAGE', 'VIDEO', 'AUDIO', 'FILE'];
      if (mediaTypes.includes(message.type as MessageType) && message.content?.mediaUrl) {
        deleteMediaFiles(message.content.mediaUrl);
      }
    } else {
      if (!message.deletedForUsers) {
        message.deletedForUsers = [];
      }
      const hasId = message.deletedForUsers.some((uid: any) => uid.toString() === userId);
      if (!hasId) {
        message.deletedForUsers.push(userObjectId as any);
      }

      // Kiểm tra nếu tất cả thành viên đã xóa tin nhắn này -> có thể xóa file vật lý
      try {
        const allMembers = await ConversationMember.find({ conversationId: convObjectId }).lean();
        const allMemberIds = allMembers.map(m => (m.userId as any).toString());
        const deletedForUserIds = message.deletedForUsers.map((id: any) => id.toString());
        const allDeleted = allMemberIds.every(mid => deletedForUserIds.includes(mid));
        
        if (allDeleted) {
          const mediaTypes: MessageType[] = ['IMAGE', 'VIDEO', 'AUDIO', 'FILE'];
          if (mediaTypes.includes(message.type as MessageType) && message.content?.mediaUrl) {
            deleteMediaFiles(message.content.mediaUrl);
          }
        }
      } catch(err) {
        console.error('Lỗi khi kiểm tra xóa file vật lý cho tin nhắn:', err);
      }
    }

    await message.save();

    // Emit realtime
    try {
      const { io } = await import('../../server');
      if (io) {
        const { emitMessageDeleted } = await import('./message.socket');
        emitMessageDeleted(io, conversationId, {
          conversationId,
          messageId,
          deletedForEveryone: deleteForEveryone,
          deletedBy: userId,
          timestamp: new Date()
        });
      }
    } catch (error) {
      console.error('Lỗi emit deleteMessage:', error);
    }

    return { messageId, deletedForEveryone: deleteForEveryone };
  }

  /**
   * Chuyển tiếp tin nhắn sang nhiều phòng
   */
  async forwardMessage(
    conversationId: string,
    userId: string,
    messageId: string,
    targetConversationIds: string[]
  ): Promise<{ forwarded: number }> {
    const convObjectId = new mongoose.Types.ObjectId(conversationId);
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const messageObjectId = new mongoose.Types.ObjectId(messageId);

    const member = await ConversationMember.findOne({
      conversationId: convObjectId,
      userId: userObjectId
    });
    if (!member) throw new Error('Bạn không ở trong phòng chat này');

    const original = await Message.findOne({
      _id: messageObjectId,
      conversationId: convObjectId,
      isDeleted: false
    });
    if (!original) throw new Error('Tin nhắn không tồn tại');

    let forwarded = 0;
    for (const targetId of targetConversationIds) {
      try {
        const targetConvObjectId = new mongoose.Types.ObjectId(targetId);
        const targetMember = await ConversationMember.findOne({
          conversationId: targetConvObjectId,
          userId: userObjectId
        });
        if (!targetMember) continue;

        const newMessage = await Message.create({
          conversationId: targetConvObjectId,
          senderId: userObjectId,
          type: original.type,
          content: {
            text: original.content.text,
            mediaUrl: original.content.mediaUrl,
            mimeType: original.content.mimeType,
            fileName: original.content.fileName,
            fileSize: original.content.fileSize,
            duration: original.content.duration
          },
          forward: {
            fromMessageId: messageObjectId,
            fromUserId: original.senderId,
            fromConversationId: convObjectId,
            fromAt: original.createdAt
          }
        });

        // Update lastMessage
        await Conversation.updateOne(
          { _id: targetConvObjectId },
          {
            $set: {
              lastMessage: {
                messageId: newMessage._id,
                senderId: userObjectId,
                text: original.type === 'TEXT' ? (original.content.text || 'Tin nhắn đã chuyển tiếp') : 'Đã chuyển tiếp một tin nhắn',
                createdAt: newMessage.createdAt
              }
            }
          }
        );

        await ConversationMember.updateMany(
          { conversationId: targetConvObjectId, userId: { $ne: userObjectId } },
          { $inc: { unreadCount: 1 } }
        );

        // Emit realtime
        try {
          const { io } = await import('../../server');
          if (io) {
            const { emitNewMessage, emitConversationListUpdated } = await import('./message.socket');
            emitNewMessage(io, targetId, newMessage.toObject(), { senderId: userId });
            const targetMembers = await ConversationMember.find({ conversationId: targetConvObjectId }).lean();
            for (const m of targetMembers) {
              if ((m.userId as any).toString() !== userId) {
                emitConversationListUpdated(io, (m.userId as any).toString());
              }
            }
          }
        } catch (e) {
          console.error('Lỗi emit forwardMessage:', e);
        }

        forwarded++;
      } catch (e) {
        console.error(`Lỗi forward đến conversation ${targetId}:`, e);
      }
    }

    return { forwarded };
  }

  /**
   * Ghim tin nhắn
   */
  async pinMessage(
    conversationId: string,
    userId: string,
    messageId: string
  ): Promise<IMessage> {
    const convObjectId = new mongoose.Types.ObjectId(conversationId);
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const messageObjectId = new mongoose.Types.ObjectId(messageId);

    const member = await ConversationMember.findOne({
      conversationId: convObjectId,
      userId: userObjectId
    });
    if (!member) throw new Error('Bạn không ở trong phòng chat này');

    const message = await Message.findOne({
      _id: messageObjectId,
      conversationId: convObjectId,
      isDeleted: false
    });
    if (!message) throw new Error('Tin nhắn không tồn tại');

    message.isPinned = true;
    message.pinnedBy = userObjectId;
    message.pinnedAt = new Date();
    await message.save();

    // Emit realtime
    try {
      const { io } = await import('../../server');
      if (io) {
        const { emitMessagePinned } = await import('./message.socket');
        emitMessagePinned(io, conversationId, {
          conversationId,
          messageId,
          pinnedBy: userId,
          pinnedAt: message.pinnedAt,
          action: 'pinned',
          timestamp: new Date()
        });
      }
    } catch (error) {
      console.error('Lỗi emit pinMessage:', error);
    }

    return message;
  }

  /**
   * Bỏ ghim tin nhắn
   */
  async unpinMessage(
    conversationId: string,
    userId: string,
    messageId: string
  ): Promise<{ messageId: string }> {
    const convObjectId = new mongoose.Types.ObjectId(conversationId);
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const messageObjectId = new mongoose.Types.ObjectId(messageId);

    const member = await ConversationMember.findOne({
      conversationId: convObjectId,
      userId: userObjectId
    });
    if (!member) throw new Error('Bạn không ở trong phòng chat này');

    const message = await Message.findOne({
      _id: messageObjectId,
      conversationId: convObjectId,
      isDeleted: false
    });
    if (!message) throw new Error('Tin nhắn không tồn tại');

    message.isPinned = false;
    message.pinnedBy = undefined;
    message.pinnedAt = null;
    await message.save();

    // Emit realtime
    try {
      const { io } = await import('../../server');
      if (io) {
        const { emitMessagePinned } = await import('./message.socket');
        emitMessagePinned(io, conversationId, {
          conversationId,
          messageId,
          pinnedBy: userId,
          pinnedAt: null,
          action: 'unpinned',
          timestamp: new Date()
        });
      }
    } catch (error) {
      console.error('Lỗi emit unpinMessage:', error);
    }

    return { messageId };
  }

  /**
   * Lấy danh sách tin nhắn đã ghim
   */
  async getPinnedMessages(
    conversationId: string,
    userId: string
  ): Promise<{ messages: IMessage[] }> {
    const convObjectId = new mongoose.Types.ObjectId(conversationId);
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const member = await ConversationMember.findOne({
      conversationId: convObjectId,
      userId: userObjectId
    });
    if (!member) throw new Error('Bạn không ở trong phòng chat này');

    const messages = await Message.find({
      conversationId: convObjectId,
      isPinned: true,
      isDeleted: false,
      deletedForUsers: { $ne: userObjectId }
    })
      .sort({ pinnedAt: -1 })
      .lean()
      .exec();

    return { messages };
  }

  /**
   * Đánh dấu tin nhắn đã xem
   */
  async markMessageSeen(
    conversationId: string,
    userId: string,
    messageId: string
  ): Promise<{ seenBy: string[] }> {
    const convObjectId = new mongoose.Types.ObjectId(conversationId);
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const messageObjectId = new mongoose.Types.ObjectId(messageId);

    const member = await ConversationMember.findOne({
      conversationId: convObjectId,
      userId: userObjectId
    });
    if (!member) throw new Error('Bạn không ở trong phòng chat này');

    const message = await Message.findOne({
      _id: messageObjectId,
      conversationId: convObjectId,
      isDeleted: false
    });
    if (!message) throw new Error('Tin nhắn không tồn tại');

    // Thêm vào seenBy nếu chưa có
    const alreadySeen = message.seenBy.some(
      (s) => s.userId.toString() === userId
    );

    if (!alreadySeen) {
      message.seenBy.push({ userId: userObjectId, seenAt: new Date() } as any);
      await message.save();
    }

    // Emit realtime
    try {
      const { io } = await import('../../server');
      if (io) {
        const { emitMessageSeen } = await import('./message.socket');
        emitMessageSeen(io, conversationId, {
          conversationId,
          messageId,
          userId,
          seenAt: new Date(),
          senderId: message.senderId.toString(),
          timestamp: new Date()
        });
      }
    } catch (error) {
      console.error('Lỗi emit markMessageSeen:', error);
    }

    return {
      seenBy: message.seenBy.map((s) => (s.userId as any).toString())
    };
  }

  /**
   * Tìm kiếm tin nhắn trong phòng
   */
  async searchMessages(
    conversationId: string,
    userId: string,
    query: string,
    page: number = 1,
    limit: number = 20
  ): Promise<{
    messages: IMessage[];
    total: number;
    page: number;
    totalPages: number;
    query: string;
  }> {
    const convObjectId = new mongoose.Types.ObjectId(conversationId);
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const member = await ConversationMember.findOne({
      conversationId: convObjectId,
      userId: userObjectId
    });
    if (!member) throw new Error('Bạn không ở trong phòng chat này');

    const skip = (page - 1) * limit;
    const searchRegex = new RegExp(query, 'i');

    const [messages, total] = await Promise.all([
      Message.find({
        conversationId: convObjectId,
        type: 'TEXT',
        isDeleted: false,
        deletedForUsers: { $ne: userObjectId },
        'content.text': searchRegex
      })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      Message.countDocuments({
        conversationId: convObjectId,
        type: 'TEXT',
        isDeleted: false,
        deletedForUsers: { $ne: userObjectId },
        'content.text': searchRegex
      })
    ]);

    return {
      messages,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      query
    };
  }

  /**
   * Lưu nháp tin nhắn (lưu vào ConversationMember)
   */
  async saveDraft(
    conversationId: string,
    userId: string,
    text: string
  ): Promise<{ draft: string }> {
    const convObjectId = new mongoose.Types.ObjectId(conversationId);
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const member = await ConversationMember.findOneAndUpdate(
      { conversationId: convObjectId, userId: userObjectId },
      { $set: { draft: text } },
      { new: true, timestamps: false }
    );

    if (!member) throw new Error('Bạn không ở trong phòng chat này');

    return { draft: text };
  }

  /**
   * Lấy nháp tin nhắn
   */
  async getDraft(
    conversationId: string,
    userId: string
  ): Promise<{ draft: string | null }> {
    const convObjectId = new mongoose.Types.ObjectId(conversationId);
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const member = await ConversationMember.findOne({
      conversationId: convObjectId,
      userId: userObjectId
    }).lean();

    if (!member) throw new Error('Bạn không ở trong phòng chat này');

    return { draft: (member as any).draft || null };
  }

  /**
   * Cập nhật theme emoji của phòng
   */
  async updateThemeEmoji(
    conversationId: string,
    userId: string,
    themeEmoji: string
  ): Promise<{ conversation: IConversation }> {
    const convObjectId = new mongoose.Types.ObjectId(conversationId);
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const member = await ConversationMember.findOne({
      conversationId: convObjectId,
      userId: userObjectId
    });
    if (!member) throw new Error('Bạn không ở trong phòng chat này');

    const conversation = await Conversation.findByIdAndUpdate(
      convObjectId,
      { $set: { themeEmoji } },
      { new: true }
    );

    if (!conversation) throw new Error('Phòng chat không tồn tại');

    // Emit realtime
    try {
      const { io } = await import('../../server');
      if (io) {
        const { emitThemeEmojiUpdated } = await import('./message.socket');
        emitThemeEmojiUpdated(io, conversationId, {
          conversationId,
          themeEmoji,
          updatedBy: userId,
          timestamp: new Date()
        });
      }
    } catch (error) {
      console.error('Lỗi emit updateThemeEmoji:', error);
    }

    return { conversation };
  }

  // ─────────────────────────────────────────────────────────
  // Group Management
  // ─────────────────────────────────────────────────────────

  /**
   * Lấy danh sách thành viên nhóm
   */
  async getGroupMembers(
    conversationId: string,
    userId: string
  ): Promise<{ members: any[] }> {
    const convObjectId = new mongoose.Types.ObjectId(conversationId);
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const member = await ConversationMember.findOne({
      conversationId: convObjectId,
      userId: userObjectId
    });
    if (!member) throw new Error('Bạn không ở trong phòng chat này');

    const members = await ConversationMember.find({
      conversationId: convObjectId,
      leftAt: null
    })
      .populate('userId', 'displayName username avatar')
      .lean();

    const formatted = members.map((m: any) => {
      const user = m.userId as any;
      return {
        memberId: m._id,
        userId: user._id || user,
        displayName: user.displayName || user.username || 'Người dùng',
        username: user.username,
        avatar: user.avatar,
        role: m.role,
        nickname: m.nickname,
        joinedAt: m.joinedAt
      };
    });

    return { members: formatted };
  }

  /**
   * Thêm thành viên vào nhóm
   */
  async addGroupMembers(
    conversationId: string,
    userId: string,
    memberIds: string[]
  ): Promise<{ added: number }> {
    const convObjectId = new mongoose.Types.ObjectId(conversationId);
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const member = await ConversationMember.findOne({
      conversationId: convObjectId,
      userId: userObjectId
    });
    if (!member) throw new Error('Bạn không ở trong phòng chat này');
    if (member.role !== 'ADMIN') throw new Error('Bạn không có quyền thêm thành viên');

    const conversation = await Conversation.findById(convObjectId);
    if (!conversation) throw new Error('Phòng chat không tồn tại');

    let added = 0;
    for (const newMemberId of memberIds) {
      try {
        const newMemberObjectId = new mongoose.Types.ObjectId(newMemberId);
        // Kiểm tra đã là thành viên chưa
        const exists = await ConversationMember.findOne({
          conversationId: convObjectId,
          userId: newMemberObjectId
        });
        if (exists) continue;

        await ConversationMember.create({
          conversationId: convObjectId,
          userId: newMemberObjectId,
          role: 'MEMBER'
        });

        added++;
      } catch (e) {
        continue;
      }
    }

    // Cập nhật memberCount
    await Conversation.updateOne(
      { _id: convObjectId },
      { $inc: { memberCount: added } }
    );

    // Emit cập nhật danh sách phòng cho các thành viên mới
    try {
      const { io } = await import('../../server');
      if (io) {
        const { emitConversationListUpdated } = await import('./message.socket');
        for (const newMemberId of memberIds) {
          emitConversationListUpdated(io, newMemberId);
        }
      }
    } catch (e) {
      console.error('Lỗi emit addGroupMembers:', e);
    }

    return { added };
  }

  /**
   * Xóa thành viên khỏi nhóm
   */
  async removeGroupMember(
    conversationId: string,
    userId: string,
    targetUserId: string
  ): Promise<{ success: boolean }> {
    const convObjectId = new mongoose.Types.ObjectId(conversationId);
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const targetObjectId = new mongoose.Types.ObjectId(targetUserId);

    const member = await ConversationMember.findOne({
      conversationId: convObjectId,
      userId: userObjectId
    });
    if (!member) throw new Error('Bạn không ở trong phòng chat này');
    if (member.role !== 'ADMIN') throw new Error('Bạn không có quyền xóa thành viên');

    await ConversationMember.deleteOne({
      conversationId: convObjectId,
      userId: targetObjectId
    });

    // Cập nhật memberCount
    await Conversation.updateOne({ _id: convObjectId }, { $inc: { memberCount: -1 } });

    return { success: true };
  }

  /**
   * Đổi tên nhóm
   */
  async renameGroup(
    conversationId: string,
    userId: string,
    name: string
  ): Promise<{ conversation: IConversation }> {
    const convObjectId = new mongoose.Types.ObjectId(conversationId);
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const member = await ConversationMember.findOne({
      conversationId: convObjectId,
      userId: userObjectId
    });
    if (!member) throw new Error('Bạn không ở trong phòng chat này');
    if (member.role !== 'ADMIN') throw new Error('Bạn không có quyền đổi tên nhóm');

    const conversation = await Conversation.findByIdAndUpdate(
      convObjectId,
      { $set: { name } },
      { new: true }
    );

    if (!conversation) throw new Error('Phòng chat không tồn tại');

    // Emit cập nhật cho tất cả thành viên
    try {
      const { io } = await import('../../server');
      if (io) {
        const { emitConversationListUpdated } = await import('./message.socket');
        const members = await ConversationMember.find({ conversationId: convObjectId }).lean();
        for (const m of members) {
          emitConversationListUpdated(io, (m.userId as any).toString());
        }
      }
    } catch (e) {
      console.error('Lỗi emit renameGroup:', e);
    }

    return { conversation };
  }

  /**
   * Đổi avatar nhóm
   */
  async updateGroupAvatar(
    conversationId: string,
    userId: string,
    avatarUrl: string
  ): Promise<{ conversation: IConversation }> {
    const convObjectId = new mongoose.Types.ObjectId(conversationId);
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const member = await ConversationMember.findOne({
      conversationId: convObjectId,
      userId: userObjectId
    });
    if (!member) throw new Error('Bạn không ở trong phòng chat này');

    const conversation = await Conversation.findById(convObjectId);

    if (!conversation) throw new Error('Phòng chat không tồn tại');

    // Xóa avatar cũ nếu có trên ổ đĩa
    if (conversation.avatar && conversation.avatar !== avatarUrl && conversation.avatar.startsWith('/uploads/')) {
      try {
        const oldAvatarPath = path.join(process.cwd(), conversation.avatar);
        if (fs.existsSync(oldAvatarPath)) {
          fs.unlinkSync(oldAvatarPath);
        }
      } catch (err) {
        console.error('Lỗi khi xóa avatar nhóm cũ:', err);
      }
    }

    conversation.avatar = avatarUrl;
    await conversation.save();

    return { conversation };
  }

  /**
   * Lấy shared media (ảnh, video, audio, file) trong phòng chat
   * Dùng cho MediaGallery screen
   */
  async getSharedMedia(
    conversationId: string,
    userId: string,
    type?: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FILE',
    page: number = 1,
    limit: number = 30
  ): Promise<{
    messages: IMessage[];
    total: number;
    page: number;
    totalPages: number;
    type?: string;
  }> {
    const convObjectId = new mongoose.Types.ObjectId(conversationId);
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const member = await ConversationMember.findOne({
      conversationId: convObjectId,
      userId: userObjectId
    });
    if (!member) throw new Error('Bạn không ở trong phòng chat này');

    const skip = (page - 1) * limit;

    const query: any = {
      conversationId: convObjectId,
      isDeleted: false,
      deletedForUsers: { $ne: userObjectId },
      'content.mediaUrl': { $ne: null }
    };

    if (type) {
      query.type = type;
    } else {
      // Lấy tất cả media types
      query.type = { $in: ['IMAGE', 'VIDEO', 'AUDIO', 'FILE'] };
    }

    const [messages, total] = await Promise.all([
      Message.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      Message.countDocuments(query)
    ]);

    return {
      messages,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      type
    };
  }

  /**
   * Xóa lịch sử cuộc trò chuyện phía user
   */
  async deleteConversationHistory(conversationId: string, userId: string): Promise<{ success: boolean }> {
    const convObjectId = new mongoose.Types.ObjectId(conversationId);
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const member = await ConversationMember.findOne({
      conversationId: convObjectId,
      userId: userObjectId
    });
    if (!member) throw new Error('Bạn không ở trong phòng chat này');

    // Thêm userId vào mảng deletedForUsers của tất cả tin nhắn
    await Message.updateMany(
      { conversationId: convObjectId },
      { $addToSet: { deletedForUsers: userObjectId } }
    );

    // Reset unreadCount
    await ConversationMember.updateOne(
      { _id: member._id },
      { $set: { unreadCount: 0 } },
      { timestamps: false }
    );

    // Kiểm tra nếu TẤT CẢ thành viên đã xóa lịch sử → xóa file media vật lý
    try {
      const allMembers = await ConversationMember.find({ conversationId: convObjectId }).lean();
      const allMemberIds = allMembers.map(m => (m.userId as any).toString());

      // Lấy tất cả tin nhắn có media trong cuộc trò chuyện
      const mediaMessages = await Message.find({
        conversationId: convObjectId,
        type: { $in: ['IMAGE', 'VIDEO', 'AUDIO', 'FILE'] },
        'content.mediaUrl': { $exists: true, $ne: null }
      }).lean();

      for (const msg of mediaMessages) {
        // Kiểm tra xem tất cả thành viên có trong deletedForUsers chưa
        const deletedForUserIds = ((msg as any).deletedForUsers || []).map((id: any) => id.toString());
        const allDeleted = allMemberIds.every(mid => deletedForUserIds.includes(mid));

        if (allDeleted) {
          deleteMediaFiles((msg as any).content?.mediaUrl);
        }
      }
    } catch (err) {
      console.error('[Media] Lỗi kiểm tra và xóa file khi xóa lịch sử:', err);
    }

    return { success: true };
  }

  /**
   * Thoát nhóm
   */
  async leaveGroup(
    conversationId: string,
    userId: string
  ): Promise<{ disbanded: boolean }> {
    const convObjectId = new mongoose.Types.ObjectId(conversationId);
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const member = await ConversationMember.findOne({
      conversationId: convObjectId,
      userId: userObjectId
    });
    if (!member) throw new Error('Bạn không ở trong phòng chat này');

    const remainingMembers = await ConversationMember.countDocuments({
      conversationId: convObjectId
    });

    // Nếu admin thoát và còn thành viên → chặn
    if (member.role === 'ADMIN' && remainingMembers > 1) {
      throw new Error('Admin không thể thoát nhóm khi còn thành viên khác');
    }

    await ConversationMember.deleteOne({ conversationId: convObjectId, userId: userObjectId });

    let disbanded = false;
    if (remainingMembers <= 1) {
      // Xóa nhóm nếu không còn ai
      await Conversation.updateOne({ _id: convObjectId }, { $set: { isDeleted: true } });
      disbanded = true;

      // Nhóm bị giải tán hoàn toàn, xóa toàn bộ file vật lý của nhóm này
      try {
        const mediaMessages = await Message.find({
          conversationId: convObjectId,
          type: { $in: ['IMAGE', 'VIDEO', 'AUDIO', 'FILE'] },
          'content.mediaUrl': { $exists: true, $ne: null }
        }).lean();
        
        for (const msg of mediaMessages) {
          deleteMediaFiles((msg as any).content?.mediaUrl);
        }
      } catch (err) {
        console.error('Lỗi khi xóa file vật lý lúc giải tán nhóm:', err);
      }
    } else {
      await Conversation.updateOne({ _id: convObjectId }, { $inc: { memberCount: -1 } });
    }

    return { disbanded };
  }
}

const messageService = new MessageService();
export default messageService;


