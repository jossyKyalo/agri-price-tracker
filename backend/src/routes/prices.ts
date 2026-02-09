import { Router } from 'express';
import { validate, schemas, validateQuery, querySchemas } from '../middleware/validation';
import { authenticate, requireAdmin, optionalAuth } from '../middleware/auth';
import { priceSubmissionRateLimiter } from '../middleware/rateLimiter';
import {
  getPrices,
  getLatestPrices,
  createPriceEntry,
  updatePriceEntry,
  deletePriceEntry,
  getPendingVerifications,
  verifyPriceEntry,
  rejectPriceEntry
} from '../controllers/priceController';

const router = Router();

// Public routes (with optional auth)
router.get('/latest', optionalAuth, getLatestPrices);
router.get('/', optionalAuth, validateQuery(querySchemas.priceQuery), getPrices);

router.post('/submit', createPriceEntry); 

// Authenticated routes
router.post('/',authenticate, priceSubmissionRateLimiter, validate(schemas.createPriceEntry), createPriceEntry);

// Admin routes
router.get('/pending', authenticate, requireAdmin, getPendingVerifications);
router.put('/:id', authenticate, requireAdmin, validate(schemas.updatePriceEntry), updatePriceEntry);
router.delete('/:id', authenticate, requireAdmin, deletePriceEntry);
router.put('/:id/verify', authenticate, requireAdmin, verifyPriceEntry);
router.delete('/:id/reject', authenticate, requireAdmin, rejectPriceEntry);

export default router;