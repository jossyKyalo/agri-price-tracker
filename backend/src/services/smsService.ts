import africastalking from 'africastalking';
import { query } from '../database/connection.js';
import { logger } from '../utils/logger.js';
import type { SmsLog } from '../types/index.js';
import dotenv from "dotenv";
dotenv.config();

// Lazily initialize Africa's Talking client to avoid startup crashes when not configured
let lazySmsClient: ReturnType<typeof africastalking>["SMS"] | null = null;

const getSmsClient = (): ReturnType<typeof africastalking>["SMS"] | null => {
  if (lazySmsClient) return lazySmsClient;

  const apiKey = process.env.AFRICASTALKING_API_KEY;
  const username = process.env.AFRICASTALKING_USERNAME;

  if (!apiKey || !username) {
    logger.warn('Africa\'s Talking not configured; SMS sending is disabled');
    return null;
  }

  const at = africastalking({ apiKey, username });
  lazySmsClient = at.SMS;
  return lazySmsClient;
};

/**
 * Send a single SMS
 */
export const sendSmsMessage = async (
  recipient: string,
  message: string,
  smsType: string,
  sentBy?: string
): Promise<SmsLog> => {
  try {
    const smsClient = getSmsClient();
    let status = 'pending';
    let messageId: string | null = null;

    if (smsClient) {
      // Send SMS via Africa's Talking
      const response = await smsClient.send({
        to: [recipient],
        message,
        from: process.env.AFRICASTALKING_SHORTCODE || '',  
      });

      const smsData: any = response.Recipients ?? response; // SDK shape can vary
      status = smsData.status ?? 'sent';
      messageId = smsData.messageId ?? smsData[0]?.messageId ?? null;
    } else {
      // When not configured, simulate send for non-production to avoid crashes
      status = process.env.NODE_ENV === 'production' ? 'failed' : 'simulated';
      messageId = null;
      logger.info(`SMS simulated to ${recipient}: ${message}`);
    }

 
    // Log SMS in database
    const result = await query(
      `INSERT INTO sms_logs (recipient, message, sms_type, status, external_id, sent_by, sent_at)
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
       RETURNING *`,
      [recipient, message, smsType, status, messageId, sentBy]
    );

    logger.info(`📨 SMS sent to ${recipient}: ${messageId}`);
    return result.rows[0];

  } catch (error: any) {
    logger.error(`❌ Failed to send SMS to ${recipient}:`, error);

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

/**
 * Send bulk SMS (multiple recipients)
 */
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
      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (error) {
      logger.error(`❌ Bulk SMS failed for ${recipient}:`, error);
    }
  }

  return results;
};

/**
 * Fetch subscribed numbers (filters: crop, region, alert type)
 */
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
    logger.error('❌ Failed to get subscribed numbers:', error);
    return [];
  }
};

/**
 * Send price alert notification
 */
export const sendPriceAlert = async (
  cropName: string,
  price: number,
  region: string,
  trend: 'up' | 'down' | 'stable',
  percentage: number
): Promise<void> => {
  try {
    // Load SMS template
    const templateResult = await query(
      'SELECT template FROM sms_templates WHERE name = $1 AND is_active = true',
      ['Price Alert']
    );

    if (templateResult.rows.length === 0) {
      logger.warn('⚠️ Price alert template not found');
      return;
    }

    let message = templateResult.rows[0].template;

    // Replace placeholders
    message = message
      .replace('{crop}', cropName)
      .replace('{trend}', trend === 'up' ? 'increased' : trend === 'down' ? 'decreased' : 'remained stable')
      .replace('{percentage}', percentage.toString())
      .replace('{price}', price.toString())
      .replace('{region}', region)
      .replace('{market}', 'Local Market');

    // Subscribers for crop & region
    const subscribers = await getSubscribedNumbers([cropName.toLowerCase()], [region.toLowerCase()], ['price-alert']);

    if (subscribers.length > 0) {
      await sendBulkSms(subscribers, message, 'alert');
      logger.info(`✅ Price alert sent to ${subscribers.length} subscribers for ${cropName} in ${region}`);
    }
  } catch (error) {
    logger.error('❌ Failed to send price alert:', error);
  }
};

/**
 * Send daily top price update
 */
export const sendDailyPriceUpdate = async (): Promise<void> => {
  try {
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
      logger.info('ℹ️ No price updates to send today');
      return;
    }

    // Build SMS message
    let message = 'AGRI UPDATE: Today\'s prices - ';
    const priceList = priceChanges.rows
      .map(row => `${row.crop_name}: KSh ${row.price}/kg (${row.region_name})`)
      .join(', ');
    
    message += priceList + '. For more info, reply HELP';

    // Subscribers interested in daily updates
    const subscribers = await getSubscribedNumbers([], [], ['price-update']);

    if (subscribers.length > 0) {
      await sendBulkSms(subscribers, message, 'update');
      logger.info(`✅ Daily price update sent to ${subscribers.length} subscribers`);
    }
  } catch (error) {
    logger.error('❌ Failed to send daily price update:', error);
  }
};

/**
 * Process SMS delivery webhook
 */
export const processSmsWebhook = async (req: any): Promise<void> => {
  try {
    const { id, status, phoneNumber } = req.body;

    await query(
      'UPDATE sms_logs SET status = $1, delivered_at = CURRENT_TIMESTAMP WHERE external_id = $2',
      [status, id]
    );

    logger.info(`📬 Delivery report updated: ${id} - ${status} (${phoneNumber})`);
  } catch (error) {
    logger.error('❌ Failed to process SMS webhook:', error);
  }
};