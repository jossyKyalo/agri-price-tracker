import { Router } from 'express';
import { validate, schemas } from '../middleware/validation.js';
import { authenticate, requireAdmin, optionalAuth } from '../middleware/auth.js';
import { smsRateLimiter } from '../middleware/rateLimiter.js';
import {
  sendSms,
  getSmsLogs,
  createSmsTemplate,
  getSmsTemplates,
  updateSmsTemplate,
  deleteSmsTemplate,
  subscribeSms,
  getSmsSubscriptions,
  unsubscribeSms,
  getSmsStats
} from '../controllers/smsController.js';

const router = Router();

// Public routes
router.post('/subscribe', optionalAuth, validate(schemas.smsSubscription), subscribeSms);
router.delete('/unsubscribe/:phone', unsubscribeSms);

// Admin routes
router.post('/send', authenticate, requireAdmin, smsRateLimiter, validate(schemas.sendSms), sendSms);
router.get('/logs', authenticate, requireAdmin, getSmsLogs);
router.get('/stats', authenticate, requireAdmin, getSmsStats);
router.get('/subscriptions', authenticate, requireAdmin, getSmsSubscriptions);

// Template management
router.get('/templates', authenticate, requireAdmin, getSmsTemplates);
router.post('/templates', authenticate, requireAdmin, validate(schemas.createSmsTemplate), createSmsTemplate);
router.put('/templates/:id', authenticate, requireAdmin, validate(schemas.updateSmsTemplate), updateSmsTemplate);
router.delete('/templates/:id', authenticate, requireAdmin, deleteSmsTemplate);

export default router;