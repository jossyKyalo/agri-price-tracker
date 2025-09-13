import { Request, Response, NextFunction } from 'express';
import { query } from '../database/connection.js';
import { ApiError } from '../utils/apiError.js';
import { logger } from '../utils/logger.js';
import { generateChatResponse } from '../services/geminiService.js';
import type { ChatRequest, ChatMessage, ChatConversation, ApiResponse } from '../types/index.js';

export const sendMessage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { message, session_id, context }: ChatRequest = req.body;
    const userId = req.user?.id;

    // Get or create conversation
    let conversation: ChatConversation;
    
    if (session_id) {
      const result = await query(
        'SELECT * FROM chat_conversations WHERE session_id = $1',
        [session_id]
      );
      
      if (result.rows.length > 0) {
        conversation = result.rows[0];
      } else {
        // Create new conversation
        const newConversation = await query(
          `INSERT INTO chat_conversations (user_id, session_id, messages, context)
           VALUES ($1, $2, $3, $4)
           RETURNING *`,
          [userId, session_id, JSON.stringify([]), JSON.stringify(context || {})]
        );
        conversation = newConversation.rows[0];
      }
    } else {
      // Create new conversation without session_id
      const newConversation = await query(
        `INSERT INTO chat_conversations (user_id, messages, context)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [userId, JSON.stringify([]), JSON.stringify(context || {})]
      );
      conversation = newConversation.rows[0];
    }

    // Add user message to conversation
    const userMessage: ChatMessage = {
      role: 'user',
      content: message,
      timestamp: new Date()
    };

    const messages = [...conversation.messages, userMessage];

    // Generate AI response using Gemini
    const aiResponse = await generateChatResponse(message, messages, context);

    // Add AI response to conversation
    const assistantMessage: ChatMessage = {
      role: 'assistant',
      content: aiResponse,
      timestamp: new Date()
    };

    const updatedMessages = [...messages, assistantMessage];

    // Update conversation in database
    await query(
      `UPDATE chat_conversations 
       SET messages = $1, context = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [JSON.stringify(updatedMessages), JSON.stringify(context || {}), conversation.id]
    );

    logger.info(`Chat message processed for session: ${session_id || conversation.id}`);

    const response: ApiResponse = {
      success: true,
      message: 'Chat response generated successfully',
      data: {
        response: aiResponse,
        session_id: session_id || conversation.id,
        conversation_id: conversation.id
      }
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};

export const getConversation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { session_id } = req.params;
    const userId = req.user?.id;

    let whereClause = 'WHERE session_id = $1';
    let params = [session_id];

    // If user is authenticated, also check user_id
    if (userId) {
      whereClause += ' AND (user_id = $2 OR user_id IS NULL)';
      params.push(userId);
    }

    const result = await query(
      `SELECT * FROM chat_conversations ${whereClause} ORDER BY updated_at DESC LIMIT 1`,
      params
    );

    if (result.rows.length === 0) {
      throw new ApiError('Conversation not found', 404);
    }

    const response: ApiResponse<ChatConversation> = {
      success: true,
      message: 'Conversation retrieved successfully',
      data: result.rows[0]
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};

export const getUserConversations = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { page = 1, limit = 10 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const result = await query(
      `SELECT id, session_id, context, created_at, updated_at,
              (messages->-1->>'content') as last_message
       FROM chat_conversations 
       WHERE user_id = $1
       ORDER BY updated_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    const countResult = await query('SELECT COUNT(*) FROM chat_conversations WHERE user_id = $1', [userId]);
    const total = parseInt(countResult.rows[0].count);
    const pages = Math.ceil(total / Number(limit));

    const response: ApiResponse<ChatConversation[]> = {
      success: true,
      message: 'User conversations retrieved successfully',
      data: result.rows,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages
      }
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};

export const deleteConversation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const result = await query(
      'DELETE FROM chat_conversations WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );

    if (result.rows.length === 0) {
      throw new ApiError('Conversation not found or access denied', 404);
    }

    logger.info(`Conversation deleted: ${id} by ${req.user!.email}`);

    const response: ApiResponse = {
      success: true,
      message: 'Conversation deleted successfully'
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};

export const getChatStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const stats = await Promise.all([
      query('SELECT COUNT(*) FROM chat_conversations WHERE DATE(created_at) = CURRENT_DATE'),
      query('SELECT COUNT(DISTINCT user_id) FROM chat_conversations WHERE user_id IS NOT NULL'),
      query('SELECT COUNT(*) FROM chat_conversations'),
      query(`SELECT AVG(jsonb_array_length(messages)) as avg_messages 
             FROM chat_conversations 
             WHERE jsonb_array_length(messages) > 0`)
    ]);

    const response: ApiResponse = {
      success: true,
      message: 'Chat stats retrieved successfully',
      data: {
        todayConversations: parseInt(stats[0].rows[0].count),
        uniqueUsers: parseInt(stats[1].rows[0].count),
        totalConversations: parseInt(stats[2].rows[0].count),
        avgMessagesPerConversation: parseFloat(stats[3].rows[0].avg_messages || '0')
      }
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};