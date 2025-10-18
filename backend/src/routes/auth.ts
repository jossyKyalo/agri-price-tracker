import { Router } from 'express';
import { validate, schemas } from '../middleware/validation';
import { authRateLimiter } from '../middleware/rateLimiter';
import { authenticate } from '../middleware/auth';
import {
  register,
  login,
  refreshToken,
  getProfile,
  updateProfile,
  changePassword
} from '../controllers/authController.js';

const router = Router();

// Public routes
router.post('/register', authRateLimiter, validate(schemas.register), register);
router.post('/login', authRateLimiter, validate(schemas.login), login);
router.post('/refresh', authRateLimiter, refreshToken);

// Protected routes
router.get('/profile', authenticate, getProfile);
router.put('/profile', authenticate, validate(schemas.updateProfile), updateProfile);
router.put('/change-password', authenticate, validate(schemas.changePassword), changePassword);

export default router;