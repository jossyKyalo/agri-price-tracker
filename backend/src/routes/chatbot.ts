import { Router } from 'express';
import { validate, schemas } from '../middleware/validation.js';
import { optionalAuth, authenticate, requireAdmin } from '../middleware/auth.js';
import { chatRateLimiter } from '../middleware/rateLimiter.js';
import {
  sendMessage,
  getConversation,
  getUserConversations,
  deleteConversation,
  getChatStats
} from '../controllers/chatbotController.js';

const router = Router();

// Public/authenticated routes
router.post('/message', optionalAuth, chatRateLimiter, validate(schemas.chatMessage), sendMessage);
router.get('/conversation/:session_id', optionalAuth, getConversation);

// Authenticated routes
router.get('/conversations', authenticate, getUserConversations);
router.delete('/conversations/:id', authenticate, deleteConversation);

// Admin routes
router.get('/stats', authenticate, requireAdmin, getChatStats);

export default router;