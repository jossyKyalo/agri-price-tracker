import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../database/connection';
import { ApiError } from '../utils/apiError';
import { logger } from '../utils/logger';
import type { User } from '../types/index';
 
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
  iat: number;
  exp: number;
}
 
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new ApiError('Access token is required', 401);
    }

    const token = authHeader.substring(7); 
    
    if (!process.env.JWT_SECRET) {
      throw new ApiError('JWT secret not configured', 500);
    }

    
    const decoded = jwt.verify(token, process.env.JWT_SECRET) as JwtPayload;
    
    
    const result = await query(
      `SELECT id, email, full_name, phone, role, region, organization, 
              is_active, email_verified, last_login, created_at, updated_at
       FROM users WHERE id = $1 AND is_active = true`,
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      throw new ApiError('User not found or inactive', 401);
    }

    const user = result.rows[0] as User;
    req.user = user;
    
    next();
  } catch (error: any) {
    if (error.name === 'JsonWebTokenError') {
      next(new ApiError('Invalid token', 401));
    } else if (error.name === 'TokenExpiredError') {
      next(new ApiError('Token expired', 401));
    } else {
      next(error);
    }
  }
};
 
export const authorize = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new ApiError('Authentication required', 401));
      return;
    }

    if (!roles.includes(req.user.role)) {
      next(new ApiError('Insufficient permissions', 403));
      return;
    }

    next();
  };
};
 
export const requireAdmin = authorize('admin', 'super_admin');
 
export const requireSuperAdmin = authorize('super_admin');

 
export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      next();
      return;
    }

    const token = authHeader.substring(7);
    
    if (!process.env.JWT_SECRET) {
      next();
      return;
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET) as JwtPayload;
    
    const result = await query(
      `SELECT id, email, full_name, phone, role, region, organization, 
              is_active, email_verified, last_login, created_at, updated_at
       FROM users WHERE id = $1 AND is_active = true`,
      [decoded.userId]
    );

    if (result.rows.length > 0) {
      req.user = result.rows[0] as User;
    }
    
    next();
  } catch (error) {
    logger.debug('Optional auth failed:', error);
    next();
  }
};

 
export const generateToken = (user: User): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new ApiError('JWT secret not configured', 500);
  }

  const payload = {
    userId: user.id,
    email: user.email,
    role: user.role
  };

  const options: jwt.SignOptions = {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  };

  return jwt.sign(payload, secret, options);
};
   
export const generateRefreshToken = (user: User): string => {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) {
    throw new ApiError('JWT refresh secret not configured', 500);
  }

  const payload = {
    userId: user.id,
    email: user.email,
    role: user.role
  };

  const expiresIn = process.env.JWT_REFRESH_EXPIRES_IN || '30d';
  const options: jwt.SignOptions = {
    expiresIn: expiresIn as string
  };

  return jwt.sign(payload, secret, options);
};
 
export const verifyRefreshToken = (token: string): JwtPayload => {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) {
    throw new ApiError('JWT refresh secret not configured', 500);
  }

  return jwt.verify(token, secret) as JwtPayload;
};