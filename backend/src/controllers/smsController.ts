import { Request, Response, NextFunction } from 'express';
import { query, transaction } from '../database/connection';
import { ApiError } from '../utils/apiError';
import { logger } from '../utils/logger';
import { sendSmsMessage, sendBulkSms } from '../services/smsService';
import type { SendSmsRequest, SmsTemplate, SmsLog, SmsSubscription, ApiResponse } from '../types/index';

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

    // Send SMS
    const smsResults = await sendBulkSms(recipients, finalMessage, sms_type, sentBy);

    logger.info(`SMS sent to ${recipients.length} recipients by ${req.user!.email}`);

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

    const conditions: string[] = ['is_active = $1'];
    const params: any[] = [is_active];
    let paramIndex = 2;

    if (sms_type) {
      conditions.push(`sms_type = $${paramIndex++}`);
      params.push(sms_type);
    }

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