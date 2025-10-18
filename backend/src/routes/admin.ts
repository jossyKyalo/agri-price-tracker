import { Router } from 'express';
import { validate, schemas } from '../middleware/validation';
import { authenticate, requireAdmin, requireSuperAdmin } from '../middleware/auth';
import {
  createAdminRequest,
  getAdminRequests,
  reviewAdminRequest,
  getAdminStats,
  getSystemHealth
} from '../controllers/adminController.js';

const router = Router();

// Public routes
router.post('/request', validate(schemas.adminRequest), createAdminRequest);

// Admin routes
router.get('/requests', authenticate, requireAdmin, getAdminRequests);
router.put('/requests/:id/review', authenticate, requireSuperAdmin, validate(schemas.reviewAdminRequest), reviewAdminRequest);
router.get('/stats', authenticate, requireAdmin, getAdminStats);
router.get('/health', authenticate, requireAdmin, getSystemHealth);

export default router;