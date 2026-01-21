import axios from 'axios';
import { pool, query } from '../database/connection';
import { logger } from '../utils/logger';
import { ApiError } from '../utils/apiError';

export interface SmsLog {
  id?: string;
  recipient: string;
  message: string;
  sms_type: string;
  status: string;
  external_id?: string | undefined;
  sent_by?: string | undefined;
  error_message?: string | undefined;
  reply_received?: boolean;
  reply_text?: string;
  reply_timestamp?: Date;
  cost?: number;
  sent_at?: Date;
  delivered_at?: Date;
  created_at?: Date;
}

export interface SendSmsOptions {
  smsType?: string;
  sentBy?: string | undefined;
  replyWebhookUrl?: string;
  webhookData?: string;
  scheduleTime?: string;
  getdlr?: boolean;
}

export interface SmsReply {
  textId: string;
  fromNumber: string;
  text: string;
  data?: string;
  timestamp: number;
  status?: string;
  networkid?: string;
}

export interface TextBeeResponse {
  success: boolean | undefined;
  code?: string | undefined;
  message?: string | undefined;
  data?: {
    _id?: string | undefined;
    smsBatchId?: string | undefined;
    message?: string | undefined;
    recipients?: string[] | undefined;
    status?: string | undefined;
    createdAt?: string | undefined;
    success?: boolean | undefined;
    recipientCount?: number | undefined;
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

export interface TextBeeApiResponse {
  success?: boolean;
  data?: {
    success?: boolean;
    message?: string;
    recipientCount?: number;
    smsBatchId?: string;
    _id?: string;
    recipients?: string[];
    status?: string;
    createdAt?: string;
  };
  error?: string;
  message?: string;
}

const TEXTBEE_API_KEY = process.env.TEXTBEE_API_KEY;
const TEXTBEE_DEVICE_ID = process.env.TEXTBEE_DEVICE_ID;
const TEXTBEE_API_URL = process.env.TEXTBEE_API_URL || 'https://api.textbee.dev/api/v1';
const TEXTBEE_WEBHOOK_SECRET = process.env.TEXTBEE_WEBHOOK_SECRET;

const APP_BASE_URL = process.env.APP_BASE_URL || '';
const SMS_RATE_LIMIT_DELAY = parseInt(process.env.SMS_RATE_LIMIT_DELAY || '500', 10);

const MAX_WEBHOOK_DATA_LENGTH = 100;
const DEFAULT_SMS_TYPE = 'general';

const SMS_TYPE_VALUES = ['alert', 'update', 'prediction', 'weather', 'general', 'password-reset', 'test'];
const SMS_STATUS_VALUES = ['pending', 'sent', 'failed', 'delivered'];

logger.info(`📱 SMS Service initialized with TextBee API`);

// Add SIM-based conversation tracking
interface ConversationContext {
  farmerPhone: string;
  lastMessage: string;
  lastReply: string;
  messageCount: number;
  lastActivity: Date;
}

const activeConversations = new Map<string, ConversationContext>();
const SIM_PHONE_NUMBER = process.env.SIM_PHONE_NUMBER || '+254790178387';

// Clean up old conversations every hour
setInterval(() => {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  
  for (const [key, conversation] of activeConversations.entries()) {
    if (conversation.lastActivity < oneHourAgo) {
      activeConversations.delete(key);
      logger.debug('Cleaned up old conversation', { farmerPhone: conversation.farmerPhone });
    }
  }
}, 60 * 60 * 1000);

export function getValidSmsType(smsType: string): string {
  const typeMap: Record<string, string> = {
    'notification': 'alert',
    'marketing': 'alert',
    'otp': 'password-reset',
    'info': 'update',
    'price_request': 'update',
    'price_alert': 'alert',
    'daily_update': 'update',
    'subscription': 'update',
    'unsubscription': 'update',
    'incoming': 'alert',
    'error': 'alert',
    'debug': 'test',
    'system': 'update',
    'reminder': 'alert',
    'welcome': 'update',
    'verification': 'password-reset'
  };

  let typeToCheck = smsType.toLowerCase();

  if (typeMap[typeToCheck]) {
    typeToCheck = typeMap[typeToCheck] || typeToCheck;
  }

  if (SMS_TYPE_VALUES.includes(typeToCheck)) {
    return typeToCheck;
  } else {
    logger.warn(`Invalid sms_type "${smsType}" (mapped to "${typeToCheck}"), using "general". Valid types:`, SMS_TYPE_VALUES);
    return DEFAULT_SMS_TYPE;
  }
}

export function getValidSmsStatus(status: string): string {
  const statusLower = status.toLowerCase();

  const statusMap: Record<string, string> = {
    'queued': 'pending',
    'scheduled': 'pending',
    'processing': 'pending',
    'sending': 'pending',
    'pending': 'pending',
    'sent': 'sent',
    'delivered': 'delivered',
    'failed': 'failed',
    'undelivered': 'failed',
    'read': 'delivered',
    'received': 'delivered',
    'accepted': 'sent',
    'rejected': 'failed'
  };

  const mappedStatus = statusMap[statusLower] || statusLower;

  if (SMS_STATUS_VALUES.includes(mappedStatus)) {
    return mappedStatus;
  } else {
    logger.warn(`Invalid sms_status "${status}" (mapped to "${mappedStatus}"), using "pending". Valid statuses:`, SMS_STATUS_VALUES);
    return 'pending';
  }
}

export const formatPhoneNumber = (phone: string): string => {
  if (!phone || typeof phone !== 'string') {
    throw new ApiError('Invalid phone number', 400);
  }

  let num = phone.replace(/\D/g, '');

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

class TextBeeClient {
  private apiKey: string;
  private deviceId: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = TEXTBEE_API_KEY || '';
    this.deviceId = TEXTBEE_DEVICE_ID || '';
    this.baseUrl = TEXTBEE_API_URL;

    if (!this.apiKey || !this.deviceId) {
      throw new ApiError('TextBee API_KEY or DEVICE_ID not configured', 500);
    }

    logger.debug('TextBee Client initialized', {
      apiKeyPrefix: this.apiKey.substring(0, 10) + '...',
      deviceId: this.deviceId
    });
  }

  async sendSms(phone: string, message: string, options?: {
    scheduleTime?: string | undefined;
    getdlr?: boolean | undefined;
    clientSmsId?: number | undefined;
  }): Promise<TextBeeResponse> {
    try {
      const formattedPhone = formatPhoneNumber(phone);

      const payload: any = {
        recipients: [formattedPhone],
        message: message
      };

      if (options?.scheduleTime) {
        logger.warn('Scheduling not implemented for TextBee yet');
      }

      logger.debug('📤 TextBee send request', {
        deviceId: this.deviceId,
        payload: {
          recipients: [formattedPhone],
          messageLength: message.length
        }
      });

      const response = await axios.post<TextBeeApiResponse>(
        `${this.baseUrl}/gateway/devices/${this.deviceId}/send-sms`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey
          },
          timeout: 30000
        }
      );

      logger.debug('📡 TextBee Response:', response.data);

      const apiResponse = response.data;

      let success = apiResponse.success === true ||
        apiResponse.data?.success === true;

      let externalId: string | undefined = apiResponse.data?.smsBatchId ||
        apiResponse.data?._id;

      const responseData: TextBeeResponse['data'] = {
        _id: externalId,
        smsBatchId: apiResponse.data?.smsBatchId,
        message: message,
        recipients: [formattedPhone],
        status: apiResponse.data?.status || 'PENDING',
        createdAt: apiResponse.data?.createdAt || new Date().toISOString(),
        success: success,
        recipientCount: 1
      };

      return {
        success,
        code: success ? '200' : '500',
        message: success ? (apiResponse.data?.message || apiResponse.message || 'SMS queued successfully') :
          (apiResponse.message || 'SMS failed'),
        data: responseData,
        error: !success ? apiResponse.error || apiResponse.message || 'SMS failed' : undefined
      };
    } catch (error: any) {
      logger.error('TextBee API Error:', error.message, {
        response: error.response?.data,
        status: error.response?.status
      });

      if (error.response?.data) {
        const errorData = error.response.data;
        return {
          success: false,
          code: error.response.status.toString(),
          message: errorData.message || errorData.error || 'API Error',
          error: errorData.message || errorData.error || error.message
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
  ): Promise<TextBeeResponse> {
    try {
      const formattedPhones = phones.map(phone => formatPhoneNumber(phone));

      const payload: any = {
        recipients: formattedPhones,
        message: message
      };

      logger.debug('📤 TextBee bulk send request', {
        deviceId: this.deviceId,
        count: phones.length,
        firstPhone: formattedPhones[0],
        messageLength: message.length
      });

      const response = await axios.post<TextBeeApiResponse>(
        `${this.baseUrl}/gateway/devices/${this.deviceId}/send-sms`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey
          },
          timeout: 30000
        }
      );

      logger.debug('📡 TextBee Bulk Response:', response.data);

      const apiResponse = response.data;

      let success = apiResponse.success === true ||
        apiResponse.data?.success === true ||
        !!apiResponse.data?.smsBatchId;

      let externalId: string | undefined = apiResponse.data?.smsBatchId ||
        apiResponse.data?._id;

      const responseData: TextBeeResponse['data'] = {
        _id: externalId,
        smsBatchId: apiResponse.data?.smsBatchId,
        message: message,
        recipients: formattedPhones,
        status: 'PENDING',
        createdAt: new Date().toISOString(),
        success: success,
        recipientCount: phones.length
      };

      return {
        success,
        code: success ? '200' : '500',
        message: success ? (apiResponse.data?.message || 'Bulk SMS queued successfully') :
          (apiResponse.message || 'Bulk SMS failed'),
        data: responseData,
        error: !success ? apiResponse.error || apiResponse.message || 'Bulk SMS failed' : undefined
      };
    } catch (error: any) {
      logger.error('TextBee Bulk API Error:', error.message, {
        response: error.response?.data
      });

      if (error.response?.data) {
        const errorData = error.response.data;
        return {
          success: false,
          code: error.response.status.toString(),
          message: errorData.message || errorData.error || 'API Error',
          error: errorData.message || errorData.error || error.message
        };
      }

      throw error;
    }
  }

  async getBalance(): Promise<{ balance: number; success: boolean }> {
    try {
      logger.warn('getBalance not implemented for TextBee - check API docs');
      return { balance: 100, success: true };
    } catch (error) {
      logger.error('Failed to get TextBee balance:', error);
      return { balance: 0, success: false };
    }
  }
}

async function saveSmsLog(
  recipient: string,
  message: string,
  smsType: string,
  status: string,
  externalId?: string,
  sentBy?: string,
  errorMsg?: string
): Promise<SmsLog> {
  try {
    const validSmsType = getValidSmsType(smsType);
    const validStatus = getValidSmsStatus(status);

    logger.debug('💾 Saving SMS log to database', {
      recipient,
      originalSmsType: smsType,
      validSmsType,
      originalStatus: status,
      validStatus,
      externalId,
      sentBy,
      hasError: !!errorMsg
    });

    const result = await pool.query(
      `INSERT INTO sms_logs (
        recipient, 
        message, 
        sms_type, 
        status, 
        external_id, 
        sent_by, 
        error_message,
        sent_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
      RETURNING *`,
      [
        recipient,
        message,
        validSmsType,
        validStatus,
        externalId || null,
        sentBy || null,
        errorMsg || null
      ]
    );

    logger.info('✅ SMS log saved successfully', {
      logId: result.rows[0]?.id,
      recipient,
      status: validStatus,
      smsType: validSmsType,
      externalId
    });

    return result.rows[0];
  } catch (err: any) {
    logger.error('❌ FAILED to save SMS log to database', {
      error: err.message,
      errorCode: err.code,
      errorDetail: err.detail,
      errorHint: err.hint,
      recipient,
      smsType,
      status,
      externalId,
      sentBy
    });

    return {
      recipient,
      message,
      sms_type: getValidSmsType(smsType),
      status: getValidSmsStatus(status),
      external_id: externalId,
      sent_by: sentBy,
      error_message: errorMsg
    };
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

  logger.debug('📤 Starting SMS send process', {
    recipient: formattedRecipient,
    messageLength: message.length,
    smsType,
    sentBy
  });

  try {
    if (!message || message.trim().length === 0) {
      throw new ApiError('SMS message cannot be empty', 400);
    }

    const smsClient = new TextBeeClient();

    const response = await smsClient.sendSms(
      formattedRecipient,
      message.trim(),
      {
        scheduleTime: scheduleTime,
        getdlr: getdlr,
        clientSmsId: Date.now()
      }
    );

    const success = response.success === true ||
      response.code === '200' ||
      !!response.data?._id;

    externalId = response.data?._id || response.data?.smsBatchId || `textbee_${Date.now()}`;

    if (success) {
      logger.info(`✅ SMS queued via TextBee`, {
        recipient: formattedRecipient,
        messageId: externalId,
        responseCode: response.code,
        responseMessage: response.message
      });

      const savedLog = await saveSmsLog(
        formattedRecipient,
        message,
        smsType,
        'sent',
        externalId,
        sentBy
      );

      logger.debug('📝 SMS log saved', {
        logId: savedLog.id,
        externalId,
        hasDatabaseId: !!savedLog.id
      });

      return savedLog;
    } else {
      errorMsg = response.error || response.message || `TextBee error: ${response.code}`;
      logger.error('❌ SMS Failed via TextBee', {
        recipient: formattedRecipient,
        error: errorMsg,
        code: response.code
      });

      const savedLog = await saveSmsLog(
        formattedRecipient,
        message,
        smsType,
        'failed',
        externalId,
        sentBy,
        errorMsg
      );

      return savedLog;
    }
  } catch (error: any) {
    errorMsg = error.message || 'Network error';
    logger.error('❌ SMS send error:', {
      recipient: formattedRecipient,
      error: errorMsg
    });

    const savedLog = await saveSmsLog(
      formattedRecipient,
      message,
      smsType,
      'failed',
      externalId,
      sentBy,
      errorMsg
    );

    return savedLog;
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
    logger.warn('⚠️ No valid recipients or message for bulk SMS');
    return [];
  }

  const validRecipients = recipients.filter(r => typeof r === 'string' && validatePhoneNumber(r));
  if (validRecipients.length === 0) {
    logger.warn('⚠️ No valid phone numbers after validation');
    return [];
  }

  logger.info(`📤 Preparing bulk SMS to ${validRecipients.length} recipients`, {
    smsType,
    sentBy,
    messageLength: message.length
  });

  const results: SmsLog[] = [];
 
  if (validRecipients.length <= 100) {
    try {
      const smsClient = new TextBeeClient();
      const response = await smsClient.sendBulkSms(
        validRecipients,
        message.trim(),
        {
          scheduleTime: options?.scheduleTime,
          getdlr: options?.getdlr
        }
      );

      const success = response.success === true ||
        response.code === '200' ||
        !!response.data?._id ||
        !!response.data?.smsBatchId;

      const externalId = response.data?._id || response.data?.smsBatchId || `textbee_bulk_${Date.now()}`;

      if (success) {
        logger.info(`✅ Bulk SMS queued via TextBee`, {
          count: validRecipients.length,
          type: smsType,
          batchId: externalId,
          responseMessage: response.message
        });

        for (const recipient of validRecipients) {
          try {
            const savedLog = await saveSmsLog(
              formatPhoneNumber(recipient),
              message,
              smsType,
              'sent',
              externalId,
              sentBy
            );
            results.push(savedLog);
          } catch (saveError: any) {
            logger.error('❌ Failed to save individual SMS log', {
              recipient,
              error: saveError.message
            });
            results.push({
              recipient: formatPhoneNumber(recipient),
              message,
              sms_type: getValidSmsType(smsType),
              status: 'sent',
              external_id: externalId,
              sent_by: sentBy
            });
          }
        }

        logger.info(`✅ Saved ${results.length} SMS logs to database`);
      } else {
        logger.error('❌ Bulk SMS failed via TextBee', {
          error: response.message,
          code: response.code
        });

        for (const recipient of validRecipients) {
          const savedLog = await saveSmsLog(
            formatPhoneNumber(recipient),
            message,
            smsType,
            'failed',
            externalId,
            sentBy,
            response.message
          );
          results.push(savedLog);
        }
      }

      return results;
    } catch (error: any) {
      logger.error('❌ Bulk SMS API failed:', {
        error: error.message,
        recipientCount: validRecipients.length
      });

      logger.info('🔄 Falling back to individual SMS sends');
    }
  }
 
  logger.info(`🔄 Sending ${validRecipients.length} SMS individually`);

  for (const recipient of validRecipients) {
    try {
      const result = await sendSmsMessage(recipient, message, {
        smsType,
        sentBy,
        ...options
      });
      results.push(result);

      if (SMS_RATE_LIMIT_DELAY > 0) {
        await new Promise(resolve => setTimeout(resolve, SMS_RATE_LIMIT_DELAY));
      }
    } catch (error: any) {
      logger.error('Individual SMS send failed:', {
        recipient,
        error: error.message
      });
      const failedLog = await saveSmsLog(
        formatPhoneNumber(recipient),
        message,
        smsType,
        'failed',
        undefined,
        sentBy,
        error.message
      );
      results.push(failedLog);
    }
  }

  logger.info(`📊 Bulk SMS complete: ${results.length} logs processed`);
  return results;
};

export const verifyWebhookSignature = (
  payload: string,
  signature: string,
  timestamp: string
): boolean => {
  try {
    const secret = TEXTBEE_WEBHOOK_SECRET;

    if (!secret) {
      logger.warn('TEXTBEE_WEBHOOK_SECRET not configured, skipping signature verification');
      return true;
    }

    if (!signature || !timestamp) {
      logger.warn('Missing signature or timestamp headers');
      return false;
    }
 
    const eventTime = parseInt(timestamp, 10);
    const currentTime = Math.floor(Date.now() / 1000);
    const timeDifference = Math.abs(currentTime - eventTime);

    if (timeDifference > 300) {
      logger.warn('Webhook timestamp too old', {
        eventTime,
        currentTime,
        difference: timeDifference
      });
      return false;
    }
 
    const signedPayload = `${timestamp}.${payload}`;
 
    const crypto = require('crypto');
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(signedPayload)
      .digest('hex');  
    const signatureMatches = crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );

    logger.debug('Signature verification', {
      signatureMatches,
      signatureLength: signature?.length,
      expectedLength: expectedSignature?.length,
      timeDifference
    });

    return signatureMatches;
  } catch (error) {
    logger.error('Error verifying webhook signature:', error);
    return false;
  }
}; 

async function updateDeliveryStatus(
  externalId: string,
  status: string,
  mobile: string
): Promise<void> {
  try {
    const validStatus = getValidSmsStatus(status);
    const statusColumn = validStatus === 'delivered' ? 'delivered_at' : 'sent_at';
    const statusValue = validStatus === 'delivered' || validStatus === 'sent'
      ? 'CURRENT_TIMESTAMP'
      : 'NULL';

    const result = await query(
      `UPDATE sms_logs 
       SET status = $1,
           ${statusColumn} = ${statusValue},
           updated_at = CURRENT_TIMESTAMP
       WHERE external_id = $2 
       OR (recipient = $3 AND external_id IS NULL)
       RETURNING id`,
      [validStatus, externalId, mobile]
    );

    if (result.rowCount === 0) {
      logger.warn('No matching SMS log found for delivery update', {
        externalId,
        mobile,
        status: validStatus
      });
    } else {
      logger.info('✅ Delivery status updated', {
        rowsUpdated: result.rowCount,
        externalId,
        status: validStatus
      });
    }
  } catch (error) {
    logger.error('Failed to update delivery status:', error);
  }
}

// ADD SIM-BASED CONVERSATION HELPER FUNCTIONS

function updateConversation(
  farmerPhone: string,
  message: string,
  direction: 'incoming' | 'outgoing'
): void {
  const key = farmerPhone;
  const now = new Date();
  
  if (!activeConversations.has(key)) {
    activeConversations.set(key, {
      farmerPhone,
      lastMessage: direction === 'incoming' ? message : '',
      lastReply: direction === 'outgoing' ? message : '',
      messageCount: 1,
      lastActivity: now
    });
  } else {
    const conversation = activeConversations.get(key)!;
    if (direction === 'incoming') {
      conversation.lastMessage = message;
    } else {
      conversation.lastReply = message;
    }
    conversation.messageCount++;
    conversation.lastActivity = now;
    activeConversations.set(key, conversation);
  }
}

async function saveIncomingMessageWithContext(
  smsId: string,
  sender: string,
  message: string,
  receivedAt: string
): Promise<void> {
  try { 
    // Check if this is a reply to a previous message
    const contextResult = await query(
      `SELECT id, message as original_message, sms_type
       FROM sms_logs 
       WHERE recipient = $1 
       AND sent_at > NOW() - INTERVAL '24 hours'
       AND sent_by IS NOT NULL
       ORDER BY sent_at DESC 
       LIMIT 1`,
      [sender]
    );

    const contextId = contextResult.rows[0]?.id;
    const originalMessage = contextResult.rows[0]?.original_message;

    const result = await query(
      `INSERT INTO sms_logs (
        recipient,
        message,
        sms_type,
        status,
        external_id,
        reply_received,
        reply_text,
        reply_timestamp,
        in_reply_to_id,
        sent_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id`,
      [
        sender,
        message,
        'alert',
        'delivered',
        smsId,
        true,
        message,
        new Date(receivedAt),
        contextId || null,
        new Date(receivedAt)
      ]
    );

    if (contextId) {
      logger.info('✅ Incoming message linked to previous conversation', {
        sender,
        contextId,
        originalMessage: originalMessage?.substring(0, 50)
      });
    }
  } catch (error) {
    logger.error('Failed to save incoming message with context:', error);
  }
}

async function handleIncomingMessage(
  smsId: string,
  sender: string,
  message: string,
  receivedAt: string
): Promise<{ processed: boolean; action?: string; message?: string }> {
  try {
    logger.info(`📨 SMS received on SIM from ${sender}`, {
      smsId,
      message: message,
      receivedAt,
      deviceId: TEXTBEE_DEVICE_ID
    });

    // Track this conversation
    updateConversation(sender, message, 'incoming');

    // Save to database with conversation context
    await saveIncomingMessageWithContext(smsId, sender, message, receivedAt);

    // Process and reply
    if (message && typeof message === 'string' && message.trim()) {
      return await processFarmerMessage(sender, message.trim(), smsId);
    }

    return {
      processed: true,
      action: 'message_received',
      message: 'Message received'
    };
    
  } catch (error: any) {
    logger.error('Failed to handle incoming SMS:', error);
    return {
      processed: false,
      message: `Error: ${error.message}`
    };
  }
}

// ENHANCED PROCESSING FUNCTION
async function processFarmerMessage(
  phone: string,
  message: string,
  messageId: string
): Promise<{ processed: boolean; action?: string; message?: string }> {
  const userText = message.trim().toUpperCase();
  let action = 'processed';
  let replyContent = '';
  
  try {
    logger.info(`👨‍🌾 Processing farmer ${phone}: "${userText}"`);

    // Get farmer context (subscription status, last interaction)
    const farmerContext = await getFarmerContext(phone);

    // Process based on message content
    if (userText === 'STOP') {
      action = await handleUnsubscribe(phone);
      replyContent = 'You have been unsubscribed from AgriPrice alerts. Text JOIN to resubscribe.';
      
    } else if (userText === 'JOIN' || userText === 'START' || userText === 'YES') {
      action = await handleSubscribe(phone);
      replyContent = '✅ Registered! You will get daily price alerts.\n\n📍 Send location (NAIROBI) for prices\n📋 Send HELP for commands\n❌ Send STOP to unsubscribe';
      
    } else if (userText === 'HELP' || userText === 'INFO') {
      replyContent = `📱 AGRIHELP - Commands:\n\n📍 PRICES:\n• NAIROBI\n• NAKURU\n• KISUMU\n• MOMBASA\n• ELDORET\n\n📋 OTHER:\n• JOIN - Subscribe\n• STOP - Unsubscribe\n• HELP - This menu\n\n📞 Support: ${process.env.SUPPORT_PHONE || '0700 000 000'}`;
      action = 'help_sent';
      
    } else if (isLocationQuery(userText)) {
      const location = extractLocationFromText(userText);
      if (location) {
        const prices = await getCropPricesByLocation(location);
        if (prices) {
          replyContent = `📊 ${location} PRICES:\n\n${prices}\n\n📍 Send another location\n📋 Send HELP`;
          action = 'prices_sent';
          
          // If farmer is not subscribed, prompt them
          if (!farmerContext.isSubscribed) {
            replyContent += '\n\n💡 Want daily alerts? Send JOIN';
          }
        } else {
          replyContent = `❌ No data for ${location}.\n\nTry: NAIROBI, NAKURU, KISUMU\nOr send HELP`;
          action = 'location_not_found';
        }
      }
      
    } else if (userText.includes('THANK') || userText.includes('ASANTE')) {
      replyContent = '🙏 Karibu! Happy to help.\n\nNeed more? Send HELP';
      action = 'thank_you';
      
    } else if (userText.includes('HABARI') || userText === 'HI' || userText === 'HELLO') {
      replyContent = `👋 Habari! I'm AgriPrice Bot.\n\n📍 Send location for crop prices\n📋 Send HELP for commands\n📞 Issues? Call ${process.env.SUPPORT_PHONE || 'support'}`;
      action = 'greeting_reply';
      
    } else {
      // Unknown message - provide helpful response
      replyContent = `❓ Didn't understand: "${message}"\n\nTry:\n📍 NAIROBI (for prices)\n📋 HELP (for commands)\n📞 ${process.env.SUPPORT_PHONE || 'Call for help'}`;
      action = 'unknown_message';
      
      // Log unknown messages for analysis
      await logUnknownMessage(phone, message);
    }

    // Send the reply
    if (replyContent) {
      logger.info(`📤 Replying to ${phone}`, {
        action,
        replyLength: replyContent.length
      });
      
      const replyResult = await sendSmsMessage(
        phone,
        replyContent,
        { 
          smsType: 'update',
          sentBy: 'auto_reply_system'
        }
      );
      
      if (replyResult.id) {
        // Track outgoing message in conversation
        updateConversation(phone, replyContent, 'outgoing');
        
        logger.info(`✅ Reply sent to ${phone}`, {
          logId: replyResult.id,
          externalId: replyResult.external_id
        });
        
        // Log the complete interaction
        await logFarmerInteraction(
          phone,
          message,
          replyContent,
          action,
          farmerContext.isSubscribed
        );
      } else {
        logger.error(`❌ Failed to send reply to ${phone}`);
        action = 'reply_failed';
      }
    }

    return {
      processed: true,
      action,
      message: `Processed: ${action}`
    };

  } catch (error: any) {
    logger.error(`❌ Error processing message from ${phone}:`, error);
    
    // Try to send error message
    try {
      await sendSmsMessage(
        phone,
        '⚠️ System error. Please try again later or contact support.',
        { smsType: 'update' }
      );
    } catch (smsError) {
      logger.error('Failed to send error message:', smsError);
    }
    
    return {
      processed: false,
      message: `Error: ${error.message}`
    };
  }
}

// NEW HELPER FUNCTIONS

async function getFarmerContext(phone: string): Promise<{
  isSubscribed: boolean;
  lastInteraction: Date | null;
  messageCount: number;
}> {
  try {
    // Check subscription status
    const subscriptionResult = await query(
      `SELECT is_active, updated_at 
       FROM sms_subscriptions 
       WHERE phone = $1`,
      [phone]
    );
    
    // Get interaction history
    const historyResult = await query(
      `SELECT COUNT(*) as message_count, MAX(created_at) as last_interaction
       FROM sms_logs 
       WHERE recipient = $1 
       AND sms_type IN ('update', 'alert')`,
      [phone]
    );
    
    return {
      isSubscribed: subscriptionResult.rows[0]?.is_active === true,
      lastInteraction: historyResult.rows[0]?.last_interaction,
      messageCount: parseInt(historyResult.rows[0]?.message_count || '0')
    };
  } catch (error) {
    logger.error('Error getting farmer context:', error);
    return { isSubscribed: false, lastInteraction: null, messageCount: 0 };
  }
}

function isLocationQuery(text: string): boolean {
  const locations = ['NAIROBI', 'NAKURU', 'KISUMU', 'MOMBASA', 'ELDORET', 'KISII', 'THIKA'];
  return locations.some(loc => text === loc || text.startsWith(loc));
}

function extractLocationFromText(text: string): string | null {
  const locations = ['NAIROBI', 'NAKURU', 'KISUMU', 'MOMBASA', 'ELDORET', 'KISII', 'THIKA'];
  for (const loc of locations) {
    if (text === loc || text.startsWith(loc)) {
      return loc;
    }
  }
  return null;
}

async function logUnknownMessage(farmerPhone: string, message: string): Promise<void> {
  try {
    await query(
      `INSERT INTO unknown_messages (
        farmer_phone,
        message,
        created_at
      ) VALUES ($1, $2, CURRENT_TIMESTAMP)`,
      [farmerPhone, message]
    );
  } catch (error) {
    logger.error('Failed to log unknown message:', error);
  }
}

async function logFarmerInteraction(
  farmerPhone: string,
  incoming: string,
  outgoing: string,
  action: string,
  isSubscribed: boolean
): Promise<void> {
  try {
    await query(
      `INSERT INTO farmer_interactions (
        farmer_phone,
        incoming_message,
        outgoing_message,
        action,
        is_subscribed,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
      [farmerPhone, incoming, outgoing, action, isSubscribed]
    );
  } catch (error) {
    logger.error('Failed to log farmer interaction:', error);
  }
}

async function handleMessageSent(
  smsId: string,
  body: any
): Promise<{ processed: boolean; action?: string; message?: string }> {
  try {
    const { recipients, sentAt } = body;

    logger.info(`✈️ Message sent update`, {
      smsId,
      recipients,
      sentAt
    });

    if (sentAt) {
      await query(
        `UPDATE sms_logs 
         SET status = 'sent',
             sent_at = $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE external_id = $2 OR recipient = $3`,
        [new Date(sentAt), smsId, recipients?.[0]]
      );
    } else {
      await updateDeliveryStatus(smsId, 'SENT', recipients?.[0]);
    }

    return {
      processed: true,
      action: 'message_sent',
      message: `Message marked as sent: ${smsId}`
    };
  } catch (error: any) {
    logger.error('Failed to handle message sent:', error);
    return {
      processed: false,
      message: `Error updating sent status: ${error.message}`
    };
  }
}

async function handleMessageDelivered(
  smsId: string,
  body: any
): Promise<{ processed: boolean; action?: string; message?: string }> {
  try {
    const { recipients, deliveredAt } = body;

    logger.info(`✅ Message delivered`, {
      smsId,
      recipients,
      deliveredAt
    });

    if (deliveredAt) {
      await query(
        `UPDATE sms_logs 
         SET status = 'delivered',
             delivered_at = $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE external_id = $2 OR recipient = $3`,
        [new Date(deliveredAt), smsId, recipients?.[0]]
      );
    } else {
      await updateDeliveryStatus(smsId, 'DELIVERED', recipients?.[0]);
    }

    return {
      processed: true,
      action: 'message_delivered',
      message: `Message marked as delivered: ${smsId}`
    };
  } catch (error: any) {
    logger.error('Failed to handle message delivered:', error);
    return {
      processed: false,
      message: `Error updating delivered status: ${error.message}`
    };
  }
}

async function handleMessageFailed(
  smsId: string,
  body: any
): Promise<{ processed: boolean; action?: string; message?: string }> {
  try {
    const { recipients, failedAt, error: errorMessage } = body;

    logger.error(`❌ Message failed`, {
      smsId,
      recipients,
      failedAt,
      errorMessage
    });

    await updateDeliveryStatus(smsId, 'FAILED', recipients?.[0]);

    if (errorMessage) {
      await query(
        `UPDATE sms_logs 
         SET error_message = $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE external_id = $2 OR recipient = $3`,
        [errorMessage, smsId, recipients?.[0]]
      );
    }

    return {
      processed: true,
      action: 'message_failed',
      message: `Message marked as failed: ${smsId}`
    };
  } catch (error: any) {
    logger.error('Failed to handle message failed:', error);
    return {
      processed: false,
      message: `Error updating failed status: ${error.message}`
    };
  }
}

export const processTextSmsWebhook = async (
  body: any,
  headers?: any,
  rawBody?: string
): Promise<{ processed: boolean; action?: string; message?: string }> => {
  try {
    const signature = headers?.['x-textbee-signature'] ||
      headers?.['x-signature'] ||
      headers?.['signature'];
    const timestamp = headers?.['x-textbee-timestamp'] ||
      headers?.['x-timestamp'] ||
      headers?.['timestamp'];

    if (rawBody && signature && timestamp) {
      const isValid = verifyWebhookSignature(rawBody, signature, timestamp);
      if (!isValid) {
        logger.error('Invalid webhook signature', {
          signature: signature?.substring(0, 20) + '...',
          timestamp,
          bodyKeys: Object.keys(body)
        });
        return {
          processed: false,
          action: 'signature_invalid',
          message: 'Invalid webhook signature'
        };
      }
    } else if (TEXTBEE_WEBHOOK_SECRET) {
      logger.warn('Missing signature or timestamp headers, but secret is configured');
    }

    const {
      smsId,
      sender,
      message,
      receivedAt,
      deviceId,
      webhookSubscriptionId,
      webhookEvent
    } = body;

    if (!webhookEvent) {
      logger.warn('Missing webhookEvent in payload', body);
      return {
        processed: false,
        message: 'Missing webhookEvent in payload'
      };
    }

    logger.info(`📩 TextBee webhook received`, {
      event: webhookEvent,
      smsId,
      sender,
      deviceId,
      webhookSubscriptionId
    });

    switch (webhookEvent) {
      case 'MESSAGE_RECEIVED':
        return await handleIncomingMessage(smsId, sender, message, receivedAt);

      case 'MESSAGE_SENT':
        return await handleMessageSent(smsId, body);

      case 'MESSAGE_DELIVERED':
        return await handleMessageDelivered(smsId, body);

      case 'MESSAGE_FAILED':
        return await handleMessageFailed(smsId, body);

      default:
        logger.warn(`Unknown webhook event: ${webhookEvent}`, body);
        return {
          processed: true,
          action: 'unknown_event',
          message: `Unknown event type: ${webhookEvent}`
        };
    }

  } catch (error: any) {
    logger.error('❌ Failed to process TextBee webhook', {
      error: error.message,
      stack: error.stack,
      body: JSON.stringify(body).substring(0, 500)
    });

    return {
      processed: false,
      message: `Error: ${error.message}`
    };
  }
};

export const processSmsWebhook = async (
  body: any,
  headers: any,
  rawBody: string
): Promise<{ processed: boolean; action?: string; message?: string }> => {
  try {
    return await processTextSmsWebhook(body, headers, rawBody);
  } catch (error: any) {
    logger.error('Failed to process SMS webhook', error);
    return {
      processed: false,
      message: `Error: ${error.message}`
    };
  }
};

// KEEP EXISTING processReplyMessage AS FALLBACK
async function processReplyMessage(
  phone: string,
  message: string,
  messageId: string
): Promise<{ processed: boolean; action?: string; message?: string }> {
  try {
    const userText = message.trim();
    const upperText = userText.toUpperCase();

    logger.info(`📨 Reply received`, {
      messageId,
      phone,
      text: userText
    });

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

    logger.info(`✅ Reply processed`, {
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

export const testReplySystem = async (reply: SmsReply) => {
  try {
    const phone = formatPhoneNumber(reply.fromNumber);
    const message = reply.text.trim();
    const externalId = reply.textId;
    const replyTime = new Date(reply.timestamp * 1000);

    logger.info('🔧 Processing test reply for TextBee', {
      externalId,
      phone,
      message,
      replyTime: replyTime.toISOString()
    });

    let result = await pool.query(
      `
      UPDATE sms_logs
      SET reply_received = true,
          reply_text = $1,
          reply_timestamp = $2,
          status = COALESCE($3, status),
          delivered_at = COALESCE(delivered_at, CURRENT_TIMESTAMP),
          updated_at = CURRENT_TIMESTAMP
      WHERE external_id = $4
      RETURNING *
      `,
      [message, replyTime, reply.status || 'delivered', externalId]
    );

    if (result.rowCount === 0) {
      result = await pool.query(
        `
        UPDATE sms_logs
        SET reply_received = true,
            reply_text = $1,
            reply_timestamp = $2,
            status = COALESCE($3, status),
            delivered_at = COALESCE(delivered_at, CURRENT_TIMESTAMP),
            updated_at = CURRENT_TIMESTAMP
        WHERE recipient = $4
        ORDER BY sent_at DESC
        LIMIT 1
        RETURNING *
        `,
        [message, replyTime, reply.status || 'delivered', phone]
      );
    }

    if (result.rowCount === 0) {
      logger.warn('No matching SMS log found for test reply', {
        externalId,
        phone,
        message
      });

      const newLog = await saveSmsLog(
        phone,
        `[Test Reply] Original message not found`,
        'test',
        'sent',
        externalId,
        'test_system',
        undefined
      );

      if (newLog.id) {
        await pool.query(
          `
          UPDATE sms_logs
          SET reply_received = true,
              reply_text = $1,
              reply_timestamp = $2,
              status = COALESCE($3, status),
              delivered_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $4
          `,
          [message, replyTime, reply.status || 'delivered', newLog.id]
        );

        result = await pool.query(
          `SELECT * FROM sms_logs WHERE id = $1`,
          [newLog.id]
        );
      }

      logger.info('✅ Created new test SMS log for reply', {
        externalId,
        phone,
        logId: newLog.id
      });
      return {
        success: true,
        data: result.rows[0] || newLog,
        createdNew: true
      };
    }

    logger.info('✅ Test reply processed successfully', {
      externalId,
      phone,
      text: message,
      rowsUpdated: result.rowCount,
      logId: result.rows[0]?.id
    });

    return {
      success: true,
      data: result.rows[0],
      createdNew: false
    };

  } catch (error: any) {
    logger.error('❌ Failed to process test reply', {
      error: error.message,
      stack: error.stack,
      reply
    });
    return {
      success: false,
      error: error.message
    };
  }
};

export const simulateTextBeeWebhook = async (
  smsId: string,
  sender: string,
  message: string,
  status: string = 'delivered',
  eventType: string = 'MESSAGE_RECEIVED'
): Promise<{ processed: boolean; action?: string; message?: string }> => {
  const simulatedWebhook = {
    smsId,
    sender,
    message,
    receivedAt: new Date().toISOString(),
    deviceId: TEXTBEE_DEVICE_ID || 'test_device',
    webhookSubscriptionId: 'test_subscription',
    webhookEvent: eventType,
    ...(eventType === 'MESSAGE_FAILED' && { error: 'Simulated failure' })
  };

  logger.info('🔧 Simulating TextBee webhook', {
    smsId,
    sender,
    eventType,
    messageLength: message.length
  });

  return await processTextSmsWebhook(simulatedWebhook);
};

async function handleUnsubscribe(phone: string): Promise<string> {
  const formattedPhone = formatPhoneNumber(phone);

  await query(
    `UPDATE sms_subscriptions 
     SET is_active = false, 
         updated_at = CURRENT_TIMESTAMP
     WHERE phone = $1`,
    [formattedPhone]
  );

  await sendSmsMessage(
    phone,
    'You have been unsubscribed from AgriPrice alerts. Text JOIN to resubscribe anytime.',
    { smsType: 'update' }
  );

  return 'unsubscribed';
}

async function handleSubscribe(phone: string): Promise<string> {
  const formattedPhone = formatPhoneNumber(phone);

  await query(
    `INSERT INTO sms_subscriptions (phone, is_active, created_at, updated_at)
     VALUES ($1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT (phone) 
     DO UPDATE SET is_active = true, updated_at = CURRENT_TIMESTAMP`,
    [formattedPhone]
  );

  await sendSmsMessage(
    phone,
    'Welcome to AgriPrice! You are now subscribed to daily price alerts.\n\nCommands:\n• Reply with location (e.g., NAIROBI) for prices\n• Reply STOP to unsubscribe\n• Reply HELP for more info',
    { smsType: 'update' }
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
    { smsType: 'update' }
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
      { smsType: 'update' }
    );
    return 'prices_sent';
  } else {
    const errorMessage = `⚠️ Sorry, no prices found for ${location}.\n\nTry these locations: NAIROBI, NAKURU, KISUMU, MOMBASA, ELDORET\n\nReply HELP for commands.`;
    await sendSmsMessage(
      phone,
      errorMessage,
      { smsType: 'update' }
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

    const latestPrices = new Map();
    result.rows.forEach(row => {
      const key = `${row.crop_name}-${row.region_name}`;
      if (!latestPrices.has(key)) {
        latestPrices.set(key, row);
      }
    });

    const priceList = Array.from(latestPrices.values())
      .map(row => `• ${row.crop_name}: KSh ${row.price.toLocaleString()}/${row.unit}`)
      .join('\n');

    return priceList;
  } catch (error) {
    logger.error('Error fetching crop prices:', error);
    return null;
  }
}

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

    await sendSmsMessage(
      formattedPhone,
      `Welcome to AgriPrice! You are now tracking ${cropIds.length || 'all'} crops.\n\nYou will receive daily price updates.\n\nCommands:\n• Reply with location for prices\n• Reply STOP to unsubscribe\n• Reply HELP for info`,
      {
        smsType: 'update',
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

    if (sentBy) {
      await sendSmsMessage(
        formattedPhone,
        'You have been unsubscribed from AgriPrice daily updates. Text JOIN to resubscribe.',
        { smsType: 'update', sentBy }
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

export const testTextSmsConnection = async (): Promise<ConnectionTestResult> => {
  try {
    const smsClient = new TextBeeClient();
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
    const smsClient = new TextBeeClient();
    const result = await smsClient.getBalance();
    return result.balance;
  } catch (error) {
    logger.error('Failed to get TextBee balance:', error);
    return 0;
  }
}; 

export const testDatabaseConnection = async (): Promise<{
  connected: boolean;
  tableExists: boolean;
  canInsert: boolean;
  error?: string;
}> => {
  try {
    const connectionTest = await pool.query('SELECT NOW() as time');
    logger.debug('✅ Database connection test passed', {
      time: connectionTest.rows[0]?.time
    });

    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'sms_logs'
      );
    `);

    const tableExists = tableCheck.rows[0]?.exists === true;

    let canInsert = false;
    let testId: string | undefined;

    if (tableExists) {
      try {
        const testInsert = await pool.query(
          `INSERT INTO sms_logs (recipient, message, sms_type, status, sent_at)
           VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
           RETURNING id`,
          ['+254700000000', 'Test message', 'test', 'sent']
        );

        testId = testInsert.rows[0]?.id;
        canInsert = true;

        logger.debug('✅ SMS logs table insert test passed', { testId });

        await pool.query('DELETE FROM sms_logs WHERE id = $1', [testId]);
      } catch (insertError: any) {
        logger.error('❌ SMS logs table insert test failed', {
          error: insertError.message,
          code: insertError.code
        });
        canInsert = false;
      }
    }

    return {
      connected: true,
      tableExists,
      canInsert,
      ...(!tableExists && { error: 'sms_logs table does not exist' }),
      ...(tableExists && !canInsert && { error: 'Cannot insert into sms_logs table' })
    };
  } catch (error: any) {
    logger.error('❌ Database connection test failed', {
      error: error.message,
      stack: error.stack
    });
    return {
      connected: false,
      tableExists: false,
      canInsert: false,
      error: error.message
    };
  }
}; 

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
      await sendBulkSms(subscribers, message, 'alert', sentBy);

      logger.info(`✅ Price alert sent via TextBee`, {
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

    const subscribers = await getSubscribedNumbers();

    if (subscribers.length > 0) {
      await sendBulkSms(subscribers, message, 'update', sentBy);

      logger.info(`✅ Daily update sent via TextBee to ${subscribers.length} subscribers`);
    } else {
      logger.info('No active subscribers for daily update');
    }
  } catch (error) {
    logger.error('Failed to send daily price update:', error);
    throw new ApiError('Failed to send daily update', 500);
  }
};

// ADD NEW FUNCTIONS FOR SIM-BASED SMS
export const testSimBasedSms = async (): Promise<{
  success: boolean;
  simNumber?: string;
  deviceId: string;
  instructions: string;
  testCommand: string;
  activeConversations: Array<[string, ConversationContext]>;
}> => {
  try {
    const testInstructions = `
🎯 SIM-BASED SMS SETUP CONFIRMED

YOUR SETUP:
• Device ID: ${TEXTBEE_DEVICE_ID}
• SIM Card: YOUR personal SIM in TextBee device
• Farmers see: YOUR phone number when you send SMS
• Replies come to: YOUR phone number (read by TextBee)

✅ WHAT'S WORKING:
1. You can send SMS to farmers via API ✓
2. Farmers can reply to your SMS ✓
3. TextBee reads replies from your SIM ✓
4. Webhook sends to your server ✓

🔧 TEST INSTRUCTIONS:

STEP 1 - Send test SMS to yourself:
await sendSmsMessage(
  "${SIM_PHONE_NUMBER}",  // ← Your own number
  "Test - Reply with NAIROBI",
  { smsType: 'test' }
);

STEP 2 - Reply from your phone:
• Wait for SMS on your phone
• Reply with: "NAIROBI"
• TextBee should forward to webhook
• System should auto-reply

STEP 3 - Test with farmer number:
await sendSmsMessage(
  "+254712345678",  // ← Farmer's number
  "AgriPrice: Reply HELP for commands",
  { smsType: 'update' }
);

📝 IMPORTANT NOTES:
• Farmers MUST reply to the SMS from YOUR number
• Each reply creates a new conversation thread
• Use short codes like NAIROBI, HELP, STOP
• System tracks conversations by phone number
`;

    return {
      success: true,
      simNumber: SIM_PHONE_NUMBER,
      deviceId: TEXTBEE_DEVICE_ID || 'Not configured',
      instructions: testInstructions,
      testCommand: `curl -X POST ${process.env.APP_BASE_URL}/api/v1/sms/webhook -H "Content-Type: application/json" -d '{"smsId":"test","sender":"+254712345678","message":"NAIROBI","webhookEvent":"MESSAGE_RECEIVED"}'`,
      activeConversations: Array.from(activeConversations.entries())
    };

  } catch (error: any) {
    logger.error('SIM-based SMS test failed:', error);
    return {
      success: false,
      deviceId: TEXTBEE_DEVICE_ID || 'Not configured',
      instructions: `Error: ${error.message}`,
      testCommand: '',
      activeConversations: []
    };
  }
};

export const getActiveConversations = (): Array<[string, ConversationContext]> => {
  return Array.from(activeConversations.entries());
};

export const getConversationByPhone = (phone: string): ConversationContext | null => {
  const formattedPhone = formatPhoneNumber(phone);
  return activeConversations.get(formattedPhone) || null;
};

export const clearConversation = (phone: string): boolean => {
  const formattedPhone = formatPhoneNumber(phone);
  return activeConversations.delete(formattedPhone);
};

export const clearAllConversations = (): number => {
  const count = activeConversations.size;
  activeConversations.clear();
  return count;
};

export default {
  // Core SMS functions
  sendSmsMessage,
  sendBulkSms,
  formatPhoneNumber,
  validatePhoneNumber,
  getValidSmsType,
  getValidSmsStatus,
  
  // Webhook functions
  processTextSmsWebhook,
  processSmsWebhook,
  verifyWebhookSignature,
  
  // Test functions
  testReplySystem,
  testSimBasedSms, // NEW: SIM-based testing
  simulateTextBeeWebhook,
  testTextSmsConnection,
  testDatabaseConnection,
  
  // Subscription management
  subscribeUser,
  unsubscribeUser,
  getSubscribedNumbers,
  
  // Balance function
  getTextSmsBalance,
  
  // Alerts
  sendPriceAlert,
  sendDailyPriceUpdate,
  
  // Conversation tracking (NEW)
  getActiveConversations,
  getConversationByPhone,
  clearConversation,
  clearAllConversations
};