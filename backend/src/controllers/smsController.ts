import { Request, Response, NextFunction } from 'express';
import { query, transaction } from '../database/connection';
import { ApiError } from '../utils/apiError';
import { logger } from '../utils/logger';
import { 
  sendSmsMessage, 
  sendBulkSms, 
  processSmsWebhook,
  processTextSmsWebhook, 
  testReplySystem,
  formatPhoneNumber,
  // NEW: Two-way SMS imports
  checkForIncomingSms,
  startSmsPolling,
  stopSmsPolling,
  getPollingStats,
  testTwoWaySms,
  getActiveConversations,
  getConversationByPhone,
  clearConversation,
  clearAllConversations,
  testTextSmsConnection,
  getTextSmsBalance,
  subscribeUser,
  unsubscribeUser,
  getSubscribedNumbers,
  sendPriceAlert as sendPriceAlertService,
  sendDailyPriceUpdate
} from '../services/smsService';
import type { 
  SendSmsRequest, 
  SmsTemplate, 
  SmsLog, 
  SmsSubscription, 
  ApiResponse,
  SendSmsWithReplyRequest 
} from '../types/index';

// ==================== WEBHOOK HANDLERS ====================

export const handleSmsWebhook = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try { 
    const result = await processTextSmsWebhook(req.body, req.headers, JSON.stringify(req.body));
    
    if (result.processed) {
      logger.info(`📩 SMS webhook processed successfully: ${result.action}`, {
        action: result.action,
        message: result.message
      });
      
      res.status(200).json({
        success: true,
        message: 'Webhook processed successfully',
        data: {
          action: result.action,
          message: result.message
        }
      });
    } else {
      logger.warn(`⚠️ SMS webhook not fully processed: ${result.message}`);
      
      res.status(200).json({ 
        success: false,
        message: result.message,
        error: 'Webhook received but not fully processed'
      });
    }
  } catch (error: any) {
    logger.error('❌ Error processing SMS webhook:', error);
    
    res.status(200).json({ // Always 200 for webhooks
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
};

export const handleTextBeeWebhook = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    logger.info('📩 TextBee webhook received', {
      path: req.path,
      event: req.body?.event || req.body?.webhookEvent, // Log both
      sender: req.body?.sender || req.body?.data?.sender,
      messagePreview: (req.body?.message || req.body?.data?.message)?.substring(0, 50) 
    });

    const result = await processTextSmsWebhook(
      req.body,
      req.headers,
      JSON.stringify(req.body)
    );
    
    if (result.processed) {
      logger.info(`✅ TextBee webhook processed: ${result.action}`, {
        action: result.action,
        message: result.message
      });
      
      res.status(200).json({
        success: true,
        message: 'Webhook processed successfully',
        data: {
          action: result.action,
          message: result.message
        }
      });
    } else {
      logger.warn(`⚠️ TextBee webhook not fully processed: ${result.message}`);
      
      res.status(200).json({
        success: false,
        message: result.message,
        error: 'Webhook received but not fully processed'
      });
    }
  } catch (error: any) {
    logger.error('❌ Error processing TextBee webhook:', error);
    
    res.status(200).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
};

// ==================== TWO-WAY SMS MANAGEMENT ====================

export const checkIncomingSms = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { limit = 20, offset = 0 } = req.query;
    
    const result = await checkForIncomingSms();
    
    const response: ApiResponse = {
      success: result.success,
      message: result.success ? `Found ${result.messages.length} incoming messages` : 'Failed to check incoming SMS',
      data: {
        messages: result.messages.slice(0, Number(limit)),
        stats: result.stats,
        totalFound: result.messages.length,
        hasIncomingEndpoint: result.stats?.hasIncomingEndpoint || false
      }
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};

export const startPollingSms = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { interval = 30000 } = req.body;
    
    if (interval < 10000) {
      throw new ApiError('Polling interval must be at least 10 seconds', 400);
    }
    
    startSmsPolling(Number(interval));
    
    const response: ApiResponse = {
      success: true,
      message: `✅ SMS polling started with ${interval}ms interval`,
      data: {
        interval: Number(interval),
        stats: getPollingStats(),
        nextPoll: new Date(Date.now() + Number(interval)).toISOString()
      }
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};

export const stopPollingSms = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    stopSmsPolling();
    
    const response: ApiResponse = {
      success: true,
      message: '⏹️ SMS polling stopped',
      data: {
        stats: getPollingStats()
      }
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};

export const getSmsPollingStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const stats = getPollingStats();
    
    const response: ApiResponse = {
      success: true,
      message: '📊 SMS polling stats retrieved',
      data: {
        ...stats,
        status: stats.isRunning ? 'active' : 'inactive',
        nextPoll: stats.isRunning ? new Date(Date.now() + stats.pollInterval).toISOString() : null
      }
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};

export const testTwoWaySmsSystem = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await testTwoWaySms();
    
    const response: ApiResponse = {
      success: result.success,
      message: result.success ? '✅ Two-way SMS test completed' : '❌ Two-way SMS test failed',
      data: {
        steps: result.steps,
        recommendations: result.recommendations,
        success: result.success,
        summary: result.steps.map(step => `${step.step}: ${step.success ? '✅' : '❌'}`)
      }
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};

export const getSmsConversations = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { phone } = req.query;
    
    let conversations;
    if (phone) {
      const conversation = getConversationByPhone(phone as string);
      conversations = conversation ? [[phone as string, conversation]] : [];
    } else {
      conversations = getActiveConversations();
    }
    
    const response: ApiResponse = {
      success: true,
      message: '💬 Active conversations retrieved',
      data: {
        conversations: conversations.map((item: any) => {
          const [phoneNumber, context] = item as [string, any];
          return {
            phone: phoneNumber,
            lastMessage: context.lastMessage?.substring(0, 100),
            lastReply: context.lastReply?.substring(0, 100),
            messageCount: context.messageCount,
            lastActivity: context.lastActivity,
            isActive: Date.now() - context.lastActivity.getTime() < 3600000 // 1 hour
          };
        }),
        count: conversations.length,
        activeCount: conversations.filter(([_, ctx]) =>
          ctx &&
          typeof ctx !== 'string' &&
          ctx.lastActivity &&
          Date.now() - ctx.lastActivity.getTime() < 3600000
        ).length
      }
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};

export const clearSmsConversation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { phone } = req.params;
    
    if (!phone) {
      throw new ApiError('Phone number is required', 400);
    }
    
    const cleared = clearConversation(phone);
    
    const response: ApiResponse = {
      success: true,
      message: cleared ? '🗑️ Conversation cleared' : '⚠️ Conversation not found',
      data: {
        phone,
        cleared,
        remainingConversations: getActiveConversations().length
      }
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};

export const clearAllSmsConversations = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const count = clearAllConversations();
    
    const response: ApiResponse = {
      success: true,
      message: `🧹 Cleared ${count} conversations`,
      data: {
        clearedCount: count
      }
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};

export const pollSmsNow = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    logger.info('🔄 Manual SMS polling triggered');
    
    const result = await checkForIncomingSms();
    
    const response: ApiResponse = {
      success: result.success,
      message: result.success ? 
        `Manual poll completed. Found ${result.messages.length} messages.` : 
        'Manual poll failed',
      data: {
        messages: result.messages.slice(0, 10),
        stats: result.stats,
        newMessages: result.messages.length,
        hasFarmerReplies: result.messages.filter(m => 
          m.sender?.startsWith('2547') || m.sender?.startsWith('+2547')
        ).length
      }
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};

// ==================== SMS SENDING ====================

export const sendSms = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      recipients,
      message,
      sms_type,
      template_id,
      template_variables
    }: SendSmsRequest = req.body;

    const sentBy = req.user!.id;
    let finalMessage = message;

    // If template is used, process variables
    if (template_id && template_variables) {
      const templateResult = await query('SELECT template FROM sms_templates WHERE id = $1', [template_id]);
      if (templateResult.rows.length > 0) {
        finalMessage = templateResult.rows[0].template;
        // Replace variables in template
        Object.entries(template_variables).forEach(([key, value]) => {
          finalMessage = finalMessage.replace(new RegExp(`{${key}}`, 'g'), value);
        });
      }
    }

    // Send SMS using TextBee
    const smsResults = await sendBulkSms(recipients, finalMessage, sms_type, sentBy);

    logger.info(`📤 SMS sent via TextBee to ${recipients.length} recipients by ${req.user!.email}`, {
      sentCount: smsResults.filter(r => r.status === 'sent').length,
      failedCount: smsResults.filter(r => r.status === 'failed').length
    });

    const response: ApiResponse = {
      success: true,
      message: `✅ SMS sent to ${smsResults.length} recipients`,
      data: {
        sent: smsResults.filter(r => r.status === 'sent').length,
        failed: smsResults.filter(r => r.status === 'failed').length,
        results: smsResults.slice(0, 5), // Return first 5 for preview
        total: smsResults.length
      }
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};

export const sendSmsWithReply = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      recipients,
      message,
      sms_type = 'general',
      template_id,
      template_variables,
      reply_webhook_url,
      webhook_data,
      sender,
      schedule_time,  
      getdlr = false 
    }: SendSmsWithReplyRequest & { schedule_time?: string; getdlr?: boolean } = req.body;

    const sentBy = req.user!.id;
    let finalMessage = message;
 
    if (template_id && template_variables) {
      const templateResult = await query('SELECT template FROM sms_templates WHERE id = $1', [template_id]);
      if (templateResult.rows.length > 0) {
        finalMessage = templateResult.rows[0].template; 
        Object.entries(template_variables).forEach(([key, value]) => {
          finalMessage = finalMessage.replace(new RegExp(`{${key}}`, 'g'), value);
        });
      }
    }

    const smsResults = [];
     
    for (const recipient of recipients) {
      const options: any = {
        smsType: sms_type,
        sentBy,
        scheduleTime: schedule_time,
        getdlr: getdlr,
        replyWebhookUrl: reply_webhook_url,
        webhookData: webhook_data
      };
       
      
      const result = await sendSmsMessage(recipient, finalMessage, options);
      smsResults.push(result); 
      await new Promise(r => setTimeout(r, 200));
    }

    logger.info(`📤 SMS with reply enabled sent to ${recipients.length} recipients by ${req.user!.email}`);

    const response: ApiResponse = {
      success: true,
      message: `✅ SMS sent to ${smsResults.length} recipients with reply capability`,
      data: {
        sent: smsResults.filter(r => r.status === 'sent').length,
        failed: smsResults.filter(r => r.status === 'failed').length,
        results: smsResults.slice(0, 3),
        has_reply_support: true,
        provider: 'TextBee',
        two_way_enabled: true
      }
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};

// ==================== TESTING ====================

export const testSmsReplySystem = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { 
      test_phone, 
      test_message = "Test reply message",
      test_message_id = `test_${Date.now()}`,
      test_status = "delivered"
    } = req.body;

    if (!test_phone) {
      throw new ApiError('Test phone number is required', 400);
    } 

    const testReply = {
      textId: test_message_id,
      fromNumber: test_phone,
      text: test_message,
      status: test_status,
      timestamp: Date.now()
    };
 
    const result = await testReplySystem(testReply);
 

    const response: ApiResponse = {
      success: result.success,
      message: result.success ? '✅ Test reply system is working' : '❌ Test reply system failed',
      data: {
        ...result,
        test_details: {
          phone: test_phone,
          message_id: test_message_id,
          message: test_message,
          status: test_status
        },
        two_way_test: "Use testTwoWaySmsSystem endpoint for complete testing"
      }
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};

export const testTextSmsConnectionHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const connectionResult = await testTextSmsConnection();
    const balance = await getTextSmsBalance();

    const response: ApiResponse = {
      success: connectionResult.isActive,
      message: connectionResult.isActive ? '✅ TextBee connection is active' : '❌ TextBee connection failed',
      data: {
        isActive: connectionResult.isActive,
        balance: balance,
        status: connectionResult.status,
        details: connectionResult.details,
        provider: 'TextBee',
        two_way_support: true
      }
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};

export const sendTestSms = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { phone, message = "Test SMS from AgriPrice system. Reply with HELP for commands." } = req.body;

    if (!phone) {
      throw new ApiError('Test phone number is required', 400);
    }

    const result = await sendSmsMessage(phone, message, {
      smsType: 'test',
      sentBy: req.user?.id || 'test_user',
      replyWebhookUrl: `${process.env.APP_BASE_URL}/api/v1/sms/webhook/textbee`
    });

    const response: ApiResponse = {
      success: result.status === 'sent',
      message: result.status === 'sent' ? '✅ Test SMS sent successfully' : '❌ Failed to send test SMS',
      data: {
        recipient: result.recipient,
        message: result.message?.substring(0, 50) + '...',
        status: result.status,
        external_id: result.external_id,
        error_message: result.error_message,
        reply_instructions: "If this is your SIM number, reply to test two-way SMS"
      }
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};

// ==================== SMS LOGS & REPLIES ====================

export const getSmsReplies = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      phone, 
      date_from, 
      date_to,
      action 
    } = req.query;
    
    const offset = (Number(page) - 1) * Number(limit);

    const conditions: string[] = ['reply_received = true'];
    const params: any[] = [];
    let paramIndex = 1;

    if (phone) {
      conditions.push(`recipient = $${paramIndex++}`);
      params.push(formatPhoneNumber(phone as string));
    }
    if (date_from) {
      conditions.push(`reply_timestamp >= $${paramIndex++}`);
      params.push(date_from);
    }
    if (date_to) {
      conditions.push(`reply_timestamp <= $${paramIndex++}`);
      params.push(date_to);
    }
    if (action) { 
      conditions.push(`reply_text ILIKE $${paramIndex++}`);
      params.push(`%${action}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit, offset);

    const result = await query(
      `SELECT 
         id,
         recipient,
         message,
         reply_text,
         reply_timestamp,
         external_id,
         sms_type,
         status as delivery_status,
         created_at
       FROM sms_logs
       ${whereClause}
       ORDER BY reply_timestamp DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      params
    );

    const countResult = await query(
      `SELECT COUNT(*) FROM sms_logs ${whereClause}`,
      params.slice(0, -2)
    );

    const total = parseInt(countResult.rows[0].count);
    const pages = Math.ceil(total / Number(limit));

    const response: ApiResponse = {
      success: true,
      message: '💬 SMS replies retrieved successfully',
      data: result.rows.map(row => ({
        id: row.id,
        phone: row.recipient,
        original_message: row.message?.substring(0, 100),
        reply_text: row.reply_text?.substring(0, 100),
        reply_timestamp: row.reply_timestamp,
        external_id: row.external_id,
        sms_type: row.sms_type,
        delivery_status: row.delivery_status,
        received_at: row.reply_timestamp,
        is_two_way: true
      })),
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

export const getSmsLogs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { page = 1, limit = 20, status, sms_type, date_from, date_to } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(status);
    }
    if (sms_type) {
      conditions.push(`sms_type = $${paramIndex++}`);
      params.push(sms_type);
    }
    if (date_from) {
      conditions.push(`created_at >= $${paramIndex++}`);
      params.push(date_from);
    }
    if (date_to) {
      conditions.push(`created_at <= $${paramIndex++}`);
      params.push(date_to);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit, offset);

    const result = await query(
      `SELECT sl.*, u.full_name as sent_by_name
       FROM sms_logs sl
       LEFT JOIN users u ON sl.sent_by = u.id
       ${whereClause}
       ORDER BY sl.created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      params
    );

    const countResult = await query(
      `SELECT COUNT(*) FROM sms_logs ${whereClause}`,
      params.slice(0, -2)
    );

    const total = parseInt(countResult.rows[0].count);
    const pages = Math.ceil(total / Number(limit));

    const response: ApiResponse<SmsLog[]> = {
      success: true,
      message: `📋 SMS logs retrieved successfully - Total: ${total}, With Replies: ${result.rows.filter(r => r.reply_received).length}, Two-way: ${total > 0 ? Math.round((result.rows.filter(r => r.reply_received).length / total) * 100) : 0}%`,
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

// ==================== SMS TEMPLATES ====================

export const createSmsTemplate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { name, template, variables, sms_type } = req.body;
    const createdBy = req.user!.id;

    const result = await query(
      `INSERT INTO sms_templates (name, template, variables, sms_type, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name, template, JSON.stringify(variables || []), sms_type, createdBy]
    );

    logger.info(`📝 SMS template created: ${name} by ${req.user!.email}`);

    const response: ApiResponse<SmsTemplate> = {
      success: true,
      message: '✅ SMS template created successfully',
      data: result.rows[0]
    };

    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
};

export const getSmsTemplates = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { sms_type, is_active = true } = req.query;

    const result = await query(
      `SELECT st.*, u.full_name as created_by_name
       FROM sms_templates st
       JOIN users u ON st.created_by = u.id
       WHERE st.is_active = $1
       ORDER BY st.created_at DESC`,
      [true]
    );

    const response: ApiResponse<SmsTemplate[]> = {
      success: true,
      message: '📋 SMS templates retrieved successfully',
      data: result.rows
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};

export const updateSmsTemplate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, template, variables, sms_type, is_active } = req.body;

    const result = await query(
      `UPDATE sms_templates 
       SET name = COALESCE($1, name),
           template = COALESCE($2, template),
           variables = COALESCE($3, variables),
           sms_type = COALESCE($4, sms_type),
           is_active = COALESCE($5, is_active),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING *`,
      [name, template, variables ? JSON.stringify(variables) : null, sms_type, is_active, id]
    );

    if (result.rows.length === 0) {
      throw new ApiError('SMS template not found', 404);
    }

    logger.info(`📝 SMS template updated: ${id} by ${req.user!.email}`);

    const response: ApiResponse<SmsTemplate> = {
      success: true,
      message: '✅ SMS template updated successfully',
      data: result.rows[0]
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};

export const deleteSmsTemplate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;

    const result = await query('DELETE FROM sms_templates WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      throw new ApiError('SMS template not found', 404);
    }

    logger.info(`🗑️ SMS template deleted: ${id} by ${req.user!.email}`);

    const response: ApiResponse = {
      success: true,
      message: '✅ SMS template deleted successfully'
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};

// ==================== SUBSCRIPTIONS ====================

export const subscribeSms = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { phone, crops, regions, alert_types } = req.body;
    const userId = req.user?.id;

    // Use the new subscription function from smsService
    const result = await subscribeUser(phone, crops, userId);

    logger.info(`✅ SMS subscription created/updated: ${phone}`, {
      userId,
      cropsCount: crops?.length || 0
    });

    const response: ApiResponse<SmsSubscription> = {
      success: true,
      message: '✅ SMS subscription updated successfully',
      data: result
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};

export const getSmsSubscriptions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { page = 1, limit = 20, is_active = true } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const result = await query(
      `SELECT ss.*, u.full_name as user_name
       FROM sms_subscriptions ss
       LEFT JOIN users u ON ss.user_id = u.id
       WHERE ss.is_active = $1
       ORDER BY ss.created_at DESC
       LIMIT $2 OFFSET $3`,
      [is_active, limit, offset]
    );

    const countResult = await query('SELECT COUNT(*) FROM sms_subscriptions WHERE is_active = $1', [is_active]);
    const total = parseInt(countResult.rows[0].count);
    const pages = Math.ceil(total / Number(limit));

    // Get active numbers for two-way SMS
    const activeNumbers = await getSubscribedNumbers();

    // Create the response data object
    const responseData = {
      subscriptions: result.rows,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages
      },
      summary: {
        totalActive: activeNumbers.length,
        twoWayReady: true
      }
    };

    const response: ApiResponse = {
      success: true,
      message: '📋 SMS subscriptions retrieved successfully',
      data: responseData
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};

export const unsubscribeSms = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { phone } = req.params;
    const userId = req.user?.id;

    // Check if phone is provided
    if (!phone) {
      throw new ApiError('Phone number is required', 400);
    }

    // Validate phone format
    const formattedPhone = formatPhoneNumber(phone);

    // Use the new unsubscribe function from smsService
    const result = await unsubscribeUser(formattedPhone, userId);

    logger.info(`SMS unsubscribed: ${formattedPhone}`, { userId });

    const response: ApiResponse = {
      success: true,
      message: 'Successfully unsubscribed from SMS alerts',
      data: {
        phone: formattedPhone,
        unsubscribed: result
      }
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};

// ==================== STATISTICS ====================

export const getSmsStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const stats = await Promise.all([
      query('SELECT COUNT(*) FROM sms_logs WHERE DATE(created_at) = CURRENT_DATE'),
      query('SELECT COUNT(*) FROM sms_subscriptions WHERE is_active = true'),
      query('SELECT COUNT(*) FROM sms_logs WHERE status = $1', ['pending']),
      query('SELECT COUNT(*) FROM sms_logs WHERE status = $1', ['failed']),
      query('SELECT COUNT(*) FROM sms_logs WHERE reply_received = true'),
      query(`
        SELECT COUNT(DISTINCT recipient) as unique_senders 
        FROM sms_logs 
        WHERE reply_received = true 
        AND created_at >= CURRENT_DATE - INTERVAL '7 days'
      `)
    ]);

    // Get polling stats
    const pollingStats = getPollingStats();
    
    // Get active conversations
    const conversations = getActiveConversations();

    const response: ApiResponse = {
      success: true,
      message: '📊 SMS stats retrieved successfully',
      data: {
        todaySent: parseInt(stats[0].rows[0].count),
        activeSubscriptions: parseInt(stats[1].rows[0].count),
        pending: parseInt(stats[2].rows[0].count),
        failed: parseInt(stats[3].rows[0].count),
        repliesReceived: parseInt(stats[4].rows[0].count),
        uniqueSenders7Days: parseInt(stats[5].rows[0].unique_senders || '0'),
        
        // Two-way SMS stats
        twoWayStats: {
          activeConversations: conversations.length,
          pollingActive: pollingStats.isRunning,
          pollingInterval: pollingStats.pollInterval,
          processedMessages: pollingStats.processedCount
        },
        
        // Success rates
        successRate: parseInt(stats[0].rows[0].count) > 0 ? 
          Math.round(((parseInt(stats[0].rows[0].count) - parseInt(stats[3].rows[0].count)) / parseInt(stats[0].rows[0].count)) * 100) : 0,
        
        replyRate: parseInt(stats[0].rows[0].count) > 0 ?
          Math.round((parseInt(stats[4].rows[0].count) / parseInt(stats[0].rows[0].count)) * 100) : 0
      }
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};

// ==================== PRICE ALERTS ====================

export const sendPriceAlert = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { 
      cropName, 
      price, 
      region, 
      trend = 'stable', 
      percentage = 0,
      sentBy = req.user?.id 
    } = req.body;

    if (!cropName || !price || !region) {
      throw new ApiError('Crop name, price, and region are required', 400);
    }

    await sendPriceAlertService(cropName, price, region, trend, percentage, sentBy);

    const response: ApiResponse = {
      success: true,
      message: '🚨 Price alert sent successfully',
      data: {
        crop: cropName,
        price,
        region,
        trend,
        percentage,
        sentBy,
        twoWayEnabled: true
      }
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};

export const sendDailyPriceUpdateHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const sentBy = req.user?.id;

    await sendDailyPriceUpdate(sentBy);

    const response: ApiResponse = {
      success: true,
      message: '📅 Daily price update sent successfully',
      data: {
        sentBy,
        timestamp: new Date().toISOString(),
        twoWayEnabled: true
      }
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};

// ==================== WEBHOOK TEST ENDPOINT ====================

export const testWebhookEndpoint = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const endpoints = {
      textbee: '/api/v1/sms/webhook/textbee',
      generic: '/api/v1/sms/webhook',
      test: '/api/v1/sms/webhook/test'
    };

    const response: ApiResponse = {
      success: true,
      message: '✅ SMS webhook endpoints are configured',
      data: {
        endpoints,
        recommended: endpoints.textbee,
        webhook_url: `${process.env.APP_BASE_URL || 'http://localhost:3000'}${endpoints.textbee}`,
        instructions: 'Configure this URL in TextBee dashboard for two-way SMS'
      }
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};

