import { Response, NextFunction } from 'express';
import { AuthRequest } from '../auth/auth.controller';
import blockService from './block.service';

export class BlockController {
  /**
   * Chặn một user
   * POST /api/v1/friends/block
   */
  async blockUser(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.userId) {
        return res.status(401).json({ message: 'Chưa xác thực' });
      }

      const { blockedId } = req.body;

      if (!blockedId) {
        return res.status(400).json({
          success: false,
          message: 'Vui lòng cung cấp ID người dùng cần chặn'
        });
      }

      const block = await blockService.blockUser(req.userId, blockedId);

      res.status(201).json({
        success: true,
        message: 'Đã chặn người dùng',
        data: block
      });
    } catch (error: any) {
      if (error.message === 'Không thể chặn chính mình') {
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
      if (error.message === 'Đã chặn người dùng này') {
        return res.status(409).json({
          success: false,
          message: error.message
        });
      }
      next(error);
    }
  }

  /**
   * Bỏ chặn một user
   * DELETE /api/v1/friends/block/:blockedId
   */
  async unblockUser(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.userId) {
        return res.status(401).json({ message: 'Chưa xác thực' });
      }

      const { blockedId } = req.params;

      await blockService.unblockUser(req.userId, blockedId);

      res.status(200).json({
        success: true,
        message: 'Đã bỏ chặn người dùng'
      });
    } catch (error: any) {
      if (error.message === 'Chưa chặn người dùng này') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      next(error);
    }
  }

  /**
   * Lấy danh sách người bị chặn
   * GET /api/v1/friends/blocked
   */
  async getBlockedUsers(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.userId) {
        return res.status(401).json({ message: 'Chưa xác thực' });
      }

      const blockedUsers = await blockService.getBlockedUsers(req.userId);

      res.status(200).json({
        success: true,
        data: blockedUsers
      });
    } catch (error: any) {
      next(error);
    }
  }
}

export default new BlockController();

