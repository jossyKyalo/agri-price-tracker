import jwt from 'jsonwebtoken';
import { query } from '../database/connection.js';
import { ApiError } from '../utils/apiError.js';
import { logger } from '../utils/logger.js';
// Middleware to authenticate JWT token
export const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new ApiError('Access token is required', 401);
        }
        const token = authHeader.substring(7);
        if (!process.env.JWT_SECRET) {
            throw new ApiError('JWT secret not configured', 500);
        }
        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        // Get user from database
        const result = await query(`SELECT id, email, full_name, phone, role, region, organization, 
              is_active, email_verified, last_login, created_at, updated_at
       FROM users WHERE id = $1 AND is_active = true`, [decoded.userId]);
        if (result.rows.length === 0) {
            throw new ApiError('User not found or inactive', 401);
        }
        const user = result.rows[0];
        req.user = user;
        next();
    }
    catch (error) {
        if (error.name === 'JsonWebTokenError') {
            next(new ApiError('Invalid token', 401));
        }
        else if (error.name === 'TokenExpiredError') {
            next(new ApiError('Token expired', 401));
        }
        else {
            next(error);
        }
    }
};
// Middleware to authorize specific roles
export const authorize = (...roles) => {
    return (req, res, next) => {
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
// Middleware for admin-only routes
export const requireAdmin = authorize('admin', 'super_admin');
// Middleware for super admin-only routes
export const requireSuperAdmin = authorize('super_admin');
// Optional authentication 
export const optionalAuth = async (req, res, next) => {
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
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const result = await query(`SELECT id, email, full_name, phone, role, region, organization, 
              is_active, email_verified, last_login, created_at, updated_at
       FROM users WHERE id = $1 AND is_active = true`, [decoded.userId]);
        if (result.rows.length > 0) {
            req.user = result.rows[0];
        }
        next();
    }
    catch (error) {
        logger.debug('Optional auth failed:', error);
        next();
    }
};
// Generate JWT token  
export const generateToken = (user) => {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        throw new ApiError('JWT secret not configured', 500);
    }
    const payload = {
        userId: user.id,
        email: user.email,
        role: user.role
    };
    const options = {
        expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    };
    return jwt.sign(payload, secret, options);
};
// Generate refresh token  
export const generateRefreshToken = (user) => {
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
    const options = {
        expiresIn: expiresIn
    };
    return jwt.sign(payload, secret, options);
};
// Verify refresh token
export const verifyRefreshToken = (token) => {
    const secret = process.env.JWT_REFRESH_SECRET;
    if (!secret) {
        throw new ApiError('JWT refresh secret not configured', 500);
    }
    return jwt.verify(token, secret);
};
//# sourceMappingURL=auth.js.map