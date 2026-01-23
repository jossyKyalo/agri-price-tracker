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
  testSmsReplySystem, 
  handleTextBeeWebhook,
  checkIncomingSms,
  startPollingSms,
  stopPollingSms,
  getSmsPollingStats,
  testTwoWaySmsSystem,
  getSmsConversations,
  clearSmsConversation,
  clearAllSmsConversations,
  pollSmsNow
} from '../controllers/smsController';

const router = Router();
 
router.post('/webhook/textbee', handleTextBeeWebhook);
 
router.post('/webhook', handleSmsWebhook);

 
router.get('/webhook/test', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'SMS webhook endpoint is reachable',
    timestamp: new Date().toISOString(),
    endpoints: {
      textbee: '/api/v1/sms/webhook/textbee',
      generic: '/api/v1/sms/webhook'
    },
    webhook_url: `${process.env.APP_BASE_URL || 'http://localhost:3000'}/api/v1/sms/webhook/textbee`
  });
});
 

router.get('/incoming', authenticate, requireAdmin, checkIncomingSms);
 
router.post('/poll/now', authenticate, requireAdmin, pollSmsNow);
 
router.post('/polling/start', authenticate, requireAdmin, startPollingSms);
router.post('/polling/stop', authenticate, requireAdmin, stopPollingSms);
router.get('/polling/stats', authenticate, requireAdmin, getSmsPollingStats);
 
router.get('/test/two-way', authenticate, requireAdmin, testTwoWaySmsSystem);

 
router.get('/conversations', authenticate, requireAdmin, getSmsConversations);
router.delete('/conversations/:phone', authenticate, requireAdmin, clearSmsConversation);
router.delete('/conversations', authenticate, requireAdmin, clearAllSmsConversations);

 
router.post('/subscribe', optionalAuth, validate(schemas.smsSubscription), subscribeSms);
router.delete('/unsubscribe/:phone', unsubscribeSms);

 
router.post('/send', authenticate, requireAdmin, smsRateLimiter, validate(schemas.sendSms), sendSms);
router.post('/send-with-reply', authenticate, requireAdmin, smsRateLimiter, validate(schemas.sendSmsWithReply), sendSmsWithReply);
router.get('/logs', authenticate, requireAdmin, getSmsLogs);
router.get('/replies', authenticate, requireAdmin, getSmsReplies);
router.get('/stats', authenticate, requireAdmin, getSmsStats);
router.get('/subscriptions', authenticate, requireAdmin, getSmsSubscriptions);

 
router.post('/test-reply-system', authenticate, requireAdmin, validate(schemas.testSmsReply), testSmsReplySystem);
 
router.get('/templates', authenticate, requireAdmin, getSmsTemplates);
router.post('/templates', authenticate, requireAdmin, validate(schemas.createSmsTemplate), createSmsTemplate);
router.put('/templates/:id', authenticate, requireAdmin, validate(schemas.updateSmsTemplate), updateSmsTemplate);
router.delete('/templates/:id', authenticate, requireAdmin, deleteSmsTemplate);

export default router;