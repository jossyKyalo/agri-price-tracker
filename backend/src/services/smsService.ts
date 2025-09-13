import twilio from 'twilio';
import { query } from '../database/connection.js';
import { logger } from '../utils/logger.js';
import type { SmsLog } from '../types/index.js';

// Initialize Twilio client
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

export const sendSmsMessage = async (
  recipient: string,
  message: string,
  smsType: string,
  sentBy?: string
): Promise<SmsLog> => {
  try {
    // Send SMS via Twilio
    if (!process.env.TWILIO_PHONE_NUMBER) {
      throw new Error('TWILIO_PHONE_NUMBER environment variable is not set');
    }
    const twilioMessage = await twilioClient.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: recipient
    });

    // Log SMS in database
    const result = await query(
      `INSERT INTO sms_logs (recipient, message, sms_type, status, external_id, sent_by, sent_at)
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
       RETURNING *`,
      [recipient, message, smsType, 'sent', twilioMessage.sid, sentBy]
    );

    logger.info(`SMS sent successfully to ${recipient}: ${twilioMessage.sid}`);
    return result.rows[0];

  } catch (error: any) {
    logger.error(`Failed to send SMS to ${recipient}:`, error);

    // Log failed SMS
    const result = await query(
      `INSERT INTO sms_logs (recipient, message, sms_type, status, error_message, sent_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [recipient, message, smsType, 'failed', error.message, sentBy]
    );

    return result.rows[0];
  }
};

export const sendBulkSms = async (
  recipients: string[],
  message: string,
  smsType: string,
  sentBy?: string
): Promise<SmsLog[]> => {
  const results: SmsLog[] = [];

  for (const recipient of recipients) {
    try {
      const result = await sendSmsMessage(recipient, message, smsType, sentBy);
      results.push(result);
      
      // Add delay between messages to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      logger.error(`Failed to send bulk SMS to ${recipient}:`, error);
    }
  }

  return results;
};

export const getSubscribedNumbers = async (
  cropIds?: string[],
  regionIds?: string[],
  alertTypes?: string[]
): Promise<string[]> => {
  try {
    let whereConditions: string[] = ['is_active = true'];
    const params: any[] = [];
    let paramIndex = 1;

    if (cropIds && cropIds.length > 0) {
      whereConditions.push(`crops ?| $${paramIndex++}`);
      params.push(cropIds);
    }

    if (regionIds && regionIds.length > 0) {
      whereConditions.push(`regions ?| $${paramIndex++}`);
      params.push(regionIds);
    }

    if (alertTypes && alertTypes.length > 0) {
      whereConditions.push(`alert_types ?| $${paramIndex++}`);
      params.push(alertTypes);
    }

    const result = await query(
      `SELECT DISTINCT phone FROM sms_subscriptions WHERE ${whereConditions.join(' AND ')}`,
      params
    );

    return result.rows.map(row => row.phone);
  } catch (error) {
    logger.error('Failed to get subscribed numbers:', error);
    return [];
  }
};

export const sendPriceAlert = async (
  cropName: string,
  price: number,
  region: string,
  trend: 'up' | 'down' | 'stable',
  percentage: number
): Promise<void> => {
  try {
    // Get template
    const templateResult = await query(
      'SELECT template FROM sms_templates WHERE name = $1 AND is_active = true',
      ['Price Alert']
    );

    if (templateResult.rows.length === 0) {
      logger.warn('Price alert template not found');
      return;
    }

    let message = templateResult.rows[0].template;
    
    // Replace variables
    message = message
      .replace('{crop}', cropName)
      .replace('{trend}', trend === 'up' ? 'increased' : trend === 'down' ? 'decreased' : 'remained stable')
      .replace('{percentage}', percentage.toString())
      .replace('{price}', price.toString())
      .replace('{region}', region)
      .replace('{market}', 'Local Market');

    // Get subscribed numbers for this crop and region
    const subscribers = await getSubscribedNumbers([cropName.toLowerCase()], [region.toLowerCase()], ['price-alert']);

    if (subscribers.length > 0) {
      await sendBulkSms(subscribers, message, 'alert');
      logger.info(`Price alert sent to ${subscribers.length} subscribers for ${cropName} in ${region}`);
    }
  } catch (error) {
    logger.error('Failed to send price alert:', error);
  }
};

export const sendDailyPriceUpdate = async (): Promise<void> => {
  try {
    // Get today's top price changes
    const priceChanges = await query(`
      SELECT c.name as crop_name, pe.price, r.name as region_name
      FROM price_entries pe
      JOIN crops c ON pe.crop_id = c.id
      JOIN regions r ON pe.region_id = r.id
      WHERE pe.entry_date = CURRENT_DATE AND pe.is_verified = true
      ORDER BY pe.created_at DESC
      LIMIT 5
    `);

    if (priceChanges.rows.length === 0) {
      logger.info('No price updates to send today');
      return;
    }

    // Build message
    let message = 'AGRI UPDATE: Today\'s prices - ';
    const priceList = priceChanges.rows.map(row => 
      `${row.crop_name}: KSh ${row.price}/kg (${row.region_name})`
    ).join(', ');
    
    message += priceList + '. For more info, reply HELP';

    // Get all active subscribers
    const subscribers = await getSubscribedNumbers([], [], ['price-update']);

    if (subscribers.length > 0) {
      await sendBulkSms(subscribers, message, 'update');
      logger.info(`Daily price update sent to ${subscribers.length} subscribers`);
    }
  } catch (error) {
    logger.error('Failed to send daily price update:', error);
  }
};

export const processSmsWebhook = async (req: any): Promise<void> => {
  try {
    const { MessageSid, MessageStatus, To, From } = req.body;

    // Update SMS log status
    await query(
      'UPDATE sms_logs SET status = $1, delivered_at = CURRENT_TIMESTAMP WHERE external_id = $2',
      [MessageStatus, MessageSid]
    );

    logger.info(`SMS status updated: ${MessageSid} - ${MessageStatus}`);
  } catch (error) {
    logger.error('Failed to process SMS webhook:', error);
  }
};