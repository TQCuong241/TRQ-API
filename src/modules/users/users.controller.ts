import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth.middleware';
import usersService from './users.service';

export class UsersController {
  /**
   * Lấy thông tin user hiện tại
   * GET /api/v1/users/me
   */
  async getCurrentUser(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.userId) {
        return res.status(401).json({ message: 'Chưa xác thực' });
      }

      const user = await usersService.getCurrentUser(req.userId);

      res.status(200).json({
        success: true,
        data: user
      });
    } catch (error: any) {
      if (error.message === 'Người dùng không tồn tại') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      next(error);
    }
  }

  /**
   * Lấy thông tin user khác
   * GET /api/v1/users/:id
   */
  async getUserById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.userId) {
        return res.status(401).json({ message: 'Chưa xác thực' });
      }

      const { id } = req.params;

      const user = await usersService.getUserById(req.userId, id);

      res.status(200).json({
        success: true,
        data: user
      });
    } catch (error: any) {
      if (error.message === 'Người dùng không tồn tại') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      next(error);
    }
  }

  /**
   * Upload avatar
   * POST /api/v1/users/avatar
   */
  async updateAvatar(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.userId) {
        return res.status(401).json({ message: 'Chưa xác thực' });
      }

      // Xử lý lỗi từ multer
      if (req.file === undefined) {
        return res.status(400).json({
          success: false,
          message: 'Vui lòng chọn file ảnh'
        });
      }

      const user = await usersService.updateAvatar(req.userId, req.file.path);

      res.status(200).json({
        success: true,
        message: 'Cập nhật avatar thành công',
        data: user
      });
    } catch (error: any) {
      // Xử lý lỗi từ multer
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: 'File quá lớn (tối đa 5MB)'
        });
      }
      if (error.message && error.message.includes('Chỉ chấp nhận file ảnh')) {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }
      if (error.message === 'Người dùng không tồn tại') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      next(error);
    }
  }

  /**
   * Xóa avatar
   * DELETE /api/v1/users/avatar
   */
  async removeAvatar(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.userId) {
        return res.status(401).json({ message: 'Chưa xác thực' });
      }

      const user = await usersService.removeAvatar(req.userId);

      res.status(200).json({
        success: true,
        message: 'Xóa avatar thành công',
        data: user
      });
    } catch (error: any) {
      if (error.message === 'Người dùng không tồn tại') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      next(error);
    }
  }

  /**
   * Upload cover photo
   * POST /api/v1/users/cover
   */
  async updateCover(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.userId) {
        return res.status(401).json({ message: 'Chưa xác thực' });
      }

      // Xử lý lỗi từ multer
      if (req.file === undefined) {
        return res.status(400).json({
          success: false,
          message: 'Vui lòng chọn file ảnh'
        });
      }

      const user = await usersService.updateCover(req.userId, req.file.path);

      res.status(200).json({
        success: true,
        message: 'Cập nhật ảnh bìa thành công',
        data: user
      });
    } catch (error: any) {
      // Xử lý lỗi từ multer
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: 'File quá lớn (tối đa 5MB)'
        });
      }
      if (error.message && error.message.includes('Chỉ chấp nhận file ảnh')) {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }
      if (error.message === 'Người dùng không tồn tại') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      next(error);
    }
  }

  /**
   * Xóa cover photo
   * DELETE /api/v1/users/cover
   */
  async removeCover(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.userId) {
        return res.status(401).json({ message: 'Chưa xác thực' });
      }

      const user = await usersService.removeCover(req.userId);

      res.status(200).json({
        success: true,
        message: 'Xóa ảnh bìa thành công',
        data: user
      });
    } catch (error: any) {
      if (error.message === 'Người dùng không tồn tại') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      next(error);
    }
  }

  /**
   * Tìm kiếm người dùng
   * GET /api/v1/users/search
   */
  async searchUsers(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.userId) {
        return res.status(401).json({ message: 'Chưa xác thực' });
      }

      const { q, limit, page, excludeSelf, excludeBlocked } = req.query;


      // Validate query parameter
      if (!q || typeof q !== 'string' || q.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Vui lòng nhập từ khóa tìm kiếm (query parameter: q)'
        });
      }

      // Validate limit
      let limitNum = 20;
      if (limit) {
        limitNum = parseInt(limit as string, 10);
        if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
          return res.status(400).json({
            success: false,
            message: 'limit phải là số từ 1 đến 100'
          });
        }
      }

      // Validate page
      let pageNum = 1;
      if (page) {
        pageNum = parseInt(page as string, 10);
        if (isNaN(pageNum) || pageNum < 1) {
          return res.status(400).json({
            success: false,
            message: 'page phải là số lớn hơn 0'
          });
        }
      }

      // Validate excludeSelf
      let excludeSelfBool = true;
      if (excludeSelf !== undefined) {
        excludeSelfBool = excludeSelf === 'true' || excludeSelf === '1';
      }

      // Validate excludeBlocked
      let excludeBlockedBool = true;
      if (excludeBlocked !== undefined) {
        excludeBlockedBool = excludeBlocked === 'true' || excludeBlocked === '1';
      }

      const result = await usersService.searchUsers(req.userId, q.trim(), {
        limit: limitNum,
        page: pageNum,
        excludeSelf: excludeSelfBool,
        excludeBlocked: excludeBlockedBool
      });


      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Cập nhật profile
   * PUT /api/v1/users/profile
   */
  async updateProfile(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.userId) {
        return res.status(401).json({ message: 'Chưa xác thực' });
      }

      const { 
        displayName, 
        bio, 
        phone, 
        privacy, 
        allowCalls, 
        allowMessagesFrom,
        currentLocation,
        hometown,
        dateOfBirth,
        maritalStatus,
        gender,
        work,
        education
      } = req.body;

      // Validate privacy object nếu có
      if (privacy) {
        if (privacy.lastSeen && !['everyone', 'contacts', 'nobody'].includes(privacy.lastSeen)) {
          return res.status(400).json({
            success: false,
            message: 'privacy.lastSeen phải là: everyone, contacts, hoặc nobody'
          });
        }
        if (privacy.profilePhoto && !['everyone', 'contacts', 'nobody'].includes(privacy.profilePhoto)) {
          return res.status(400).json({
            success: false,
            message: 'privacy.profilePhoto phải là: everyone, contacts, hoặc nobody'
          });
        }
        if (privacy.calls && !['everyone', 'contacts', 'nobody'].includes(privacy.calls)) {
          return res.status(400).json({
            success: false,
            message: 'privacy.calls phải là: everyone, contacts, hoặc nobody'
          });
        }
      }

      // Validate allowMessagesFrom
      if (allowMessagesFrom && !['everyone', 'contacts'].includes(allowMessagesFrom)) {
        return res.status(400).json({
          success: false,
          message: 'allowMessagesFrom phải là: everyone hoặc contacts'
        });
      }

      // Validate bio length
      if (bio !== undefined && bio !== null && bio.length > 500) {
        return res.status(400).json({
          success: false,
          message: 'Bio không được quá 500 ký tự'
        });
      }

      // Validate currentLocation length
      if (currentLocation !== undefined && currentLocation !== null && currentLocation.length > 200) {
        return res.status(400).json({
          success: false,
          message: 'Nơi ở hiện tại không được quá 200 ký tự'
        });
      }

      // Validate hometown length
      if (hometown !== undefined && hometown !== null && hometown.length > 200) {
        return res.status(400).json({
          success: false,
          message: 'Quê quán không được quá 200 ký tự'
        });
      }

      // Validate dateOfBirth
      if (dateOfBirth !== undefined && dateOfBirth !== null && dateOfBirth !== '') {
        const date = new Date(dateOfBirth);
        if (isNaN(date.getTime())) {
          return res.status(400).json({
            success: false,
            message: 'Ngày sinh không hợp lệ'
          });
        }
        // Kiểm tra ngày sinh không được trong tương lai
        if (date > new Date()) {
          return res.status(400).json({
            success: false,
            message: 'Ngày sinh không được trong tương lai'
          });
        }
      }

      // Validate maritalStatus
      if (maritalStatus !== undefined && maritalStatus !== null && maritalStatus !== '') {
        const validStatuses = ['single', 'married', 'divorced', 'widowed', 'in_relationship', 'prefer_not_to_say'];
        if (!validStatuses.includes(maritalStatus)) {
          return res.status(400).json({
            success: false,
            message: 'Tình trạng hôn nhân không hợp lệ'
          });
        }
      }

      // Validate gender
      if (gender !== undefined && gender !== null && gender !== '') {
        const validGenders = ['male', 'female', 'other', 'prefer_not_to_say'];
        if (!validGenders.includes(gender)) {
          return res.status(400).json({
            success: false,
            message: 'Giới tính không hợp lệ'
          });
        }
      }

      // Validate work
      if (work !== undefined && work !== null) {
        if (typeof work !== 'object') {
          return res.status(400).json({
            success: false,
            message: 'work phải là một object'
          });
        }
        if (work.company !== undefined && work.company !== null && work.company.length > 200) {
          return res.status(400).json({
            success: false,
            message: 'Tên công ty không được quá 200 ký tự'
          });
        }
        if (work.position !== undefined && work.position !== null && work.position.length > 200) {
          return res.status(400).json({
            success: false,
            message: 'Chức vụ không được quá 200 ký tự'
          });
        }
      }

      // Validate education
      if (education !== undefined && education !== null) {
        if (typeof education !== 'object') {
          return res.status(400).json({
            success: false,
            message: 'education phải là một object'
          });
        }
        if (education.school !== undefined && education.school !== null && education.school.length > 200) {
          return res.status(400).json({
            success: false,
            message: 'Tên trường không được quá 200 ký tự'
          });
        }
        if (education.major !== undefined && education.major !== null && education.major.length > 200) {
          return res.status(400).json({
            success: false,
            message: 'Chuyên ngành không được quá 200 ký tự'
          });
        }
      }

      const user = await usersService.updateProfile(req.userId, {
        displayName,
        bio,
        phone,
        privacy,
        allowCalls,
        allowMessagesFrom,
        currentLocation,
        hometown,
        dateOfBirth,
        maritalStatus,
        gender,
        work,
        education
      });

      res.status(200).json({
        success: true,
        message: 'Cập nhật profile thành công',
        data: user
      });
    } catch (error: any) {
      if (error.message === 'Người dùng không tồn tại') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      next(error);
    }
  }
}

export default new UsersController();

