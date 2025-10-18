import bcrypt from 'bcryptjs';
import { query } from '../database/connection.js';
import { ApiError } from '../utils/apiError.js';
import { generateToken, generateRefreshToken } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';
export const register = async (req, res, next) => {
    try {
        const { email, password, full_name, phone, region, organization } = req.body;
        // Check if user already exists
        const existingUser = await query('SELECT id FROM users WHERE email = $1', [email]);
        if (existingUser.rows.length > 0) {
            throw new ApiError('User already exists with this email', 409);
        }
        // Hash password
        const passwordHash = await bcrypt.hash(password, 12);
        // Create user
        const result = await query(`INSERT INTO users (email, password_hash, full_name, phone, region, organization) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING id, email, full_name, phone, role, region, organization, is_active, email_verified, created_at`, [email, passwordHash, full_name, phone, region, organization]);
        const user = result.rows[0];
        // Generate tokens
        const token = generateToken(user);
        const refreshToken = generateRefreshToken(user);
        logger.info(`New user registered: ${email}`);
        const response = {
            success: true,
            message: 'User registered successfully',
            data: {
                user,
                token,
                refreshToken
            }
        };
        res.status(201).json(response);
    }
    catch (error) {
        next(error);
    }
};
export const login = async (req, res, next) => {
    try {
        const { email, password } = req.body;
        // Get user with password
        const result = await query(`SELECT id, email, password_hash, full_name, phone, role, region, organization, 
              is_active, email_verified, last_login, created_at, updated_at
       FROM users WHERE email = $1`, [email]);
        if (result.rows.length === 0) {
            throw new ApiError('Invalid credentials', 401);
        }
        const user = result.rows[0];
        // Check if user is active
        if (!user.is_active) {
            throw new ApiError('Account is deactivated', 401);
        }
        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        if (!isValidPassword) {
            throw new ApiError('Invalid credentials', 401);
        }
        // Update last login
        await query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);
        // Remove password from user object
        const { password_hash, ...userWithoutPassword } = user;
        // Generate tokens
        const token = generateToken(userWithoutPassword);
        const refreshToken = generateRefreshToken(userWithoutPassword);
        logger.info(`User logged in: ${email}`);
        const response = {
            success: true,
            message: 'Login successful',
            data: {
                user: userWithoutPassword,
                token,
                refreshToken
            }
        };
        res.json(response);
    }
    catch (error) {
        next(error);
    }
};
export const refreshToken = async (req, res, next) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) {
            throw new ApiError('Refresh token is required', 400);
        }
        // Verify refresh token  
        const response = {
            success: true,
            message: 'Token refreshed successfully'
        };
        res.json(response);
    }
    catch (error) {
        next(error);
    }
};
export const getProfile = async (req, res, next) => {
    try {
        const response = {
            success: true,
            message: 'Profile retrieved successfully',
            data: req.user
        };
        res.json(response);
    }
    catch (error) {
        next(error);
    }
};
export const updateProfile = async (req, res, next) => {
    try {
        const { full_name, phone, region, organization } = req.body;
        const userId = req.user.id;
        const result = await query(`UPDATE users 
       SET full_name = COALESCE($1, full_name),
           phone = COALESCE($2, phone),
           region = COALESCE($3, region),
           organization = COALESCE($4, organization),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING id, email, full_name, phone, role, region, organization, is_active, email_verified, created_at, updated_at`, [full_name, phone, region, organization, userId]);
        const response = {
            success: true,
            message: 'Profile updated successfully',
            data: result.rows[0]
        };
        res.json(response);
    }
    catch (error) {
        next(error);
    }
};
export const changePassword = async (req, res, next) => {
    try {
        const { current_password, new_password } = req.body;
        const userId = req.user.id;
        // Get current password hash
        const result = await query('SELECT password_hash FROM users WHERE id = $1', [userId]);
        const user = result.rows[0];
        // Verify current password
        const isValidPassword = await bcrypt.compare(current_password, user.password_hash);
        if (!isValidPassword) {
            throw new ApiError('Current password is incorrect', 400);
        }
        // Hash new password
        const newPasswordHash = await bcrypt.hash(new_password, 12);
        // Update password
        await query('UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [newPasswordHash, userId]);
        const response = {
            success: true,
            message: 'Password changed successfully'
        };
        res.json(response);
    }
    catch (error) {
        next(error);
    }
};
//# sourceMappingURL=authController.js.map