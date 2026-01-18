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
  simulateTextSmsWebhook 
} from '../services/smsService';
import type { 
  SendSmsRequest, 
  SmsTemplate, 
  SmsLog, 
  SmsSubscription, 
  ApiResponse,
  SendSmsWithReplyRequest 
} from '../types/index';

 

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

    // Send SMS using TextSMS
    const smsResults = await sendBulkSms(recipients, finalMessage, sms_type, sentBy);

    logger.info(`SMS sent via TextSMS to ${recipients.length} recipients by ${req.user!.email}`);

    const response: ApiResponse = {
      success: true,
      message: `SMS sent to ${smsResults.length} recipients`,
      data: {
        sent: smsResults.filter(r => r.status === 'sent').length,
        failed: smsResults.filter(r => r.status === 'failed').length,
        results: smsResults
      }
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};

// NEW: Send SMS with reply/webhook support
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
      schedule_time, // Added for TextSMS scheduling
      getdlr = false // Added for delivery reports
    }: SendSmsWithReplyRequest & { schedule_time?: string; getdlr?: boolean } = req.body;

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

    const smsResults = [];
    
    // Send SMS to each recipient with webhook support
    for (const recipient of recipients) {
      const options: any = {
        smsType: sms_type,
        sentBy,
        scheduleTime: schedule_time,
        getdlr: getdlr
      };
      
      // TextSMS doesn't support custom reply webhook URLs per message
      // You'll need to use your main webhook endpoint configured with TextSMS
      
      const result = await sendSmsMessage(recipient, finalMessage, options);
      smsResults.push(result);

      // Small delay between messages to avoid rate limiting
      await new Promise(r => setTimeout(r, 200));
    }

    logger.info(`SMS with reply enabled sent to ${recipients.length} recipients by ${req.user!.email}`);

    const response: ApiResponse = {
      success: true,
      message: `SMS sent to ${smsResults.length} recipients with reply capability`,
      data: {
        sent: smsResults.filter(r => r.status === 'sent').length,
        failed: smsResults.filter(r => r.status === 'failed').length,
        results: smsResults,
        has_reply_support: true,
        provider: 'TextSMS'
      }
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};

// UPDATED: Handle SMS webhook from TextSMS (no signature validation needed)
export const handleSmsWebhook = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // For TextSMS, we don't need signature validation or raw body
    // Simply process the body directly
    const result = await processTextSmsWebhook(req.body);
    
    if (result.processed) {
      logger.info(`TextSMS webhook processed successfully: ${result.action}`);
      
      // Return success response to TextSMS
      res.status(200).json({
        success: true,
        message: 'Webhook processed successfully'
      });
    } else {
      logger.warn(`TextSMS webhook failed: ${result.message}`);
      res.status(400).json({
        success: false,
        error: result.message
      });
    }
  } catch (error) {
    logger.error('Error processing TextSMS webhook:', error);
    // Still return 200 to TextSMS to avoid retries
    res.status(200).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

// UPDATED: Also keep the old endpoint for backward compatibility
export const handleTextSmsWebhook = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // For TextSMS, we don't need signature validation or raw body
    // Simply process the body directly
    const result = await processTextSmsWebhook(req.body);
    
    if (result.processed) {
      logger.info(`TextSMS webhook processed successfully: ${result.action}`);
      
      // Return success response to TextSMS
      res.status(200).json({
        success: true,
        message: 'Webhook processed successfully'
      });
    } else {
      logger.warn(`TextSMS webhook failed: ${result.message}`);
      res.status(400).json({
        success: false,
        error: result.message
      });
    }
  } catch (error) {
    logger.error('Error processing TextSMS webhook:', error);
    // Still return 200 to TextSMS to avoid retries
    res.status(200).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

// NEW: Get SMS replies
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
      // You might need to store the action in a separate table or column
      // For now, we'll search in reply_text
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
         delivery_status,
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
      message: 'SMS replies retrieved successfully',
      data: result.rows.map(row => ({
        id: row.id,
        phone: row.recipient,
        original_message: row.message,
        reply_text: row.reply_text,
        reply_timestamp: row.reply_timestamp,
        external_id: row.external_id,
        sms_type: row.sms_type,
        delivery_status: row.delivery_status,
        received_at: row.reply_timestamp
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

// UPDATED: Test SMS reply system for TextSMS
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

    // Create a test reply object matching the SmsReply interface
    const testReply = {
      textId: test_message_id,
      fromNumber: test_phone,
      text: test_message,
      status: test_status,
      timestamp: Date.now()
    };

    // Option 1: Test using the testReplySystem function
    const result = await testReplySystem(testReply);

    // Option 2: Alternatively, simulate a webhook
    // const webhookResult = await simulateTextSmsWebhook(
    //   test_message_id,
    //   test_phone,
    //   test_message,
    //   test_status
    // );

    const response: ApiResponse = {
      success: result.success,
      message: result.success ? 'Test reply system is working' : 'Test reply system failed',
      data: {
        ...result,
        test_details: {
          phone: test_phone,
          message_id: test_message_id,
          message: test_message,
          status: test_status
        }
      }
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};

// NEW: Test TextSMS connection
export const testTextSmsConnection = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { testTextSmsConnection, getTextSmsBalance } = require('../services/smsService');
    
    const connectionResult = await testTextSmsConnection();
    const balance = await getTextSmsBalance();

    const response: ApiResponse = {
      success: connectionResult.isActive,
      message: connectionResult.isActive ? 'TextSMS connection is active' : 'TextSMS connection failed',
      data: {
        isActive: connectionResult.isActive,
        balance: balance,
        status: connectionResult.status,
        details: connectionResult.details
      }
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};

// NEW: Send test SMS
export const sendTestSms = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { phone, message = "Test SMS from AgriPrice system" } = req.body;

    if (!phone) {
      throw new ApiError('Test phone number is required', 400);
    }

    const result = await sendSmsMessage(phone, message, {
      smsType: 'test',
      sentBy: req.user?.id || 'test_user'
    });

    const response: ApiResponse = {
      success: result.status === 'sent',
      message: result.status === 'sent' ? 'Test SMS sent successfully' : 'Failed to send test SMS',
      data: {
        recipient: result.recipient,
        message: result.message,
        status: result.status,
        external_id: result.external_id,
        error_message: result.error_message
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
      message: 'SMS logs retrieved successfully',
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

    logger.info(`SMS template created: ${name} by ${req.user!.email}`);

    const response: ApiResponse<SmsTemplate> = {
      success: true,
      message: 'SMS template created successfully',
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
      message: 'SMS templates retrieved successfully',
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

    logger.info(`SMS template updated: ${id} by ${req.user!.email}`);

    const response: ApiResponse<SmsTemplate> = {
      success: true,
      message: 'SMS template updated successfully',
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

    logger.info(`SMS template deleted: ${id} by ${req.user!.email}`);

    const response: ApiResponse = {
      success: true,
      message: 'SMS template deleted successfully'
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};

export const subscribeSms = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { phone, crops, regions, alert_types } = req.body;
    const userId = req.user?.id;

    const result = await query(
      `INSERT INTO sms_subscriptions (phone, user_id, crops, regions, alert_types)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (phone) 
       DO UPDATE SET 
         crops = EXCLUDED.crops,
         regions = EXCLUDED.regions,
         alert_types = EXCLUDED.alert_types,
         is_active = true,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [phone, userId, JSON.stringify(crops || []), JSON.stringify(regions || []), JSON.stringify(alert_types || [])]
    );

    logger.info(`SMS subscription created/updated: ${phone}`);

    const response: ApiResponse<SmsSubscription> = {
      success: true,
      message: 'SMS subscription updated successfully',
      data: result.rows[0]
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

    const response: ApiResponse<SmsSubscription[]> = {
      success: true,
      message: 'SMS subscriptions retrieved successfully',
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

export const unsubscribeSms = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { phone } = req.params;

    const result = await query(
      'UPDATE sms_subscriptions SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE phone = $1 RETURNING *',
      [phone]
    );

    if (result.rows.length === 0) {
      throw new ApiError('SMS subscription not found', 404);
    }

    logger.info(`SMS unsubscribed: ${phone}`);

    const response: ApiResponse = {
      success: true,
      message: 'Successfully unsubscribed from SMS alerts'
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};

export const getSmsStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const stats = await Promise.all([
      query('SELECT COUNT(*) FROM sms_logs WHERE DATE(created_at) = CURRENT_DATE'),
      query('SELECT COUNT(*) FROM sms_subscriptions WHERE is_active = true'),
      query('SELECT COUNT(*) FROM sms_logs WHERE status = $1', ['pending']),
      query('SELECT COUNT(*) FROM sms_logs WHERE status = $1', ['failed'])
    ]);

    const response: ApiResponse = {
      success: true,
      message: 'SMS stats retrieved successfully',
      data: {
        todaySent: parseInt(stats[0].rows[0].count),
        activeSubscriptions: parseInt(stats[1].rows[0].count),
        pending: parseInt(stats[2].rows[0].count),
        failed: parseInt(stats[3].rows[0].count)
      }
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};