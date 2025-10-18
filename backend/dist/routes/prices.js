import { Router } from 'express';
import { validate, schemas, validateQuery, querySchemas } from '../middleware/validation.js';
import { authenticate, requireAdmin, optionalAuth } from '../middleware/auth.js';
import { priceSubmissionRateLimiter } from '../middleware/rateLimiter.js';
import { getPrices, createPriceEntry, updatePriceEntry, deletePriceEntry, getPendingVerifications, verifyPriceEntry, rejectPriceEntry } from '../controllers/priceController.js';
const router = Router();
// Public routes (with optional auth)
router.get('/', optionalAuth, validateQuery(querySchemas.priceQuery), getPrices);
// Authenticated routes
router.post('/', authenticate, priceSubmissionRateLimiter, validate(schemas.createPriceEntry), createPriceEntry);
// Admin routes
router.get('/pending', authenticate, requireAdmin, getPendingVerifications);
router.put('/:id', authenticate, requireAdmin, validate(schemas.updatePriceEntry), updatePriceEntry);
router.delete('/:id', authenticate, requireAdmin, deletePriceEntry);
router.put('/:id/verify', authenticate, requireAdmin, verifyPriceEntry);
router.delete('/:id/reject', authenticate, requireAdmin, rejectPriceEntry);
export default router;
//# sourceMappingURL=prices.js.map