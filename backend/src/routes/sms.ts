import { Router } from 'express';
import { validate, schemas } from '../middleware/validation';
import { authenticate, requireAdmin, optionalAuth } from '../middleware/auth';
import { smsRateLimiter } from '../middleware/rateLimiter';
import { validateSmsWebhook } from '../middleware/smsWebhookValidator';
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
  getSmsStats, 
  handleSmsWebhook,
  sendSmsWithReply,
  getSmsReplies,
  testSmsReplySystem
} from '../controllers/smsController';

const router = Router();

router.get('/webhook/test', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'SMS webhook endpoint is reachable',
    timestamp: new Date().toISOString(),
    path: '/api/v1/sms/webhook',
    method: 'POST',
    required_headers: ['Content-Type: application/json', 'X-Textbelt-Signature', 'X-Textbelt-Timestamp'],
    webhook_url: `${process.env.APP_BASE_URL || 'http://localhost:3000'}/api/v1/sms/webhook`
  });
});

// Public routes
router.post('/subscribe', optionalAuth, validate(schemas.smsSubscription), subscribeSms);
router.delete('/unsubscribe/:phone', unsubscribeSms);

// Webhook endpoint (no auth required - called by Textbelt)
router.post('/webhook', validateSmsWebhook, handleSmsWebhook);

// Admin routes
router.post('/send', authenticate, requireAdmin, smsRateLimiter, validate(schemas.sendSms), sendSms);
router.post('/send-with-reply', authenticate, requireAdmin, smsRateLimiter, validate(schemas.sendSmsWithReply), sendSmsWithReply);
router.get('/logs', authenticate, requireAdmin, getSmsLogs);
router.get('/replies', authenticate, requireAdmin, getSmsReplies);
router.get('/stats', authenticate, requireAdmin, getSmsStats);
router.get('/subscriptions', authenticate, requireAdmin, getSmsSubscriptions);

// Test routes
router.post('/test-reply-system', authenticate, requireAdmin, validate(schemas.testSmsReply), testSmsReplySystem);

// Template management
router.get('/templates', authenticate, requireAdmin, getSmsTemplates);
router.post('/templates', authenticate, requireAdmin, validate(schemas.createSmsTemplate), createSmsTemplate);
router.put('/templates/:id', authenticate, requireAdmin, validate(schemas.updateSmsTemplate), updateSmsTemplate);
router.delete('/templates/:id', authenticate, requireAdmin, deleteSmsTemplate);

export default router;