import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { query, transaction } from '../database/connection';
import { ApiError } from '../utils/apiError';
import { generateToken, generateRefreshToken } from '../middleware/auth';
import { logger } from '../utils/logger';
import { sendEmail } from '../services/emailService';
import type { User, CreateUserRequest, LoginRequest, AuthResponse, ApiResponse } from '../types/index';

export const register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, password, full_name, phone, region, organization }: CreateUserRequest = req.body;

    // Check if user already exists
    const existingUser = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      throw new ApiError('User already exists with this email', 409);
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    const result = await query(
      `INSERT INTO users (email, password_hash, full_name, phone, region, organization) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING id, email, full_name, phone, role, region, organization, is_active, email_verified, created_at`,
      [email, passwordHash, full_name, phone, region, organization]
    );

    const user = result.rows[0] as User;

    // Generate tokens
    const token = generateToken(user);
    const refreshToken = generateRefreshToken(user);

    logger.info(`New user registered: ${email}`);

    const response: ApiResponse<AuthResponse> = {
      success: true,
      message: 'User registered successfully',
      data: {
        user,
        token,
        refreshToken
      }
    };

    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
};

export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, password }: LoginRequest = req.body;

    // Get user with password
    const result = await query(
      `SELECT id, email, password_hash, full_name, phone, role, region, organization, 
              is_active, email_verified, last_login, created_at, updated_at
       FROM users WHERE email = $1`,
      [email]
    );

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

    const response: ApiResponse<AuthResponse> = {
      success: true,
      message: 'Login successful',
      data: {
        user: userWithoutPassword,
        token,
        refreshToken
      }
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};

export const refreshToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw new ApiError('Refresh token is required', 400);
    }

    // Verify refresh token  
    const response: ApiResponse = {
      success: true,
      message: 'Token refreshed successfully'
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};

export const getProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const response: ApiResponse<User> = {
      success: true,
      message: 'Profile retrieved successfully',
      data: req.user!
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};

export const updateProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { full_name, phone, region, organization } = req.body;
    const userId = req.user!.id;

    const result = await query(
      `UPDATE users 
       SET full_name = COALESCE($1, full_name),
           phone = COALESCE($2, phone),
           region = COALESCE($3, region),
           organization = COALESCE($4, organization),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING id, email, full_name, phone, role, region, organization, is_active, email_verified, created_at, updated_at`,
      [full_name, phone, region, organization, userId]
    );

    const response: ApiResponse<User> = {
      success: true,
      message: 'Profile updated successfully',
      data: result.rows[0]
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};

export const changePassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { current_password, new_password } = req.body;
    const userId = req.user!.id;

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
    await query(
      'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newPasswordHash, userId]
    );

    const response: ApiResponse = {
      success: true,
      message: 'Password changed successfully'
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};

export const forgotPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email } = req.body;

    if (!email) {
      throw new ApiError('Email is required', 400);
    }

    const userResult = await query('SELECT id, full_name FROM users WHERE email = $1', [email]);
    const user = userResult.rows[0];

    // Generic response for security
    const genericResponse: ApiResponse = {
      success: true,
      message: 'If an account with that email exists, a password reset link has been sent.',
    };

    if (!user) {
      logger.warn(`Password reset requested for non-existent email: ${email}`);
      // Return the generic success response even if the user wasn't found
      res.json(genericResponse);
      return;
    }

    await transaction(async (client) => {
      // Generate unique token
      const resetToken = crypto.randomBytes(32).toString('hex');
      // Token expires in 1 hour
      const tokenExpiration = new Date(Date.now() + 60 * 60 * 1000);

      await client.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [user.id]);
      await client.query(
        `INSERT INTO password_reset_tokens (user_id, token, expires_at) 
                 VALUES ($1, $2, $3)`,
        [user.id, resetToken, tokenExpiration]
      );

       
      const resetUrl = `${process.env.CORS_ORIGIN}/reset-password?token=${resetToken}&email=${email}`;

      const emailContent = {
        to: email,
        subject: '🔑 Password Reset Request for AgriPrice System',
        text: `Dear ${user.full_name},\n\nYou requested a password reset. Please click the following link to reset your password: ${resetUrl}\n\nThis link will expire in one hour. If you did not request this, please ignore this email.`,
        html: `<p>Dear ${user.full_name},</p>
                       <p>You requested a password reset. Click the link below to set a new password:</p>
                       <p><a href="${resetUrl}"><strong>Reset My Password</strong></a></p>
                       <p>This link will expire in one hour.</p>
                       <p>If you did not request this, please ignore this email.</p>`,
      };

      await sendEmail(emailContent);

      logger.info(`Password reset email sent for user: ${email}`);
    });
    res.json(genericResponse);

  } catch (error) { 
    logger.error('Error during forgot password process:', error);

    const securityMaskedResponse: ApiResponse = {
      success: true,
      message: 'If an account with that email exists, a password reset link has been sent.',
    };
    res.json(securityMaskedResponse);
  }
};


export const resetPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try { 
    const { token, email, new_password } = req.body;

    if (!token || !email || !new_password) {
      throw new ApiError('Token, email, and new password are required', 400);
    }
 
    const tokenResult = await query(
      `SELECT t.user_id, t.expires_at 
             FROM password_reset_tokens t
             JOIN users u ON t.user_id = u.id
             WHERE t.token = $1 AND u.email = $2`,
      [token, email]
    );

    if (tokenResult.rows.length === 0) { 
      throw new ApiError('Invalid or already used password reset token', 400);
    }

    const resetTokenRecord = tokenResult.rows[0];
    const userId = resetTokenRecord.user_id;
 
    if (new Date(resetTokenRecord.expires_at).getTime() < Date.now()) { 
      await query('DELETE FROM password_reset_tokens WHERE user_id = $1', [userId]);
      throw new ApiError('Password reset token has expired', 400);
    }
 
    const newPasswordHash = await bcrypt.hash(new_password, 12);
 
    await transaction(async (client) => { 
      await client.query(
        'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [newPasswordHash, userId]
      );
 
      await client.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [userId]);
    });

    logger.info(`Password successfully reset for user ID: ${userId}`);

    const response: ApiResponse = {
      success: true,
      message: 'Password has been successfully reset. You can now log in.',
    };

    res.json(response);

  } catch (error) {
    next(error);
  }
};