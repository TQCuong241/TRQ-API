import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../config/jwt';

export interface AuthRequest extends Request {
  userId?: string;
  token?: string;
  file?: Express.Multer.File;
}

export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ message: 'Chưa cung cấp token' });
    }

    const decoded = verifyToken(token);

    if (!decoded) {
      return res.status(401).json({ message: 'Token không hợp lệ hoặc đã hết hạn' });
    }

    req.userId = (decoded as any).userId;
    req.token = token;

    next();
  } catch (error: any) {
    res.status(401).json({ message: 'Xác thực thất bại' });
  }
};

export const optionalAuthMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (token) {
      const decoded = verifyToken(token);
      if (decoded) {
        req.userId = (decoded as any).userId;
        req.token = token;
      }
    }

    next();
  } catch (error: any) {
    next();
  }
};
