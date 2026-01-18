// services/smsService.ts
import axios from 'axios';
import { pool, query } from '../database/connection';
import { logger } from '../utils/logger';
import { ApiError } from '../utils/apiError';

export interface SmsLog {
  id?: number;
  recipient: string;
  message: string;
  sms_type: string;
  status: 'sent' | 'failed';
  external_id?: string | undefined;
  sent_by?: string | undefined;
  error_message?: string | undefined;
  reply_received?: boolean;
  reply_text?: string;
  reply_timestamp?: Date;
}

export interface SendSmsOptions {
  smsType?: string;
  sentBy?: string | undefined;
  replyWebhookUrl?: string;
  webhookData?: string;
  scheduleTime?: string; // Format: "YYYY-MM-DD HH:MM:SS"
  getdlr?: boolean; // Request delivery report
}

// Fixed: Single SmsReply interface definition
export interface SmsReply {
  textId: string;          // messageid from TextSMS
  fromNumber: string;      // mobile (254... format)
  text: string;            // message content
  data?: string;           // optional additional data
  timestamp: number;       // unix timestamp
  // Note: No signature field for TextSMS
  status?: string;         // delivery status if applicable
  networkid?: string;      // network provider ID
}

export interface TextSmsResponse {
  success: boolean | undefined;
  code?: string | undefined;
  message?: string | undefined;
  data?: {
    message_id?: string | undefined;
    recipient?: string | undefined;
    cost?: number | undefined;
    balance?: number | undefined;
    message_ids?: string[] | undefined;
  } | undefined;
  error?: string | undefined;
}

export interface ConnectionTestResult {
  isActive: boolean;
  balance?: number;
  status: string;
  details?: any;
}

export interface QuotaResult {
  balance: number;
  hasBalance: boolean;
  details?: any;
}

export interface TestResult {
  success: boolean;
  message: string;
  details?: any;
}

// Update the TextSmsApiResponse interface in smsService.ts:
export interface TextSmsApiResponse {
  success?: boolean;
  code?: string;
  message?: string;
  data?: {
    messageid?: string;
    mobile?: string;
    cost?: number;
    messageids?: string[];
  };
  messages?: Array<{
    code?: string;
    message?: string;
    messageid?: string;
  }>;
  // Add this for bulk response format:
  responses?: Array<{
    clientsmsid?: string | null;
    messageid?: string;
    mobile?: string;
    networkid?: number;
    "response-code"?: number;
    "response-description"?: string;
  }>;
}

const TEXTSMS_API_KEY = process.env.TEXTSMS_API_KEY;
const TEXTSMS_PARTNER_ID = process.env.TEXTSMS_PARTNER_ID;
const TEXTSMS_API_URL = 'https://sms.textsms.co.ke/api/services';
const TEXTSMS_SHORTCODE = process.env.TEXTSMS_SHORTCODE || 'TextSMS';
const TEXTSMS_PASS_TYPE = process.env.TEXTSMS_PASS_TYPE || 'plain';

const APP_BASE_URL = process.env.APP_BASE_URL || '';
const SMS_RATE_LIMIT_DELAY = parseInt(process.env.SMS_RATE_LIMIT_DELAY || '500', 10);

// Constants
const MAX_WEBHOOK_DATA_LENGTH = 100;
const DEFAULT_SMS_TYPE = 'general';

logger.info(`📱 SMS Service initialized with TextSMS API`);

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

  if (!num.startsWith('254') || num.length !== 12) {
    throw new ApiError(`Invalid Kenyan phone number format: ${phone}`, 400);
  }

  return num; // TextSMS expects WITHOUT + prefix
};

export const validatePhoneNumber = (phone: string): boolean => {
  try {
    const formatted = formatPhoneNumber(phone);
    return /^254\d{9}$/.test(formatted);
  } catch {
    return false;
  }
};

/* ------------------------------------------------------------------ */
/* TextSMS API Client */
/* ------------------------------------------------------------------ */

class TextSmsClient {
  private apiKey: string;
  private partnerId: string;
  private baseUrl: string;
  private shortcode: string;
  private passType: string;

  constructor() {
    this.apiKey = TEXTSMS_API_KEY || '';
    this.partnerId = TEXTSMS_PARTNER_ID || '';
    this.baseUrl = TEXTSMS_API_URL;
    this.shortcode = TEXTSMS_SHORTCODE;
    this.passType = TEXTSMS_PASS_TYPE;

    if (!this.apiKey || !this.partnerId) {
      throw new ApiError('TextSMS API_KEY or PARTNER_ID not configured', 500);
    }

    logger.debug('TextSMS Client initialized', {
      apiKeyPrefix: this.apiKey.substring(0, 10) + '...',
      partnerId: this.partnerId
    });
  }

async sendSms(phone: string, message: string, options?: {
  scheduleTime?: string | undefined;
  getdlr?: boolean | undefined;
  clientSmsId?: number | undefined;
}): Promise<TextSmsResponse> {
  try {
    const formattedPhone = formatPhoneNumber(phone);

    const payload: any = {
      apikey: this.apiKey,
      partnerID: this.partnerId,
      message: message,
      shortcode: this.shortcode,
      mobile: formattedPhone,
      pass_type: this.passType
    };

    // Add optional parameters
    if (options?.scheduleTime !== undefined) {
      payload.timeToSend = options.scheduleTime;
    }
    if (options?.getdlr !== undefined) {
      payload.getdlr = options.getdlr;
    }
    if (options?.clientSmsId !== undefined) {
      payload.clientsmsid = options.clientSmsId;
    }

    logger.debug('📤 TextSMS send request', { payload });

    const response = await axios.post<TextSmsApiResponse>(
      `${this.baseUrl}/sendsms/`,
      payload,
      {
        headers: { 
          'Content-Type': 'application/json', 
          Accept: 'application/json' 
        },
        timeout: 30000
      }
    );

    logger.debug('📡 TextSMS Response:', response.data);

    // Parse TextSMS response format
    const apiResponse = response.data;
    
    // Handle different response formats
    let success: boolean | undefined = false;
    let messageId: string | undefined;
    let cost: number | undefined;
    
    if (apiResponse.responses && apiResponse.responses.length > 0) {
      // Bulk response format used for single SMS too
      const resp = apiResponse.responses[0];
      success = resp && (resp["response-code"] === 200 || resp["response-description"]?.toLowerCase() === 'success');
      messageId = resp?.messageid;
    } else if (apiResponse.code === '1000' || apiResponse.success === true) {
      success = true;
      messageId = apiResponse.data?.messageid;
      cost = apiResponse.data?.cost;
    }
    
    const responseData: TextSmsResponse['data'] = {
      message_id: messageId,
      recipient: formattedPhone,
      cost: cost,
      balance: undefined,
      message_ids: messageId ? [messageId] : undefined
    };
    
    return {
      success,
      code: success ? '1000' : apiResponse.code || '1006', // 1006 = Invalid credentials
      message: success ? 'SMS sent successfully' : apiResponse.message || 'SMS failed',
      data: responseData,
      error: !success ? apiResponse.message || 'SMS failed' : undefined
    };
  } catch (error: any) {
    logger.error('TextSMS API Error:', error.message, { 
      response: error.response?.data,
      status: error.response?.status 
    });
    
    if (error.response?.data) {
      const errorData = error.response.data;
      return {
        success: false,
        code: errorData.code,
        message: errorData.message,
        error: errorData.message || error.message
      };
    }
    
    throw error;
  }
}

async sendBulkSms(
  phones: string[], 
  message: string, 
  options?: {
    scheduleTime?: string | undefined;
    getdlr?: boolean | undefined;
  }
): Promise<TextSmsResponse> {
  try {
    const smslist = phones.map(phone => ({
      partnerID: this.partnerId,
      apikey: this.apiKey,
      mobile: formatPhoneNumber(phone),
      message: message,
      shortcode: this.shortcode,
      pass_type: this.passType,
      ...(options?.scheduleTime !== undefined && { timeToSend: options.scheduleTime }),
      ...(options?.getdlr !== undefined && { getdlr: options.getdlr })
    }));

    const payload = {
      count: phones.length,
      smslist
    };

    logger.debug('📤 TextSMS bulk send request', { 
      count: phones.length,
      firstPhone: phones[0],
      messageLength: message.length
    });

    const response = await axios.post<TextSmsApiResponse>(
      `${this.baseUrl}/sendbulk/`,
      payload,
      {
        headers: { 
          'Content-Type': 'application/json', 
          Accept: 'application/json' 
        },
        timeout: 30000
      }
    );

    logger.debug('📡 TextSMS Bulk Response:', response.data);

    const apiResponse = response.data;
    
    // Handle bulk response format
    let success = false;
    let messageIds: string[] = [];
    
    if (apiResponse.responses && apiResponse.responses.length > 0) {
      // Check if all responses are successful
      success = apiResponse.responses.every(resp => 
        resp["response-code"] === 200 || resp["response-description"]?.toLowerCase() === 'success'
      );
      
      // Collect all message IDs
      messageIds = apiResponse.responses
        .map(resp => resp.messageid)
        .filter((id): id is string => !!id);
    } else if (apiResponse.code === '1000' || apiResponse.success === true) {
      // Fallback to the original success check
      success = true;
    }
    
    const responseData: TextSmsResponse['data'] = {
      message_id: messageIds[0], // Use first message ID as main ID
      recipient: phones[0], // Use first recipient
      cost: undefined, // Not available in bulk response
      balance: undefined,
      message_ids: messageIds
    };
    
    return {
      success,
      code: success ? '1000' : apiResponse.code || '1004', // 1004 = Bulk credits low
      message: success ? 'Bulk SMS sent successfully' : apiResponse.message || 'Bulk SMS failed',
      data: responseData,
      error: !success ? apiResponse.message || 'Bulk SMS failed' : undefined
    };
  } catch (error: any) {
    logger.error('TextSMS Bulk API Error:', error.message, { 
      response: error.response?.data 
    });
    
    if (error.response?.data) {
      const errorData = error.response.data;
      return {
        success: false,
        code: errorData.code,
        message: errorData.message,
        error: errorData.message || error.message
      };
    }
    
    throw error;
  }
}

  async getBalance(): Promise<{ balance: number; success: boolean }> {
    try {
      const payload = {
        apikey: this.apiKey,
        partnerID: this.partnerId
      };

      const response = await axios.post<TextSmsApiResponse>(
        `${this.baseUrl}/getbalance/`,
        payload,
        {
          headers: { 
            'Content-Type': 'application/json', 
            Accept: 'application/json' 
          },
          timeout: 10000
        }
      );

      const balance = parseFloat(response.data.message || '0');
      return {
        balance,
        success: !isNaN(balance)
      };
    } catch (error) {
      logger.error('Failed to get TextSMS balance:', error);
      return { balance: 0, success: false };
    }
  }
}

export const sendSmsMessage = async (
  recipient: string,
  message: string,
  options: SendSmsOptions = {}
): Promise<SmsLog> => {
  const { 
    smsType = DEFAULT_SMS_TYPE, 
    sentBy, 
    scheduleTime,
    getdlr = false 
  } = options;
  
  const formattedRecipient = formatPhoneNumber(recipient);
  let externalId: string | undefined;
  let errorMsg: string | undefined;

  try {
    if (!message || message.trim().length === 0) {
      throw new ApiError('SMS message cannot be empty', 400);
    }

    const smsClient = new TextSmsClient();

    const response = await smsClient.sendSms(
      formattedRecipient, 
      message.trim(),
      { 
        scheduleTime: scheduleTime,
        getdlr: getdlr,
        clientSmsId: Date.now() // Use timestamp as client SMS ID
      }
    );
    
    // FIXED: Check success based on response code OR success flag
    const success = response.success === true || response.code === '1000';
    externalId = response.data?.message_id || `textsms_${Date.now()}`;

    if (success) {
      logger.info(`✅ SMS sent via TextSMS`, { 
        recipient: formattedRecipient, 
        messageId: externalId,
        scheduleTime,
        responseCode: response.code
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
      errorMsg = response.error || response.message || `TextSMS error: ${response.code}`;
      logger.error('❌ SMS Failed via TextSMS', { 
        recipient: formattedRecipient, 
        error: errorMsg,
        code: response.code,
        response
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
    errorMsg = error.message || 'Network error';
    logger.error('SMS send error:', {
      recipient: formattedRecipient,
      error: errorMsg,
      stack: error.stack
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
  if (!recipients || recipients.length === 0 || !message || message.trim().length === 0) {
    return [];
  }

  const validRecipients = recipients.filter(r => typeof r === 'string' && validatePhoneNumber(r));
  if (validRecipients.length === 0) {
    return [];
  }

  const results: SmsLog[] = [];

  // For small batches, use single API call
  if (validRecipients.length <= 100) {
    try {
      const smsClient = new TextSmsClient();
      const response = await smsClient.sendBulkSms(
        validRecipients, 
        message.trim(),
        {
          scheduleTime: options?.scheduleTime,
          getdlr: options?.getdlr
        }
      );

      // FIXED: Check success based on response
      const success = response.success === true || response.code === '1000';
      
      // Extract message IDs from response
      const messageIds = response.data?.message_ids || [];
      
      validRecipients.forEach((recipient, index) => {
        const messageId = messageIds[index] || response.data?.message_id || `textsms_bulk_${Date.now()}_${index}`;
        results.push({
          recipient: formatPhoneNumber(recipient),
          message,
          sms_type: smsType,
          status: success ? 'sent' : 'failed',
          external_id: messageId,
          sent_by: sentBy,
          error_message: !success ? response.message : undefined
        });
      });

      if (success) {
        logger.info(`✅ Bulk SMS sent via TextSMS`, { 
          count: validRecipients.length,
          type: smsType,
          responseCode: response.code
        });
      } else {
        logger.error('❌ Bulk SMS failed via TextSMS', { 
          error: response.message,
          code: response.code,
          response
        });
      }

      return results;
    } catch (error: any) {
      logger.error('Bulk SMS API failed:', error.message, error.stack);
    }
  }

  // Fallback: send individually with rate limiting
  for (const recipient of validRecipients) {
    try {
      const result = await sendSmsMessage(recipient, message, { 
        smsType, 
        sentBy, 
        ...options 
      });
      results.push(result);
      
      // Rate limiting delay between sends
      if (SMS_RATE_LIMIT_DELAY > 0) {
        await new Promise(resolve => setTimeout(resolve, SMS_RATE_LIMIT_DELAY));
      }
    } catch (error: any) {
      logger.error('Individual SMS send failed:', {
        recipient,
        error: error.message
      });
      results.push({
        recipient: formatPhoneNumber(recipient),
        message,
        sms_type: smsType,
        status: 'failed',
        external_id: undefined,
        sent_by: sentBy,
        error_message: error.message
      });
    }
  }

  return results;
};
 
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
      `INSERT INTO sms_logs (recipient, message, sms_type, status, external_id, sent_by, error_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [recipient, message, smsType, status, externalId || null, sentBy || null, errorMsg || null]
    );
    return result.rows[0];
  } catch (err) {
    logger.error('Failed to save SMS log', err);
    return { 
      recipient, 
      message, 
      sms_type: smsType, 
      status, 
      external_id: externalId, 
      sent_by: sentBy, 
      error_message: errorMsg 
    };
  }
}

/* ------------------------------------------------------------------ */
/* TextSMS Monitoring */
/* ------------------------------------------------------------------ */

export const testTextSmsConnection = async (): Promise<ConnectionTestResult> => {
  try {
    const smsClient = new TextSmsClient();
    const balanceResult = await smsClient.getBalance();
    
    return { 
      isActive: balanceResult.success, 
      balance: balanceResult.balance,
      status: balanceResult.success ? 'active' : 'inactive', 
      details: `Balance: ${balanceResult.balance} | API Connected: ${balanceResult.success}`
    };
  } catch (error: any) {
    return { 
      isActive: false, 
      status: 'inactive', 
      details: error.message 
    };
  }
};

export const getTextSmsBalance = async (): Promise<number> => {
  try {
    const smsClient = new TextSmsClient();
    const result = await smsClient.getBalance();
    return result.balance;
  } catch (error) {
    logger.error('Failed to get TextSMS balance:', error);
    return 0;
  }
};

export const testReplySystem = async (reply: SmsReply) => {
  try {
    const phone = formatPhoneNumber(reply.fromNumber);
    const message = reply.text.trim();
    const externalId = reply.textId;
    const replyTime = new Date(reply.timestamp);

    logger.info('📨 Processing test reply for TextSMS', {
      externalId,
      phone,
      messageLength: message.length
    });

    // First, try to find by external_id (TextSMS messageid)
    let result = await pool.query(
      `
      UPDATE sms_logs
      SET reply_received = true,
          reply_text = $1,
          reply_timestamp = $2,
          delivery_status = $3,
          delivered_at = COALESCE(delivered_at, CURRENT_TIMESTAMP),
          updated_at = CURRENT_TIMESTAMP
      WHERE external_id = $4
      RETURNING *
      `,
      [message, replyTime, reply.status || 'delivered', externalId]
    );

    // If not found by external_id, try by phone number
    if (result.rowCount === 0) {
      result = await pool.query(
        `
        UPDATE sms_logs
        SET reply_received = true,
            reply_text = $1,
            reply_timestamp = $2,
            delivery_status = $3,
            delivered_at = COALESCE(delivered_at, CURRENT_TIMESTAMP),
            updated_at = CURRENT_TIMESTAMP
        WHERE recipient = $4
        ORDER BY created_at DESC
        LIMIT 1
        RETURNING *
        `,
        [message, replyTime, reply.status || 'delivered', phone]
      );
    }

    if (result.rowCount === 0) {
      logger.warn('No matching SMS log found for test reply', { externalId, phone });
      
      // Create a new log entry if none found (for testing purposes)
      const newLog = await saveSmsLog(
        phone,
        `[Test Reply] Original message unknown`,
        'test',
        'sent',
        externalId,
        'test_system',
        undefined
      );
      
      // Update the new log with reply - FIXED: Use newLog.id safely
      if (newLog.id) {
        await pool.query(
          `
          UPDATE sms_logs
          SET reply_received = true,
              reply_text = $1,
              reply_timestamp = $2,
              delivery_status = $3,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $4
          `,
          [message, replyTime, reply.status || 'delivered', newLog.id]
        );
      }
      
      logger.info('✅ Created new test SMS log for reply', { externalId, phone });
      return { success: true, data: newLog, createdNew: true };
    }

    logger.info('✅ Test reply processed successfully', { 
      externalId, 
      phone, 
      text: message,
      rowsUpdated: result.rowCount 
    });
    
    return { success: true, data: result.rows[0], createdNew: false };

  } catch (error: any) {
    logger.error('❌ Failed to process test reply', {
      error: error.message,
      stack: error.stack
    });
    return { success: false, error: error.message };
  }
};

// Also add a helper function to simulate TextSMS webhook for testing
export const simulateTextSmsWebhook = async (
  messageId: string,
  mobile: string,
  message: string,
  status: string = 'delivered'
): Promise<{ processed: boolean; action?: string; message?: string }> => {
  const simulatedWebhook = {
    messageid: messageId,
    mobile: mobile,
    message: message,
    status: status,
    networkid: 'TestNetwork',
    timestamp: Date.now()
  };
  
  return await processTextSmsWebhook(simulatedWebhook);
};

/* ------------------------------------------------------------------ */
/* TextSMS Webhook Processing (No signature validation needed) */
/* ------------------------------------------------------------------ */

export const processTextSmsWebhook = async (
  body: any
): Promise<{ processed: boolean; action?: string; message?: string }> => {
  try {
    // TextSMS webhook format (based on their documentation)
    // Adjust based on actual webhook payload from TextSMS
    const { 
      messageid,      // TextSMS message ID
      mobile,         // Recipient number (254...)
      message,        // Message content
      status,         // Delivery status
      networkid,      // Network provider ID
      timestamp       // Timestamp
    } = body;

    if (!messageid || !mobile) {
      logger.warn('Invalid TextSMS webhook payload', body);
      return { 
        processed: false, 
        message: 'Invalid payload: missing messageid or mobile' 
      };
    }

    logger.info(`TextSMS webhook received`, {
      messageid,
      mobile,
      status,
      networkid,
      timestamp
    });

    // Update SMS log with delivery status
    if (status) {
      await updateDeliveryStatus(messageid, status, mobile);
    }

    // If it's a reply message (contains text)
    if (message && typeof message === 'string' && message.trim()) {
      return await processReplyMessage(mobile, message.trim(), messageid);
    }

    return {
      processed: true,
      action: 'delivery_update',
      message: `Delivery status updated: ${status}`
    };

  } catch (error: any) {
    logger.error('Failed to process TextSMS webhook', error);
    return {
      processed: false,
      message: `Error: ${error.message}`
    };
  }
};

// Added: Original processSmsWebhook function for backward compatibility
export const processSmsWebhook = async (
  body: any,
  headers: any,
  rawBody: string
): Promise<{ processed: boolean; action?: string; message?: string }> => {
  try {
    // This function now delegates to processTextSmsWebhook
    // We ignore headers and rawBody since TextSMS doesn't use signature validation
    return await processTextSmsWebhook(body);
  } catch (error: any) {
    logger.error('Failed to process SMS webhook', error);
    return {
      processed: false,
      message: `Error: ${error.message}`
    };
  }
};

async function updateDeliveryStatus(
  externalId: string, 
  status: string, 
  mobile: string
): Promise<void> {
  try {
    await query(
      `UPDATE sms_logs 
       SET delivery_status = $1,
           delivery_updated_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE external_id = $2 OR recipient = $3`,
      [status, externalId, mobile]
    );
  } catch (error) {
    logger.error('Failed to update delivery status:', error);
  }
}

async function processReplyMessage(
  phone: string,
  message: string,
  messageId: string
): Promise<{ processed: boolean; action?: string; message?: string }> {
  try {
    const userText = message.trim();
    const upperText = userText.toUpperCase();
    
    logger.info(`TextSMS reply received`, {
      messageId,
      phone,
      text: userText
    });

    // Update SMS log with reply
    await updateSmsLogWithReply(messageId, userText, phone);

    // Process based on message content
    let action = 'processed';
    
    switch (upperText) {
      case 'STOP':
        action = await handleUnsubscribe(phone);
        break;
        
      case 'JOIN':
      case 'START':
      case 'YES':
        action = await handleSubscribe(phone);
        break;
        
      case 'HELP':
      case 'INFO':
        action = await sendHelpMessage(phone);
        break;
        
      default:
        action = await handleLocationRequest(phone, upperText);
        break;
    }

    logger.info(`✅ TextSMS reply processed`, {
      action,
      phone,
      messageId
    });

    return {
      processed: true,
      action,
      message: `Reply processed: ${action}`
    };

  } catch (error: any) {
    logger.error('Failed to process reply message:', error);
    return {
      processed: false,
      message: `Error: ${error.message}`
    };
  }
}

async function updateSmsLogWithReply(
  externalId: string, 
  replyText: string,
  phone: string
): Promise<void> {
  try {
    await query(
      `UPDATE sms_logs 
       SET reply_received = true, 
           reply_text = $1, 
           reply_timestamp = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE external_id = $2 OR recipient = $3`,
      [replyText, externalId, phone]
    );
  } catch (error) {
    logger.error('Failed to update SMS log with reply:', error);
  }
}

/* ------------------------------------------------------------------ */
/* Subscription and Helper Functions (Keep as is, but update SMS sending) */
/* ------------------------------------------------------------------ */

async function handleUnsubscribe(phone: string): Promise<string> {
  const formattedPhone = formatPhoneNumber(phone);
  
  await query(
    `UPDATE sms_subscriptions 
     SET is_active = false, 
         updated_at = CURRENT_TIMESTAMP
     WHERE phone = $1`,
    [formattedPhone]
  );
  
  // Send confirmation via TextSMS
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
  
  // Send welcome message via TextSMS
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
/* Subscription Management Functions */
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

    // Send welcome message via TextSMS
    await sendSmsMessage(
      formattedPhone,
      `Welcome to AgriPrice! You are now tracking ${cropIds.length || 'all'} crops.\n\nYou will receive daily price updates.\n\nCommands:\n• Reply with location for prices\n• Reply STOP to unsubscribe\n• Reply HELP for info`,
      {
        smsType: 'subscription',
        ...(sentBy && { sentBy })
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
      await sendBulkSms(subscribers, message, 'price_alert', sentBy);
      
      logger.info(`✅ Price alert sent via TextSMS`, {
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
      await sendBulkSms(subscribers, message, 'daily_update', sentBy);
      
      logger.info(`✅ Daily update sent via TextSMS to ${subscribers.length} subscribers`);
    } else {
      logger.info('No active subscribers for daily update');
    }
  } catch (error) {
    logger.error('Failed to send daily price update:', error);
    throw new ApiError('Failed to send daily update', 500);
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
  processTextSmsWebhook,
  processSmsWebhook, // Original function for backward compatibility
  
  // Test functions
  testReplySystem,
  testTextSmsConnection,
  simulateTextSmsWebhook,
  
  // Subscription management
  subscribeUser,
  unsubscribeUser,
  getSubscribedNumbers,
  
  // Alerts
  sendPriceAlert,
  sendDailyPriceUpdate,
  
  // TextSMS specific
  getTextSmsBalance
};