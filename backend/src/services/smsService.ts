 
import axios from 'axios';
import crypto from 'crypto';
import { pool, query } from '../database/connection';
import { logger } from '../utils/logger';
import { ApiError } from '../utils/apiError';

 

export interface SmsLog {
  recipient: string;
  message: string;
  sms_type: string;
  status: 'sent' | 'failed';
  external_id?: string;
  sent_by?: string;
  error_message?: string;
  reply_received?: boolean;
  reply_text?: string;
  reply_timestamp?: Date;
}

export interface SendSmsOptions {
  smsType?: string;
  sentBy?: string;
  replyWebhookUrl?: string;
  webhookData?: string;
  sender?: string;
}

export interface SmsReply {
  textId: string;
  fromNumber: string;
  text: string;
  data?: string;
  timestamp: number;
  signature: string;
}

export interface TextbeltResponse {
  success: boolean;
  quotaRemaining: number;
  textId?: string;
  error?: string;
}

export interface ConnectionTestResult {
  isActive: boolean;
  quotaRemaining?: number;
  status: string;
  details?: any;
}

export interface QuotaResult {
  quotaRemaining: number;
  hasQuota: boolean;
  details?: any;
}

export interface TestResult {
  success: boolean;
  message: string;
  details?: any;
}
 

const TEXTBELT_API_KEY = process.env.TEXTBELT_API_KEY || 'textbelt';
const TEXTBELT_API_URL = 'https://textbelt.com/text';
const TEXTBELT_SENDER = process.env.TEXTBELT_SENDER_NAME || 'AgriPrice';
const APP_BASE_URL = process.env.APP_BASE_URL || '';
const SMS_RATE_LIMIT_DELAY = parseInt(process.env.SMS_RATE_LIMIT_DELAY || '500', 10);

// Constants
const MAX_WEBHOOK_DATA_LENGTH = 100;
const SIGNATURE_TIMEOUT_SECONDS = 900; // 15 minutes
const DEFAULT_SMS_TYPE = 'general';

logger.info(`📱 SMS Service initialized with ${TEXTBELT_API_KEY === 'textbelt' ? 'FREE' : 'PAID'} API key`);

/* ------------------------------------------------------------------ */
/* Phone Number Utilities */
/* ------------------------------------------------------------------ */

export const formatPhoneNumber = (phone: string): string => {
  if (!phone || typeof phone !== 'string') {
    throw new ApiError('Invalid phone number', 400);
  }

  let num = phone.replace(/\D/g, '');

  // Handle Kenyan phone numbers
  if (num.startsWith('0') && num.length === 10) {
    num = '254' + num.slice(1);
  } else if (num.startsWith('7') && num.length === 9) {
    num = '254' + num;
  } else if (!num.startsWith('254') && num.length === 9) {
    num = '254' + num;
  }

  // Validate final format
  if (!num.startsWith('254') || num.length !== 12) {
    throw new ApiError(`Invalid Kenyan phone number format: ${phone}`, 400);
  }

  return '+' + num;
};

export const validatePhoneNumber = (phone: string): boolean => {
  try {
    const formatted = formatPhoneNumber(phone);
    return /^\+254\d{9}$/.test(formatted);
  } catch {
    return false;
  }
};

/* ------------------------------------------------------------------ */
/* Core SMS Functions */
/* ------------------------------------------------------------------ */

export const sendSmsMessage = async (
  recipient: string,
  message: string,
  options: SendSmsOptions = {}
): Promise<SmsLog> => {
  const {
    smsType = DEFAULT_SMS_TYPE,
    sentBy,
    replyWebhookUrl,
    webhookData,
    sender = TEXTBELT_SENDER
  } = options;

  const formattedRecipient = formatPhoneNumber(recipient);
  let externalId: string | undefined;
  let errorMsg: string | undefined;

  try {
    // Validate message length
    if (!message || message.trim().length === 0) {
      throw new ApiError('SMS message cannot be empty', 400);
    }

    if (message.length > 1600) {
      logger.warn(`Message length (${message.length}) exceeds recommended limit`);
    }

    // Build payload
    const payload: Record<string, any> = {
      phone: formattedRecipient,
      message: message.trim(),
      key: TEXTBELT_API_KEY
    };

    // Add sender if provided
    if (sender && sender.trim().length > 0) {
      payload.sender = sender.trim();
    }

    // Add webhook for receiving replies (paid tier only)
    if (replyWebhookUrl && TEXTBELT_API_KEY !== 'textbelt') {
      payload.replyWebhookUrl = replyWebhookUrl;
      
      if (webhookData) {
        if (webhookData.length > MAX_WEBHOOK_DATA_LENGTH) {
          logger.warn(`Webhook data truncated from ${webhookData.length} to ${MAX_WEBHOOK_DATA_LENGTH} chars`);
          payload.webhookData = webhookData.substring(0, MAX_WEBHOOK_DATA_LENGTH);
        } else {
          payload.webhookData = webhookData;
        }
      }
    }

    logger.info(`📤 Sending SMS to ${formattedRecipient}`, {
      smsType,
      hasWebhook: !!replyWebhookUrl,
      recipient: formattedRecipient.substring(0, 8) + '...'
    });

    // Send SMS
    const response = await axios.post<TextbeltResponse>(
      TEXTBELT_API_URL,
      payload,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        timeout: 30000
      }
    );

    const data = response.data;

     logger.debug('📡 Full Textbelt Response:', {
      success: data.success,
      error: data.error,
      quotaRemaining: data.quotaRemaining,
      textId: data.textId,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers, 
      requestDetails: {
        phone: formattedRecipient,
        messageLength: message.length,
        messagePreview: message.substring(0, 50) + (message.length > 50 ? '...' : ''),
        hasSender: !!sender,
        keyLength: TEXTBELT_API_KEY?.length || 0,
        hasWebhook: !!replyWebhookUrl
      }
    });
    
    if (data.success === true) {
      externalId = data.textId?.toString() || `textbelt_${Date.now()}`;
      
      logger.info(`✅ SMS sent successfully`, {
        messageId: externalId,
        quotaRemaining: data.quotaRemaining,
        recipient: formattedRecipient.substring(0, 8) + '...'
      });

      return await saveSmsLog(
        formattedRecipient,
        message,
        smsType,
        'sent',
        externalId,
        sentBy
      );
    } else {
      errorMsg = data.error || 'Unknown error from Textbelt';

       logger.error('❌ SMS Failed with Details:', {
        recipient: formattedRecipient,
        error: errorMsg,
        rawError: data.error,
        quotaRemaining: data.quotaRemaining,
        textId: data.textId,
        statusCode: response.status,
        // Request details
        messagePreview: message.substring(0, 100),
        messageLength: message.length,
        hasSender: !!sender,
        senderName: sender,
        apiKeyPrefix: TEXTBELT_API_KEY?.substring(0, 10) + '...',
        apiKeyLength: TEXTBELT_API_KEY?.length || 0,
        // Response headers
        responseHeaders: response.headers
      });
      
      if (data.quotaRemaining === 0) {
        errorMsg = 'Out of SMS quota. Please add more credits to your Textbelt account.';
      }

      logger.warn(`❌ SMS failed`, {
        error: errorMsg,
        recipient: formattedRecipient.substring(0, 8) + '...',
        quotaRemaining: data.quotaRemaining
      });

      return await saveSmsLog(
        formattedRecipient,
        message,
        smsType,
        'failed',
        externalId,
        sentBy,
        errorMsg
      );
    }

  } catch (error: any) {
    errorMsg = error.response?.data?.error || error.message || 'Network error';
    
    logger.error(`💥 SMS send error`, {
      error: errorMsg,
      recipient: formattedRecipient.substring(0, 8) + '...'
    });

    return await saveSmsLog(
      formattedRecipient,
      message,
      smsType,
      'failed',
      externalId,
      sentBy,
      errorMsg
    );
  }
};

export const sendBulkSms = async (
  recipients: string[],
  message: string,
  smsType: string = DEFAULT_SMS_TYPE,
  sentBy?: string,
  options?: Omit<SendSmsOptions, 'smsType' | 'sentBy'>
): Promise<SmsLog[]> => {
  // Validate input
  if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
    logger.warn('No recipients provided for bulk SMS');
    return [];
  }

  if (!message || message.trim().length === 0) {
    logger.warn('Empty message for bulk SMS');
    return [];
  }

  // Filter and validate recipients
  const validRecipients = recipients.filter((recipient): recipient is string => {
    return typeof recipient === 'string' && recipient.trim().length > 0 && validatePhoneNumber(recipient);
  });

  if (validRecipients.length === 0) {
    logger.warn('No valid recipients after filtering');
    return [];
  }

  logger.info(`📨 Starting bulk SMS to ${validRecipients.length} recipients`, {
    messagePreview: message.substring(0, 50) + (message.length > 50 ? '...' : '')
  });

  const results: SmsLog[] = [];
  const sentRecipients = new Set<string>();

  // Send SMS to each recipient
  for (let i = 0; i < validRecipients.length; i++) {
    const recipient = validRecipients[i];
    
    if (!recipient || typeof recipient !== 'string') {
      continue;
    }
    
    // Skip duplicates
    if (sentRecipients.has(recipient)) {
      logger.debug(`Skipping duplicate recipient: ${recipient.substring(0, 8)}...`);
      continue;
    }
    sentRecipients.add(recipient);

    try {
      const result = await sendSmsMessage(recipient, message, {
        smsType,
        ...(sentBy && { sentBy }),
        ...options
      });
      results.push(result);

      // Progress logging
      if ((i + 1) % 5 === 0 || i === validRecipients.length - 1) {
        const sentCount = results.filter(r => r.status === 'sent').length;
        const failedCount = results.filter(r => r.status === 'failed').length;
        logger.info(`Progress: ${i + 1}/${validRecipients.length} (${sentCount} sent, ${failedCount} failed)`);
      }

      // Rate limiting delay
      if (i < validRecipients.length - 1) {
        await new Promise(resolve => setTimeout(resolve, SMS_RATE_LIMIT_DELAY));
      }
    } catch (error) {
      logger.error(`Error sending to ${recipient.substring(0, 8)}...:`, error);
      const failedLog: SmsLog = {
        recipient,
        message,
        sms_type: smsType,
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown error'
      };
      if (sentBy) {
        failedLog.sent_by = sentBy;
      }
      results.push(failedLog);
    }
  }

  // Summary
  const sentCount = results.filter(r => r.status === 'sent').length;
  const failedCount = results.filter(r => r.status === 'failed').length;
  
  logger.info(`📊 Bulk SMS Complete`, {
    total: validRecipients.length,
    sent: sentCount,
    failed: failedCount,
    successRate: Math.round((sentCount / validRecipients.length) * 100)
  });

  return results;
};

/* ------------------------------------------------------------------ */
/* Database Operations */
/* ------------------------------------------------------------------ */

async function saveSmsLog(
  recipient: string,
  message: string,
  smsType: string,
  status: 'sent' | 'failed',
  externalId?: string,
  sentBy?: string,
  errorMsg?: string
): Promise<SmsLog> {
  try {
    const result = await pool.query(
      `
      INSERT INTO sms_logs
      (recipient, message, sms_type, status, external_id, sent_by, error_message)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
      `,
      [
        recipient,
        message,
        smsType,
        status,
        externalId || null,
        sentBy || null,
        errorMsg || null
      ]
    );

    return result.rows[0];
  } catch (err) {
    logger.error('Failed to save SMS log', err);
    // Return a fallback object
    const fallback: SmsLog = {
      recipient,
      message,
      sms_type: smsType,
      status
    };
    if (externalId) fallback.external_id = externalId;
    if (sentBy) fallback.sent_by = sentBy;
    if (errorMsg) fallback.error_message = errorMsg;
    return fallback;
  }
}

/* ------------------------------------------------------------------ */
/* Webhook Security */
/* ------------------------------------------------------------------ */

export const verifyWebhookSignature = (
  timestamp: string,
  signature: string,
  rawBody: string
): boolean => {
  try {
    // Skip verification for free tier
    if (TEXTBELT_API_KEY === 'textbelt') {
      logger.debug('Webhook verification skipped for free tier');
      return true;
    }

    const expectedSignature = crypto
      .createHmac('sha256', TEXTBELT_API_KEY)
      .update(timestamp + rawBody)
      .digest('hex');
    
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    logger.error('Signature verification error:', error);
    return false;
  }
};

export const validateWebhookTimestamp = (timestamp: string): boolean => {
  try {
    const now = Math.floor(Date.now() / 1000);
    const timestampNum = parseInt(timestamp, 10);
    
    if (isNaN(timestampNum)) {
      return false;
    }

    return Math.abs(now - timestampNum) <= SIGNATURE_TIMEOUT_SECONDS;
  } catch (error) {
    logger.error('Timestamp validation error:', error);
    return false;
  }
};

/* ------------------------------------------------------------------ */
/* Webhook Processing */
/* ------------------------------------------------------------------ */

export const processSmsWebhook = async (
  body: any,
  headers: any,
  rawBody: string
): Promise<{ processed: boolean; action?: string; message?: string }> => {
  try {
    const { textId, fromNumber, text, data: webhookData } = body;
    const signature = headers['x-textbelt-signature'];
    const timestamp = headers['x-textbelt-timestamp'];

    // Validate required fields
    if (!textId || !fromNumber) {
      logger.warn('Invalid webhook payload', { textId, fromNumber });
      return { processed: false, message: 'Invalid payload: missing textId or fromNumber' };
    }

    // Security validation for paid tier
    if (TEXTBELT_API_KEY !== 'textbelt') {
      if (!signature || !timestamp) {
        logger.warn('Missing signature headers');
        return { processed: false, message: 'Missing signature headers' };
      }

      if (!validateWebhookTimestamp(timestamp)) {
        logger.warn('Invalid timestamp', { timestamp, current: Math.floor(Date.now() / 1000) });
        return { processed: false, message: 'Invalid timestamp' };
      }

      if (!verifyWebhookSignature(timestamp, signature, rawBody)) {
        logger.warn('Invalid signature');
        return { processed: false, message: 'Invalid signature' };
      }
    }

    const userText = (text || '').trim();
    const upperText = userText.toUpperCase();
    
    logger.info(`📩 SMS reply received`, {
      textId,
      fromNumber,
      text: userText,
      webhookData
    });

    // Update SMS log with reply
    await updateSmsLogWithReply(textId, userText);

    // Process based on message content
    let action = 'processed';
    
    switch (upperText) {
      case 'STOP':
        action = await handleUnsubscribe(fromNumber);
        break;
        
      case 'JOIN':
      case 'START':
      case 'YES':
        action = await handleSubscribe(fromNumber);
        break;
        
      case 'HELP':
      case 'INFO':
        action = await sendHelpMessage(fromNumber);
        break;
        
      default:
        action = await handleLocationRequest(fromNumber, upperText);
        break;
    }

    logger.info(`✅ SMS reply processed`, {
      action,
      fromNumber,
      textId
    });

    return {
      processed: true,
      action,
      message: `Reply processed: ${action}`
    };

  } catch (error: any) {
    logger.error('Failed to process SMS webhook', error);
    return {
      processed: false,
      message: `Error: ${error.message}`
    };
  }
};

async function updateSmsLogWithReply(textId: string, replyText: string): Promise<void> {
  try {
    await query(
      `UPDATE sms_logs 
       SET reply_received = true, 
           reply_text = $1, 
           reply_timestamp = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE external_id = $2`,
      [replyText, textId.toString()]
    );
  } catch (error) {
    logger.error('Failed to update SMS log with reply:', error);
  }
}

async function handleUnsubscribe(phone: string): Promise<string> {
  const formattedPhone = formatPhoneNumber(phone);
  
  await query(
    `UPDATE sms_subscriptions 
     SET is_active = false, 
         updated_at = CURRENT_TIMESTAMP
     WHERE phone = $1`,
    [formattedPhone]
  );
  
  // Send confirmation
  await sendSmsMessage(
    phone,
    'You have been unsubscribed from AgriPrice alerts. Text JOIN to resubscribe anytime.',
    { smsType: 'unsubscription' }
  );
  
  return 'unsubscribed';
}

async function handleSubscribe(phone: string): Promise<string> {
  const formattedPhone = formatPhoneNumber(phone);
  
  // Activate subscription
  await query(
    `INSERT INTO sms_subscriptions (phone, is_active, created_at, updated_at)
     VALUES ($1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT (phone) 
     DO UPDATE SET is_active = true, updated_at = CURRENT_TIMESTAMP`,
    [formattedPhone]
  );
  
  // Send welcome message
  await sendSmsMessage(
    phone,
    'Welcome to AgriPrice! You are now subscribed to daily price alerts.\n\nCommands:\n• Reply with location (e.g., NAIROBI) for prices\n• Reply STOP to unsubscribe\n• Reply HELP for more info',
    { smsType: 'subscription' }
  );
  
  return 'subscribed';
}

async function sendHelpMessage(phone: string): Promise<string> {
  const helpMessage = `🤖 AgriPrice Commands:
• Reply with location (e.g., NAIROBI) for current crop prices
• Reply STOP to unsubscribe from all alerts
• Reply JOIN to subscribe/resubscribe
• Reply HELP for this information

📞 Support: contact@agriprice.com`;
  
  await sendSmsMessage(
    phone,
    helpMessage,
    { smsType: 'info' }
  );
  
  return 'help_sent';
}

async function handleLocationRequest(phone: string, location: string): Promise<string> {
  const prices = await getCropPricesByLocation(location);
  
  if (prices) {
    const priceMessage = `📊 Current prices in ${location}:\n\n${prices}\n\nReply with another location or HELP for commands.`;
    await sendSmsMessage(
      phone,
      priceMessage,
      { smsType: 'price_request' }
    );
    return 'prices_sent';
  } else {
    const errorMessage = `⚠️ Sorry, no prices found for ${location}.\n\nTry these locations: NAIROBI, NAKURU, KISUMU, MOMBASA, ELDORET\n\nReply HELP for commands.`;
    await sendSmsMessage(
      phone,
      errorMessage,
      { smsType: 'error' }
    );
    return 'location_not_found';
  }
}

/* ------------------------------------------------------------------ */
/* Price Lookup */
/* ------------------------------------------------------------------ */

async function getCropPricesByLocation(location: string): Promise<string | null> {
  try {
    const locationUpper = location.toUpperCase();
    
    const result = await query(`
      SELECT 
        c.name as crop_name,
        c.unit,
        pe.price,
        r.name as region_name,
        pe.entry_date
      FROM price_entries pe
      JOIN crops c ON pe.crop_id = c.id
      JOIN regions r ON pe.region_id = r.id
      WHERE (
        UPPER(r.name) LIKE $1 OR
        UPPER(r.alias) LIKE $1 OR
        UPPER(r.county) LIKE $1
      )
      AND pe.is_verified = true
      AND pe.entry_date >= CURRENT_DATE - INTERVAL '7 days'
      ORDER BY pe.entry_date DESC, c.name
      LIMIT 8
    `, [`%${locationUpper}%`]);

    if (result.rows.length === 0) {
      return null;
    }

    // Group by crop for latest price
    const latestPrices = new Map();
    result.rows.forEach(row => {
      const key = `${row.crop_name}-${row.region_name}`;
      if (!latestPrices.has(key)) {
        latestPrices.set(key, row);
      }
    });

    // Format prices
    const priceList = Array.from(latestPrices.values())
      .map(row => `• ${row.crop_name}: KSh ${row.price.toLocaleString()}/${row.unit}`)
      .join('\n');

    return priceList;
  } catch (error) {
    logger.error('Error fetching crop prices:', error);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Subscription Management */
/* ------------------------------------------------------------------ */

export const subscribeUser = async (
  phone: string,
  cropIds: string[] = [],
  sentBy?: string
): Promise<any> => {
  const formattedPhone = formatPhoneNumber(phone);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const result = await client.query(
      `
      INSERT INTO sms_subscriptions (phone, crops, is_active, created_at, updated_at)
      VALUES ($1, $2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (phone)
      DO UPDATE SET 
        crops = EXCLUDED.crops,
        is_active = true,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
      `,
      [formattedPhone, cropIds]
    );

    // Send welcome message with webhook
    await sendSmsMessage(
      formattedPhone,
      `Welcome to AgriPrice! You are now tracking ${cropIds.length || 'all'} crops.\n\nYou will receive daily price updates.\n\nCommands:\n• Reply with location for prices\n• Reply STOP to unsubscribe\n• Reply HELP for info`,
      {
        smsType: 'subscription',
        ...(sentBy && { sentBy }),
        replyWebhookUrl: `${APP_BASE_URL}/api/sms/webhook`
      }
    );

    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Subscription error:', error);
    throw new ApiError('Subscription failed', 500);
  } finally {
    client.release();
  }
};

export const unsubscribeUser = async (
  phone: string,
  sentBy?: string
): Promise<boolean> => {
  const formattedPhone = formatPhoneNumber(phone);

  try {
    await pool.query(
      `UPDATE sms_subscriptions 
       SET is_active = false, 
           updated_at = CURRENT_TIMESTAMP
       WHERE phone = $1`,
      [formattedPhone]
    );

    // Send confirmation if requested
    if (sentBy) {
      await sendSmsMessage(
        formattedPhone,
        'You have been unsubscribed from AgriPrice daily updates. Text JOIN to resubscribe.',
        { smsType: 'unsubscription', sentBy }
      );
    }

    return true;
  } catch (error) {
    logger.error('Unsubscribe error:', error);
    throw new ApiError('Unsubscribe failed', 500);
  }
};

export const getSubscribedNumbers = async (
  cropNames?: string[]
): Promise<string[]> => {
  try {
    let queryText = `
      SELECT DISTINCT phone 
      FROM sms_subscriptions 
      WHERE is_active = true
    `;
    
    const params: any[] = [];

    if (cropNames && cropNames.length > 0) {
      queryText += ' AND crops && $1::text[]';
      params.push(cropNames);
    }

    const result = await pool.query(queryText, params);
    return result.rows
      .map(r => r.phone)
      .filter((phone): phone is string => phone && typeof phone === 'string');
  } catch (error) {
    logger.error('Failed to get subscribed numbers:', error);
    return [];
  }
};

/* ------------------------------------------------------------------ */
/* Price Alerts */
/* ------------------------------------------------------------------ */

export const sendPriceAlert = async (
  cropName: string,
  price: number,
  region: string,
  trend: 'up' | 'down' | 'stable',
  percentage: number,
  sentBy?: string
): Promise<void> => {
  try {
    const direction = trend === 'up' ? '📈 risen' : trend === 'down' ? '📉 dropped' : '📊 remained stable';
    const message = `🚨 AgriPrice Alert\n\n${cropName} prices in ${region} have ${direction} by ${percentage}% to KSh ${price.toLocaleString()}.\n\nReply with location for current prices or STOP to unsubscribe.`;

    const subscribers = await getSubscribedNumbers([cropName]);

    if (subscribers.length > 0) {
      await sendBulkSms(subscribers, message, 'price_alert', sentBy, {
        replyWebhookUrl: `${APP_BASE_URL}/api/sms/webhook`
      });
      
      logger.info(`✅ Price alert sent`, {
        crop: cropName,
        subscribers: subscribers.length,
        region
      });
    } else {
      logger.info(`No subscribers found for ${cropName} in ${region}`);
    }
  } catch (error) {
    logger.error('Failed to send price alert:', error);
    throw new ApiError('Failed to send price alert', 500);
  }
};

export const sendDailyPriceUpdate = async (sentBy?: string): Promise<void> => {
  try {
    // Get today's top price changes
    const priceChanges = await pool.query(`
      SELECT 
        c.name as crop_name, 
        c.unit,
        pe.price, 
        r.name as region_name,
        (pe.price - LAG(pe.price) OVER (PARTITION BY pe.crop_id, pe.region_id ORDER BY pe.entry_date)) as change
      FROM price_entries pe
      JOIN crops c ON pe.crop_id = c.id
      JOIN regions r ON pe.region_id = r.id
      WHERE pe.entry_date = CURRENT_DATE 
        AND pe.is_verified = true
        AND pe.region_id IN (
          SELECT DISTINCT region_id 
          FROM price_entries 
          WHERE entry_date = CURRENT_DATE - INTERVAL '1 day'
        )
      ORDER BY ABS(change) DESC NULLS LAST
      LIMIT 5
    `);

    if (priceChanges.rows.length === 0) {
      logger.info('No significant price changes to report today');
      return;
    }

    // Build message
    let message = '📅 Daily AgriPrice Update\n\n';
    message += priceChanges.rows
      .map(row => {
        const change = row.change || 0;
        const trend = change > 0 ? '📈' : change < 0 ? '📉' : '➡️';
        const changeText = change !== 0 ? `${trend} ${Math.abs(change).toLocaleString()}` : 'No change';
        return `• ${row.crop_name} (${row.region_name}): KSh ${row.price.toLocaleString()}/${row.unit} (${changeText})`;
      })
      .join('\n');
    
    message += '\n\nReply with location for more prices or STOP to unsubscribe.';

    // Get all subscribers
    const subscribers = await getSubscribedNumbers();

    if (subscribers.length > 0) {
      await sendBulkSms(subscribers, message, 'daily_update', sentBy, {
        replyWebhookUrl: `${APP_BASE_URL}/api/sms/webhook`
      });
      
      logger.info(`✅ Daily update sent to ${subscribers.length} subscribers`);
    } else {
      logger.info('No active subscribers for daily update');
    }
  } catch (error) {
    logger.error('Failed to send daily price update:', error);
    throw new ApiError('Failed to send daily update', 500);
  }
};

/* ------------------------------------------------------------------ */
/* Textbelt API Testing & Monitoring */
/* ------------------------------------------------------------------ */

export const testTextbeltConnection = async (): Promise<ConnectionTestResult> => {
  try {
    logger.info('🔍 Testing Textbelt API connection...');

    // Use test key to avoid quota usage
    const testKey = TEXTBELT_API_KEY.endsWith('_test')
      ? TEXTBELT_API_KEY
      : TEXTBELT_API_KEY + '_test';

    const response = await axios.post<TextbeltResponse>(
      TEXTBELT_API_URL,
      {
        phone: '+254700000000',
        message: 'Connection test',
        key: testKey,
        ...(TEXTBELT_SENDER && { sender: TEXTBELT_SENDER })
      },
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        timeout: 10000
      }
    );

    const data = response.data;

    if (data.success === true || data.error === 'Out of quota') {
      return {
        isActive: true,
        quotaRemaining: data.quotaRemaining,
        status: 'active',
        details: {
          message: data.success ? 'API is working' : 'API is working but out of quota',
          quotaRemaining: data.quotaRemaining
        }
      };
    } else {
      return {
        isActive: false,
        status: 'inactive',
        details: data.error || 'Unknown error'
      };
    }

  } catch (error: any) {
    logger.error('Textbelt API connection test failed:', error.message);
    
    return {
      isActive: false,
      status: 'inactive',
      details: error.response?.data || error.message
    };
  }
};

export const checkTextbeltQuota = async (): Promise<QuotaResult> => {
  try {
    // Use real key to check actual quota
    const response = await axios.post<TextbeltResponse>(
      TEXTBELT_API_URL,
      {
        phone: '+254700000000',
        message: 'Quota check',
        key: TEXTBELT_API_KEY
      },
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        timeout: 10000
      }
    );

    const data = response.data;
    const hasQuota = !!(data.success === true || (data.quotaRemaining && data.quotaRemaining > 0));
    
    return {
      quotaRemaining: data.quotaRemaining || 0,
      hasQuota,
      details: data
    };
    
  } catch (error: any) {
    logger.error('Failed to check Textbelt quota:', error.message);
    
    return {
      quotaRemaining: 0,
      hasQuota: false,
      details: error.response?.data || error.message
    };
  }
};

export const testTextbeltIntegration = async (testPhone?: string): Promise<TestResult> => {
  try {
    // Test connection
    const connection = await testTextbeltConnection();

    if (!connection.isActive) {
      return {
        success: false,
        message: 'Textbelt API is not accessible',
        details: connection.details
      };
    }

    // Test quota
    const quota = await checkTextbeltQuota();

    // Send test SMS if phone provided
    let testSmsResult = null;
    if (testPhone) {
      testSmsResult = await sendSmsMessage(
        testPhone,
        'Test SMS from AgriPrice via Textbelt',
        { smsType: 'test' }
      );
    }

    return {
      success: true,
      message: `Textbelt integration working. Quota: ${quota.quotaRemaining} messages available.`,
      details: {
        connection,
        quota,
        testSms: testSmsResult
      }
    };

  } catch (error: any) {
    return {
      success: false,
      message: 'Textbelt test failed: ' + error.message,
      details: error
    };
  }
};

export const testReplySystem = async (testPhone: string): Promise<TestResult> => {
  try {
    logger.info('🧪 Testing SMS reply system...');

    const testMessage = '🤖 AgriPrice Test\n\nReply with a location (e.g., NAIROBI) to test our reply system.';
    
    const result = await sendSmsMessage(
      testPhone,
      testMessage,
      {
        smsType: 'test',
        replyWebhookUrl: `${APP_BASE_URL}/api/sms/webhook`,
        webhookData: 'test_user_123'
      }
    );

    return {
      success: result.status === 'sent',
      message: result.status === 'sent' 
        ? '✅ Test SMS sent with webhook enabled. Please reply to test.'
        : '❌ Failed to send test SMS',
      details: result
    };

  } catch (error: any) {
    return {
      success: false,
      message: `Test failed: ${error.message}`,
      details: error
    };
  }
};

/* ------------------------------------------------------------------ */
/* Quick Test Function */
/* ------------------------------------------------------------------ */

export const quickTest = async (testPhone?: string): Promise<void> => {
  console.log('🧪 Quick SMS Service Test');
  console.log('='.repeat(50));
  
  try {
    // Test configuration
    console.log(`📱 Config:`);
    console.log(`  API Key: ${TEXTBELT_API_KEY.substring(0, 10)}...`);
    console.log(`  Sender: ${TEXTBELT_SENDER}`);
    console.log(`  Base URL: ${APP_BASE_URL || 'Not set'}`);
    
    // Test connection
    console.log(`\n🔌 Testing connection...`);
    const connection = await testTextbeltConnection();
    console.log(`  Status: ${connection.isActive ? '✅ Active' : '❌ Inactive'}`);
    
    if (connection.isActive) {
      // Test quota
      console.log(`\n💰 Checking quota...`);
      const quota = await checkTextbeltQuota();
      console.log(`  Quota Remaining: ${quota.quotaRemaining}`);
      console.log(`  Has Quota: ${quota.hasQuota ? '✅ Yes' : '❌ No'}`);
      
      // Send test SMS if phone provided
      if (testPhone) {
        console.log(`\n📤 Sending test SMS to ${testPhone}...`);
        const testResult = await sendSmsMessage(
          testPhone,
          'Test SMS from AgriPrice service',
          { smsType: 'test' }
        );
        console.log(`  Status: ${testResult.status === 'sent' ? '✅ Sent' : '❌ Failed'}`);
        if (testResult.external_id) {
          console.log(`  Message ID: ${testResult.external_id}`);
        }
      }
    }
    
    console.log('\n' + '='.repeat(50));
    console.log(connection.isActive ? '✅ All tests passed!' : '❌ Some tests failed');
    
  } catch (error) {
    console.error('💥 Test error:', error);
  }
};

/* ------------------------------------------------------------------ */
/* Default Export */
/* ------------------------------------------------------------------ */

export default {
  // Core SMS functions
  sendSmsMessage,
  sendBulkSms,
  formatPhoneNumber,
  validatePhoneNumber,
  
  // Webhook functions
  processSmsWebhook,
  verifyWebhookSignature,
  validateWebhookTimestamp,
  
  // Subscription management
  subscribeUser,
  unsubscribeUser,
  getSubscribedNumbers,
  
  // Alerts
  sendPriceAlert,
  sendDailyPriceUpdate,
  
  // Testing & monitoring
  testTextbeltConnection,
  checkTextbeltQuota,
  testTextbeltIntegration,
  testReplySystem,
  quickTest
};