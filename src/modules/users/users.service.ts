import User, { IUser } from '../auth/auth.model';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';

export class UsersService {
  /**
   * Lấy thông tin user hiện tại (đầy đủ)
   */
  async getCurrentUser(userId: string): Promise<IUser> {
    const user = await User.findById(userId)
      .select('-password -emailVerifyToken -emailVerifyExpires -loginOtp -loginOtpExpires -resetPasswordOtp -resetPasswordOtpExpires -changePasswordOtp -changePasswordOtpExpires');

    if (!user) {
      throw new Error('Người dùng không tồn tại');
    }

    return user;
  }

  /**
   * Lấy thông tin user khác (có thể bị giới hạn bởi privacy settings)
   */
  async getUserById(currentUserId: string, targetUserId: string): Promise<Partial<IUser>> {
    if (currentUserId === targetUserId) {
      // Nếu là chính mình, trả về đầy đủ thông tin
      return await this.getCurrentUser(targetUserId);
    }

    const targetUser = await User.findById(targetUserId)
      .select('-password -emailVerifyToken -emailVerifyExpires -loginOtp -loginOtpExpires -resetPasswordOtp -resetPasswordOtpExpires -changePasswordOtp -changePasswordOtpExpires');

    if (!targetUser) {
      throw new Error('Người dùng không tồn tại');
    }

    // Kiểm tra privacy settings
    const result: any = {
      _id: targetUser._id,
      username: targetUser.username,
      displayName: targetUser.displayName,
      bio: targetUser.bio,
      isVerified: targetUser.isVerified,
      createdAt: targetUser.createdAt,
      currentLocation: targetUser.currentLocation,
      hometown: targetUser.hometown,
      dateOfBirth: targetUser.dateOfBirth,
      maritalStatus: targetUser.maritalStatus,
      gender: targetUser.gender,
      work: targetUser.work,
      education: targetUser.education
    };

    // Kiểm tra privacy cho avatar
    if (targetUser.privacy.profilePhoto === 'everyone' || 
        (targetUser.privacy.profilePhoto === 'contacts' && await this.areContacts(currentUserId, targetUserId))) {
      result.avatar = targetUser.avatar;
      result.coverPhoto = targetUser.coverPhoto;
    }

    // Kiểm tra privacy cho lastSeen
    if (targetUser.privacy.lastSeen === 'everyone' || 
        (targetUser.privacy.lastSeen === 'contacts' && await this.areContacts(currentUserId, targetUserId))) {
      result.lastSeenAt = targetUser.lastSeenAt;
      result.onlineStatus = targetUser.onlineStatus;
    }

    return result;
  }

  /**
   * Kiểm tra 2 user có phải là bạn bè không
   */
  private async areContacts(userId1: string, userId2: string): Promise<boolean> {
    try {
      // Dynamic import để tránh circular dependency
      const FriendModule = await import('../friends/models/friend.model');
      const Friend = FriendModule.default;
      const friend = await Friend.findOne({
        $or: [
          { userId: userId1, friendId: userId2, friendshipEndedAt: null },
          { userId: userId2, friendId: userId1, friendshipEndedAt: null }
        ]
      });
      return !!friend;
    } catch (error) {
      // Nếu module friends không tồn tại hoặc có lỗi, trả về false
      return false;
    }
  }

  /**
   * Kiểm tra user có bị block không
   */
  private async isBlocked(blockerId: string, blockedId: string): Promise<boolean> {
    try {
      const BlockModule = await import('../friends/models/block.model');
      const Block = BlockModule.default;
      const block = await Block.findOne({
        $or: [
          { blockerId, blockedId },
          { blockerId: blockedId, blockedId: blockerId }
        ]
      });
      return !!block;
    } catch (error) {
      return false;
    }
  }

  /**
   * Tìm kiếm người dùng (tối ưu hiệu suất)
   * Hỗ trợ tìm kiếm theo: ID, email (chính xác), hoặc họ tên/username (mờ)
   */
  async searchUsers(
    currentUserId: string,
    query: string,
    options: {
      limit?: number;
      page?: number;
      excludeSelf?: boolean;
      excludeBlocked?: boolean;
    } = {}
  ): Promise<{
    users: Partial<IUser>[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const limit = options.limit || 20;
    const page = options.page || 1;
    const skip = (page - 1) * limit;
    const excludeSelf = options.excludeSelf !== false; // Default true
    const excludeBlocked = options.excludeBlocked !== false; // Default true

    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return {
        users: [],
        total: 0,
        page,
        limit,
        totalPages: 0
      };
    }

    // Lấy danh sách blocked users trước (cache để dùng nhiều lần)
    let blockedUserIds: string[] = [];
    if (excludeBlocked) {
      try {
        const BlockModule = await import('../friends/models/block.model');
        const Block = BlockModule.default;
        const blocks = await Block.find({
          $or: [
            { blockerId: currentUserId },
            { blockedId: currentUserId }
          ]
        }).lean(); // Sử dụng lean() để tăng tốc
        
        blockedUserIds = [
          ...blocks.map(b => b.blockerId.toString()),
          ...blocks.map(b => b.blockedId.toString())
        ].filter(id => id !== currentUserId);
      } catch (error) {
        // Nếu module block không tồn tại, bỏ qua
      }
    }

    // Xây dựng query tối ưu
    const searchQuery: any = {
      isVerified: true // Chỉ tìm users đã verify email
    };

    // Kiểm tra nếu query là ObjectId hợp lệ → tìm chính xác theo ID
    if (mongoose.Types.ObjectId.isValid(trimmedQuery)) {
      searchQuery._id = trimmedQuery;
    }
    // Kiểm tra nếu query có dạng email → tìm chính xác theo email (nhanh hơn regex)
    else if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedQuery)) {
      searchQuery.email = trimmedQuery.toLowerCase(); // Email đã được lowercase trong schema
    }
    // Nếu không → tìm kiếm mờ theo displayName và username
    else {
      // Escape special regex characters để tránh lỗi
      const escapedQuery = trimmedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const lowercaseQuery = escapedQuery.toLowerCase();
      
      // Tạo regex objects
      // Username đã được lowercase trong schema, nên cần lowercase query
      // DisplayName có thể có chữ hoa, nên dùng case-insensitive
      const usernameRegex = new RegExp(lowercaseQuery, 'i');
      const displayNameRegex = new RegExp(escapedQuery, 'i');
      
      // Tối ưu: chỉ search trên username và displayName (email đã được xử lý ở trên)
      // MongoDB sẽ tự động bỏ qua null khi dùng regex
      searchQuery.$or = [
        { username: usernameRegex },
        { displayName: displayNameRegex }
      ];
    }

    // Loại trừ chính mình
    if (excludeSelf) {
      if (searchQuery._id) {
        // Nếu đang tìm theo ID và đó là chính mình, trả về empty
        if (searchQuery._id === currentUserId) {
          return {
            users: [],
            total: 0,
            page,
            limit,
            totalPages: 0
          };
        }
      } else {
        searchQuery._id = { $ne: currentUserId };
      }
    }

    // Loại trừ blocked users
    if (blockedUserIds.length > 0) {
      if (searchQuery._id) {
        // Nếu đang tìm theo ID và bị block, trả về empty
        if (blockedUserIds.includes(searchQuery._id)) {
          return {
            users: [],
            total: 0,
            page,
            limit,
            totalPages: 0
          };
        }
      } else {
        searchQuery._id = {
          ...(searchQuery._id || {}),
          $nin: blockedUserIds
        };
      }
    }

    // Tìm kiếm với lean() để tăng tốc (không cần Mongoose document overhead)
    const [users, total] = await Promise.all([
      User.find(searchQuery)
        .select('-password -emailVerifyToken -emailVerifyExpires -loginOtp -loginOtpExpires -resetPasswordOtp -resetPasswordOtpExpires -changePasswordOtp -changePasswordOtpExpires')
        .limit(limit)
        .skip(skip)
        .sort({ createdAt: -1 })
        .lean(), // Sử dụng lean() để tăng tốc
      User.countDocuments(searchQuery)
    ]);


    // Batch check contacts để tối ưu privacy checks
    const userIds = users.map(u => u._id.toString());
    const contactsMap = new Map<string, boolean>();
    
    if (userIds.length > 0) {
      try {
        const FriendModule = await import('../friends/models/friend.model');
        const Friend = FriendModule.default;
        const friends = await Friend.find({
          $or: [
            { userId: currentUserId, friendId: { $in: userIds }, friendshipEndedAt: null },
            { userId: { $in: userIds }, friendId: currentUserId, friendshipEndedAt: null }
          ]
        }).lean();
        
        friends.forEach(friend => {
          const otherUserId = friend.userId.toString() === currentUserId 
            ? friend.friendId.toString() 
            : friend.userId.toString();
          contactsMap.set(otherUserId, true);
        });
      } catch (error) {
        // Nếu module friends không tồn tại, bỏ qua
      }
    }

    // Format kết quả với privacy settings (không cần await trong map vì đã batch check)
    const formattedUsers = users.map((userObj: any) => {
      const userId = userObj._id.toString();
      const isContact = contactsMap.get(userId) || false;
      
      const result: any = {
        _id: userObj._id,
        username: userObj.username,
        displayName: userObj.displayName,
        bio: userObj.bio,
        isVerified: userObj.isVerified,
        createdAt: userObj.createdAt,
        currentLocation: userObj.currentLocation,
        hometown: userObj.hometown,
        dateOfBirth: userObj.dateOfBirth,
        maritalStatus: userObj.maritalStatus,
        gender: userObj.gender,
        work: userObj.work,
        education: userObj.education
      };

      // Kiểm tra privacy cho avatar và cover photo
      if (userObj.privacy?.profilePhoto === 'everyone' || 
          (userObj.privacy?.profilePhoto === 'contacts' && isContact)) {
        result.avatar = userObj.avatar;
        result.coverPhoto = userObj.coverPhoto;
      }

      // Kiểm tra privacy cho lastSeen
      if (userObj.privacy?.lastSeen === 'everyone' || 
          (userObj.privacy?.lastSeen === 'contacts' && isContact)) {
        result.lastSeenAt = userObj.lastSeenAt;
        result.onlineStatus = userObj.onlineStatus;
      }

      return result;
    });

    return {
      users: formattedUsers,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  /**
   * Cập nhật avatar
   */
  async updateAvatar(userId: string, avatarPath: string): Promise<IUser> {
    const user = await User.findById(userId);

    if (!user) {
      throw new Error('Người dùng không tồn tại');
    }

    // Xóa avatar cũ nếu có
    if (user.avatar) {
      const oldAvatarPath = path.join(process.cwd(), 'uploads', 'avatars', path.basename(user.avatar));
      if (fs.existsSync(oldAvatarPath)) {
        fs.unlinkSync(oldAvatarPath);
      }
    }

    // Cập nhật avatar mới (lưu relative path)
    const relativePath = `/uploads/avatars/${path.basename(avatarPath)}`;
    user.avatar = relativePath;
    await user.save();

    const userObj = user.toObject();
    delete (userObj as any).password;
    delete (userObj as any).emailVerifyToken;
    delete (userObj as any).emailVerifyExpires;
    delete (userObj as any).loginOtp;
    delete (userObj as any).loginOtpExpires;
    delete (userObj as any).resetPasswordOtp;
    delete (userObj as any).resetPasswordOtpExpires;
    delete (userObj as any).changePasswordOtp;
    delete (userObj as any).changePasswordOtpExpires;

    return userObj as IUser;
  }

  /**
   * Xóa avatar
   */
  async removeAvatar(userId: string): Promise<IUser> {
    const user = await User.findById(userId);

    if (!user) {
      throw new Error('Người dùng không tồn tại');
    }

    // Xóa file avatar nếu có
    if (user.avatar) {
      const oldAvatarPath = path.join(process.cwd(), 'uploads', 'avatars', path.basename(user.avatar));
      if (fs.existsSync(oldAvatarPath)) {
        fs.unlinkSync(oldAvatarPath);
      }
    }

    user.avatar = undefined;
    await user.save();

    const userObj = user.toObject();
    delete (userObj as any).password;
    delete (userObj as any).emailVerifyToken;
    delete (userObj as any).emailVerifyExpires;
    delete (userObj as any).loginOtp;
    delete (userObj as any).loginOtpExpires;
    delete (userObj as any).resetPasswordOtp;
    delete (userObj as any).resetPasswordOtpExpires;
    delete (userObj as any).changePasswordOtp;
    delete (userObj as any).changePasswordOtpExpires;

    return userObj as IUser;
  }

  /**
   * Cập nhật cover photo
   */
  async updateCover(userId: string, coverPath: string): Promise<IUser> {
    const user = await User.findById(userId);

    if (!user) {
      throw new Error('Người dùng không tồn tại');
    }

    // Xóa cover photo cũ nếu có
    if (user.coverPhoto) {
      const oldCoverPath = path.join(process.cwd(), 'uploads', 'covers', path.basename(user.coverPhoto));
      if (fs.existsSync(oldCoverPath)) {
        fs.unlinkSync(oldCoverPath);
      }
    }

    // Cập nhật cover photo mới (lưu relative path)
    const relativePath = `/uploads/covers/${path.basename(coverPath)}`;
    user.coverPhoto = relativePath;
    await user.save();

    const userObj = user.toObject();
    delete (userObj as any).password;
    delete (userObj as any).emailVerifyToken;
    delete (userObj as any).emailVerifyExpires;
    delete (userObj as any).loginOtp;
    delete (userObj as any).loginOtpExpires;
    delete (userObj as any).resetPasswordOtp;
    delete (userObj as any).resetPasswordOtpExpires;
    delete (userObj as any).changePasswordOtp;
    delete (userObj as any).changePasswordOtpExpires;

    return userObj as IUser;
  }

  /**
   * Xóa cover photo
   */
  async removeCover(userId: string): Promise<IUser> {
    const user = await User.findById(userId);

    if (!user) {
      throw new Error('Người dùng không tồn tại');
    }

    // Xóa file cover photo nếu có
    if (user.coverPhoto) {
      const oldCoverPath = path.join(process.cwd(), 'uploads', 'covers', path.basename(user.coverPhoto));
      if (fs.existsSync(oldCoverPath)) {
        fs.unlinkSync(oldCoverPath);
      }
    }

    user.coverPhoto = undefined;
    await user.save();

    const userObj = user.toObject();
    delete (userObj as any).password;
    delete (userObj as any).emailVerifyToken;
    delete (userObj as any).emailVerifyExpires;
    delete (userObj as any).loginOtp;
    delete (userObj as any).loginOtpExpires;
    delete (userObj as any).resetPasswordOtp;
    delete (userObj as any).resetPasswordOtpExpires;
    delete (userObj as any).changePasswordOtp;
    delete (userObj as any).changePasswordOtpExpires;

    return userObj as IUser;
  }

  /**
   * Cập nhật profile
   */
  async updateProfile(
    userId: string,
    updates: {
      displayName?: string;
      bio?: string;
      phone?: string;
      privacy?: {
        lastSeen?: 'everyone' | 'contacts' | 'nobody';
        profilePhoto?: 'everyone' | 'contacts' | 'nobody';
        calls?: 'everyone' | 'contacts' | 'nobody';
      };
      allowCalls?: boolean;
      allowMessagesFrom?: 'everyone' | 'contacts';
      currentLocation?: string;
      hometown?: string;
      dateOfBirth?: Date | string;
      maritalStatus?: 'single' | 'married' | 'divorced' | 'widowed' | 'in_relationship' | 'prefer_not_to_say' | null;
      gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say' | null;
      work?: {
        company?: string;
        position?: string;
      };
      education?: {
        school?: string;
        major?: string;
      };
    }
  ): Promise<IUser> {
    const user = await User.findById(userId);

    if (!user) {
      throw new Error('Người dùng không tồn tại');
    }

    // Cập nhật các field
    if (updates.displayName !== undefined) {
      user.displayName = updates.displayName || undefined;
    }
    if (updates.bio !== undefined) {
      user.bio = updates.bio || undefined;
    }
    if (updates.phone !== undefined) {
      user.phone = updates.phone || undefined;
    }
    if (updates.allowCalls !== undefined) {
      user.allowCalls = updates.allowCalls;
    }
    if (updates.allowMessagesFrom !== undefined) {
      user.allowMessagesFrom = updates.allowMessagesFrom;
    }
    if (updates.privacy) {
      if (updates.privacy.lastSeen !== undefined) {
        user.privacy.lastSeen = updates.privacy.lastSeen;
      }
      if (updates.privacy.profilePhoto !== undefined) {
        user.privacy.profilePhoto = updates.privacy.profilePhoto;
      }
      if (updates.privacy.calls !== undefined) {
        user.privacy.calls = updates.privacy.calls;
      }
    }
    if (updates.currentLocation !== undefined) {
      user.currentLocation = updates.currentLocation || undefined;
    }
    if (updates.hometown !== undefined) {
      user.hometown = updates.hometown || undefined;
    }
    if (updates.dateOfBirth !== undefined) {
      if (updates.dateOfBirth === null || updates.dateOfBirth === '') {
        user.dateOfBirth = undefined;
      } else {
        user.dateOfBirth = typeof updates.dateOfBirth === 'string' 
          ? new Date(updates.dateOfBirth) 
          : updates.dateOfBirth;
      }
    }
    if (updates.maritalStatus !== undefined) {
      // Convert null thành undefined (Mongoose sẽ bỏ qua undefined)
      // TypeScript đảm bảo updates.maritalStatus chỉ có thể là enum value hoặc undefined
      user.maritalStatus = updates.maritalStatus === null ? undefined : updates.maritalStatus;
    }
    if (updates.gender !== undefined) {
      // Convert null thành undefined (Mongoose sẽ bỏ qua undefined)
      // TypeScript đảm bảo updates.gender chỉ có thể là enum value hoặc undefined
      user.gender = updates.gender === null ? undefined : updates.gender;
    }
    if (updates.work !== undefined) {
      if (!user.work) {
        user.work = {};
      }
      if (updates.work.company !== undefined) {
        user.work.company = updates.work.company || undefined;
      }
      if (updates.work.position !== undefined) {
        user.work.position = updates.work.position || undefined;
      }
    }
    if (updates.education !== undefined) {
      if (!user.education) {
        user.education = {};
      }
      if (updates.education.school !== undefined) {
        user.education.school = updates.education.school || undefined;
      }
      if (updates.education.major !== undefined) {
        user.education.major = updates.education.major || undefined;
      }
    }

    await user.save();

    const userObj = user.toObject();
    delete (userObj as any).password;
    delete (userObj as any).emailVerifyToken;
    delete (userObj as any).emailVerifyExpires;
    delete (userObj as any).loginOtp;
    delete (userObj as any).loginOtpExpires;
    delete (userObj as any).resetPasswordOtp;
    delete (userObj as any).resetPasswordOtpExpires;
    delete (userObj as any).changePasswordOtp;
    delete (userObj as any).changePasswordOtpExpires;

    return userObj as IUser;
  }
}

export default new UsersService();

