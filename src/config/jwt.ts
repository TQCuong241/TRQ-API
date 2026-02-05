import jwt, { SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';

const JWT_SECRET: string = process.env.JWT_SECRET || 'your_jwt_secret_key';
const JWT_EXPIRE: string = process.env.JWT_EXPIRE || '15m';
const REFRESH_TOKEN_EXPIRE: string = process.env.REFRESH_TOKEN_EXPIRE || '30d';

export const generateToken = (userId: string): string => {
  return jwt.sign({ userId, type: 'access' }, JWT_SECRET, { expiresIn: JWT_EXPIRE as any });
};

export const generateRefreshToken = (): string => {
  return crypto.randomBytes(64).toString('hex');
};

export const verifyToken = (token: string) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
};

export const decodeToken = (token: string) => {
  return jwt.decode(token);
};
