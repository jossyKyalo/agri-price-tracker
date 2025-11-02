import { Router } from 'express';
import * as bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { validate, schemas } from '../middleware/validation';
import { authRateLimiter } from '../middleware/rateLimiter';
import { authenticate } from '../middleware/auth';
import {register,login,forgotPassword,resetPassword,refreshToken,getProfile,updateProfile,changePassword} from '../controllers/authController.js';
import { logger } from '../utils/logger';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL  
});

const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not defined in environment variables');
  }
  return secret;
};

const router = Router();

// Public farmer registration  
router.post('/register/farmer', async (req, res) => {
  try {
    const { full_name, phone, region } = req.body;

    // Validation
    if (!full_name || !phone) {
      return res.status(400).json({
        success: false,
        error: 'Name and phone number are required'
      });
    }

    // Validate phone format 
    const phoneRegex = /^\+?[\d\s-()]+$/;
    if (!phoneRegex.test(phone)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid phone number format'
      });
    }

    // Check if phone already exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE phone = $1',
      [phone]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'Phone number already registered. Please login instead.'
      });
    }

    // Create unique email from phone  
    const cleanPhone = phone.replace(/[^\d]/g, ''); // Remove all non-digits
    const email = `farmer${cleanPhone}@agriprice.local`;
    
    // Check if email exists  
    const existingEmail = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existingEmail.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'An account with this phone number already exists'
      });
    }

    // Generate temporary password
    const tempPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8);
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    // Insert user -  
    const result = await pool.query(
      `INSERT INTO users (
        email, 
        password_hash, 
        full_name, 
        phone, 
        role, 
        region, 
        organization, 
        is_active, 
        email_verified
      ) VALUES ($1, $2, $3, $4, 'farmer', $5, $6, true, false)
      RETURNING id, email, full_name, phone, role, region, organization, created_at`,
      [
        email, 
        hashedPassword, 
        full_name, 
        phone, 
        region || null, 
        'Self-Registered Farmer' // default organization
      ]
    );

    const user = result.rows[0];

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user.id, 
        role: user.role,
        email: user.email 
      },
      getJwtSecret(),
      { expiresIn: '30d' }
    );

    logger.info('Farmer registered successfully', {
      userId: user.id,
      phone: user.phone,
      fullName: user.full_name
    });

    return res.status(201).json({
      success: true,
      message: 'Registration successful! You can now submit prices.',
      data: {
        user: {
          id: user.id,
          full_name: user.full_name,
          phone: user.phone,
          role: user.role,
          region: user.region
        },
        token,
        tempPassword, // Send this so user can login later
        note: 'Please save your password for future logins'
      }
    });
  } catch (error: any) {
    logger.error('Error registering farmer:', error);
    
    // Handle specific database errors
    if (error.code === '23505') { // PostgreSQL unique violation
      return res.status(409).json({
        success: false,
        error: 'This phone number or email is already registered'
      });
    }
    
    return res.status(500).json({
      success: false,
      error: 'Registration failed. Please try again.'
    });
  }
});

// Login route for registered farmers
router.post('/login/farmer', async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({
        success: false,
        error: 'Phone number and password are required'
      });
    }

    // Find user by phone
    const result = await pool.query(
      `SELECT id, email, password_hash, full_name, phone, role, region, 
              is_active, email_verified
       FROM users 
       WHERE phone = $1`,
      [phone]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Invalid phone number or password'
      });
    }

    const user = result.rows[0];

    // Check if user is active
    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        error: 'Account is inactive. Please contact support.'
      });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      logger.warn('Invalid login attempt', { phone });
      return res.status(401).json({
        success: false,
        error: 'Invalid phone number or password'
      });
    }

    // Update last login
    await pool.query(
      'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
      [user.id]
    );

    // Generate token
    const token = jwt.sign(
      { 
        userId: user.id, 
        role: user.role,
        email: user.email 
      },
      getJwtSecret(),
      { expiresIn: '30d' }
    );

    logger.info('Farmer logged in successfully', {
      userId: user.id,
      phone: user.phone
    });

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user.id,
          full_name: user.full_name,
          phone: user.phone,
          role: user.role,
          region: user.region
        },
        token
      }
    });
  } catch (error) {
    logger.error('Login error:', error);
    return res.status(500).json({
      success: false,
      error: 'Login failed. Please try again.'
    });
  }
});

// Public routes
router.post('/register', authRateLimiter, validate(schemas.register), register);
router.post('/login', authRateLimiter, validate(schemas.login), login);

router.post('/forgot-password', authRateLimiter, validate(schemas.forgotPassword), forgotPassword);
router.post('/reset-password', authRateLimiter, validate(schemas.resetPassword), resetPassword);

router.post('/refresh', authRateLimiter, refreshToken);

// Protected routes
router.get('/profile', authenticate, getProfile);
router.put('/profile', authenticate, validate(schemas.updateProfile), updateProfile);
router.put('/change-password', authenticate, validate(schemas.changePassword), changePassword);

export default router;