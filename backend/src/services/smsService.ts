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

export interface ConversationContext {
  farmerPhone: string;
  lastMessage: string;
  lastReply: string;
  messageCount: number;
  lastActivity: Date;
}

export interface ReceivedSms {
  id: string;
  sender: string;
  message: string;
  receivedAt: string;
  deviceId: string;
  processed: boolean;
}

const TEXTBEE_API_KEY = process.env.TEXTBEE_API_KEY;
const TEXTBEE_DEVICE_ID = process.env.TEXTBEE_DEVICE_ID;
const TEXTBEE_API_URL = process.env.TEXTBEE_API_URL || 'https://api.textbee.dev/api/v1';
const TEXTBEE_WEBHOOK_SECRET = process.env.TEXTBEE_WEBHOOK_SECRET;

const APP_BASE_URL = process.env.APP_BASE_URL || '';
const SMS_RATE_LIMIT_DELAY = parseInt(process.env.SMS_RATE_LIMIT_DELAY || '500', 10);
const SIM_PHONE_NUMBER = process.env.SIM_PHONE_NUMBER || '+254111423809';
const SUPPORT_PHONE = process.env.SUPPORT_PHONE || '+254111423809';
const AUTO_POLL_SMS = process.env.AUTO_POLL_SMS === 'true';
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '30000', 10);

const MAX_WEBHOOK_DATA_LENGTH = 100;
const DEFAULT_SMS_TYPE = 'general';

const SMS_TYPE_VALUES = ['alert', 'update', 'prediction', 'weather', 'general', 'password-reset', 'test'];
const SMS_STATUS_VALUES = ['pending', 'sent', 'failed', 'delivered'];

logger.info(`📱 SMS Service initialized with TextBee API (SIM: ${SIM_PHONE_NUMBER})`);

// Add SIM-based conversation tracking
const activeConversations = new Map<string, ConversationContext>();

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

// ==================== ENHANCED TEXTBEE CLIENT ====================
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

  // =============== NEW: INCOMING SMS METHODS ===============
  async getReceivedSms(limit: number = 50, offset: number = 0): Promise<{
    success: boolean;
    messages: ReceivedSms[];
    total: number;
  }> {
    try {
      logger.debug('📨 Fetching received SMS from TextBee', { limit, offset });

      const response = await axios.get(
        `${this.baseUrl}/gateway/devices/${this.deviceId}/get-received-sms`,
        {
          params: { limit, offset },
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey
          },
          timeout: 30000
        }
      );

      const messages = response.data?.data || response.data?.messages || [];

      const formattedMessages: ReceivedSms[] = messages.map((msg: any) => ({
        id: msg._id || msg.id || `sms_${Date.now()}_${Math.random()}`,
        sender: msg.sender || msg.from || msg.phone || '',
        message: msg.message || msg.text || msg.content || '',
        receivedAt: msg.receivedAt || msg.timestamp || msg.createdAt || new Date().toISOString(),
        deviceId: msg.deviceId || this.deviceId,
        processed: false
      }));

      logger.debug('✅ Received SMS fetched', {
        count: formattedMessages.length,
        sample: formattedMessages.length > 0 ? formattedMessages[0] : null
      });

      return {
        success: true,
        messages: formattedMessages,
        total: response.data?.total || formattedMessages.length
      };
    } catch (error: any) {
      logger.error('❌ Failed to get received SMS:', {
        error: error.message,
        response: error.response?.data
      });

      return {
        success: false,
        messages: [],
        total: 0
      };
    }
  }

  async getMessageHistory(limit: number = 50): Promise<{
    success: boolean;
    messages: Array<{
      id: string;
      type: 'sent' | 'received';
      sender?: string;
      recipient?: string;
      message: string;
      status?: string;
      timestamp: string;
    }>;
  }> {
    try {
      const response = await axios.get(
        `${this.baseUrl}/gateway/devices/${this.deviceId}/messages`,
        {
          params: { limit },
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey
          },
          timeout: 30000
        }
      );

      const messages = response.data?.data || response.data?.messages || [];

      return {
        success: true,
        messages: messages.map((msg: any) => ({
          id: msg._id || msg.id,
          type: msg.type || (msg.direction === 'incoming' ? 'received' : 'sent'),
          sender: msg.sender || msg.from,
          recipient: msg.recipient || msg.to,
          message: msg.message || msg.text,
          status: msg.status,
          timestamp: msg.timestamp || msg.createdAt || msg.receivedAt
        }))
      };
    } catch (error: any) {
      logger.error('Failed to get message history:', error.message);
      return {
        success: false,
        messages: []
      };
    }
  }
}

// ==================== INCOMING SMS SERVICE ====================
class IncomingSmsService {
  private processedMessageIds = new Set<string>();
  private isRunning = false;
  private pollInterval = POLL_INTERVAL_MS;
  private pollTimer: NodeJS.Timeout | null = null;
  private textBeeClient: TextBeeClient;

  constructor() {
    this.textBeeClient = new TextBeeClient();
    logger.info('📱 Incoming SMS Service initialized');
  }

  startPolling(intervalMs: number = POLL_INTERVAL_MS): void {
    if (this.isRunning) {
      logger.warn('Polling already running');
      return;
    }

    this.pollInterval = intervalMs;
    this.isRunning = true;

    logger.info(`🔄 Starting SMS polling every ${intervalMs}ms`);

    // Immediate first poll
    this.pollForNewMessages();

    // Set up interval
    this.pollTimer = setInterval(() => {
      this.pollForNewMessages();
    }, this.pollInterval);
  }

  stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.isRunning = false;
    logger.info('⏹️ Stopped SMS polling');
  }

  async pollForNewMessages(): Promise<{
    success: boolean;
    newMessages: number;
    totalProcessed: number;
  }> {
    try {
      logger.debug('🔍 Polling for new incoming SMS...');

      const result = await this.textBeeClient.getReceivedSms(100, 0);

      if (!result.success || result.messages.length === 0) {
        logger.debug('No new messages found');
        return {
          success: true,
          newMessages: 0,
          totalProcessed: this.processedMessageIds.size
        };
      }

      let newMessagesCount = 0;

      // Process each message
      for (const msg of result.messages) {
        // Skip if already processed
        if (this.processedMessageIds.has(msg.id)) {
          continue;
        }

        // Check if this is a valid farmer message
        if (this.isValidFarmerMessage(msg)) {
          logger.info(`📨 New farmer message from ${msg.sender}`, {
            messageId: msg.id,
            messagePreview: msg.message.substring(0, 50)
          });

          // Process the message
          await this.processIncomingMessage(msg);

          // Mark as processed
          this.processedMessageIds.add(msg.id);
          newMessagesCount++;
        }
      }

      if (newMessagesCount > 0) {
        logger.info(`✅ Processed ${newMessagesCount} new farmer messages`);
      }

      // Clean up old message IDs (keep last 1000)
      if (this.processedMessageIds.size > 1000) {
        const idsArray = Array.from(this.processedMessageIds);
        this.processedMessageIds = new Set(idsArray.slice(-500));
      }

      return {
        success: true,
        newMessages: newMessagesCount,
        totalProcessed: this.processedMessageIds.size
      };

    } catch (error: any) {
      logger.error('Failed to poll for messages:', error);
      return {
        success: false,
        newMessages: 0,
        totalProcessed: this.processedMessageIds.size
      };
    }
  }

  private isValidFarmerMessage(msg: ReceivedSms): boolean {
    // Skip if no sender or message
    if (!msg.sender || !msg.message) {
      logger.debug('Skipping: No sender or message', {
        hasSender: !!msg.sender,
        hasMessage: !!msg.message
      });
      return false;
    }

    try {
      // 1. Format numbers for comparison
      const formattedSender = formatPhoneNumber(msg.sender);
      const ourSimNumber = formatPhoneNumber(SIM_PHONE_NUMBER);

      // 2. Skip messages from OUR OWN SIM
      if (formattedSender === ourSimNumber) {
        logger.debug('📱 Skipping message from our own SIM', {
          sender: formattedSender,
          messagePreview: msg.message.substring(0, 30),
          reason: 'Self-message loop prevention'
        });
        return false;
      }

      // 3. Should be a Kenyan mobile number
      const cleanedSender = msg.sender.replace(/\D/g, '');
      const isKenyanNumber = cleanedSender.startsWith('2547') ||
        cleanedSender.startsWith('07') ||
        cleanedSender.startsWith('2541') ||
        cleanedSender.startsWith('2540');

      if (!isKenyanNumber) {
        logger.debug('Skipping non-Kenyan number:', {
          sender: msg.sender,
          cleanedSender,
          isKenyanNumber
        });
        return false;
      }

      // 4. Skip system/carrier messages by sender name
      const systemSenders = [
        'SAF', 'Safaricom', 'MPESA', 'Okoa', 'Airtel', 'Telkom', 'Telkom.',
        'SMART', 'JTL', 'SERVICE', 'INFO', 'ALERT', 'NOTICE',
        'SYSTEM', 'ADMIN', 'SERVER', 'NETWORK'
      ];

      const upperSender = msg.sender.toUpperCase();
      const isSystemSender = systemSenders.some(sys =>
        upperSender.includes(sys.toUpperCase())
      );

      if (isSystemSender) {
        logger.debug('📱 Skipping system sender:', {
          sender: msg.sender,
          messagePreview: msg.message.substring(0, 30),
          matchedSender: systemSenders.find(s => upperSender.includes(s.toUpperCase()))
        });
        return false;
      }

      // 5. Skip very short messages (likely errors)
      const trimmedMessage = msg.message.trim();
      if (trimmedMessage.length < 2) {
        logger.debug('Skipping very short message:', {
          sender: msg.sender,
          message: trimmedMessage,
          length: trimmedMessage.length
        });
        return false;
      }

      // 6. Skip messages that are just numbers (likely codes)
      if (/^\d+$/.test(trimmedMessage)) {
        logger.debug('Skipping numeric-only message:', {
          sender: msg.sender,
          message: trimmedMessage
        });
        return false;
      }

      // 7. Skip system messages by content
      const systemKeywords = [
        'DELIVERED', 'FAILED', 'SENT', 'ACCEPTED', 'REJECTED', 'QUEUED',
        'BALANCE', 'CREDIT', 'YOUR BALANCE', 'DEAR CUSTOMER',
        'SERVICE MESSAGE', 'PROMOTION', 'ADVERTISEMENT', 'MARKETING',
        'MPESA', 'OKOA JAHIZI', 'AIRTIME', 'BUNDLE', 'DATA',
        'CONFIRMED', 'TRANSACTION', 'DEPOSIT', 'WITHDRAWAL',
        'THANK YOU FOR PURCHASING', 'YOUR SUBSCRIPTION',
        'YOUR ACCOUNT', 'PASSWORD', 'OTP', 'VERIFICATION CODE',
        'KIOSK', 'AGENT', 'MESSAGE', 'SMS'
      ];

      const upperMessage = trimmedMessage.toUpperCase();
      const isSystemContent = systemKeywords.some(keyword =>
        upperMessage.includes(keyword)
      );

      if (isSystemContent) {
        logger.debug('📱 Skipping system content message:', {
          sender: msg.sender,
          messagePreview: trimmedMessage.substring(0, 50),
          matchedKeyword: systemKeywords.find(k => upperMessage.includes(k))
        });
        return false;
      }

      // 8. Check if message looks like a delivery report
      const deliveryReportPatterns = [
        /id:.*status:/i,
        /message.*delivered/i,
        /message.*sent/i,
        /message.*failed/i,
        /status:.*success/i,
        /status:.*failed/i
      ];

      const isDeliveryReport = deliveryReportPatterns.some(pattern =>
        pattern.test(trimmedMessage)
      );

      if (isDeliveryReport) {
        logger.debug('Skipping delivery report:', {
          sender: msg.sender,
          messagePreview: trimmedMessage.substring(0, 50)
        });
        return false;
      }

      // 9. Check if message is from a short code (likely system)
      const isShortCode = /^\d{3,6}$/.test(cleanedSender) ||
        /^[a-zA-Z]/.test(msg.sender); // Starts with letters

      if (isShortCode) {
        logger.debug('Skipping short code sender:', {
          sender: msg.sender,
          cleanedSender,
          messagePreview: trimmedMessage.substring(0, 30)
        });
        return false;
      }

      // 10. Check for common spam patterns
      const spamPatterns = [
        /win.*cash/i,
        /free.*offer/i,
        /loan.*apply/i,
        /gift.*card/i,
        /click.*link/i,
        /http:\/\//i,
        /https:\/\//i,
        /www\./i,
        /\.com/i,
        /\.co\.ke/i,
        /please me thank you/i,
        /send me airtime/i,
        /send airtime/i,
        /airtime.*please/i,
        /god bless you/i,
        /godbless/i,
        /stranded.*please/i,
        /kindly send/i,
        /please send/i,
        /send.*money/i,
        /mpesa.*me/i,
        /i need money/i,
        /i am stranded/i,
        /bob.*please/i,
        /ksh.*please/i
      ];

      const isSpam = spamPatterns.some(pattern => pattern.test(trimmedMessage));
      if (isSpam) {
        logger.debug('Skipping potential spam:', {
          sender: msg.sender,
          messagePreview: trimmedMessage.substring(0, 50)
        });
        return false;
      }

      // ✅ VALID FARMER MESSAGE
      logger.info('✅ Valid farmer message detected', {
        sender: formattedSender,
        messagePreview: trimmedMessage.substring(0, 80),
        length: trimmedMessage.length
      });

      return true;

    } catch (error: any) {
      // If formatting fails, assume invalid
      logger.debug('Error validating message, skipping:', {
        sender: msg.sender,
        error: error.message
      });
      return false;
    }
  }

  private async processIncomingMessage(msg: ReceivedSms): Promise<void> {
    try {
      const formattedPhone = formatPhoneNumber(msg.sender);

      // 1. Track conversation
      updateConversation(formattedPhone, msg.message, 'incoming');

      // 2. Save to database
      const logId = await saveIncomingMessageToDatabase(msg);

      // 3. Process and auto-reply
      const result = await processFarmerMessage(
        formattedPhone,
        msg.message.trim(),
        msg.id,
        logId ?? undefined
      );

      // 4. Log the interaction
      if (result.processed && result.action) {
        await logFarmerInteraction(
          formattedPhone,
          msg.message,
          result.message || '',
          result.action,
          await isFarmerSubscribed(formattedPhone)
        );
      }

      logger.info(`✅ Processed farmer message from ${formattedPhone}`, {
        action: result.action,
        processed: result.processed
      });

    } catch (error: any) {
      logger.error(`Failed to process incoming message from ${msg.sender}:`, error);
    }
  }

  getStats(): {
    isRunning: boolean;
    processedCount: number;
    pollInterval: number;
  } {
    return {
      isRunning: this.isRunning,
      processedCount: this.processedMessageIds.size,
      pollInterval: this.pollInterval
    };
  }

  clearProcessedMessages(): number {
    const count = this.processedMessageIds.size;
    this.processedMessageIds.clear();
    logger.info(`🧹 Cleared ${count} processed message IDs`);
    return count;
  }
}

// Create singleton instance
const incomingSmsService = new IncomingSmsService();

// Start polling automatically if enabled
if (AUTO_POLL_SMS) {
  setTimeout(() => {
    incomingSmsService.startPolling(POLL_INTERVAL_MS);
  }, 5000); // Start after 5 seconds
}

// ==================== HELPER FUNCTIONS ====================
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

// SIM-BASED CONVERSATION HELPER FUNCTIONS
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

async function saveIncomingMessageToDatabase(msg: {
  id: string;
  sender: string;
  message: string;
  receivedAt: string;
  deviceId: string;
  processed: boolean;
}): Promise<string | null> {
  try {
    // Try to save to incoming_sms table
    const result = await query(
      `INSERT INTO incoming_sms (
        sender, message, received_at, message_id, device_id, processed
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id`,
      [
        msg.sender,
        msg.message,
        new Date(msg.receivedAt),
        msg.id,
        msg.deviceId,
        false
      ]
    );

    const logId = result.rows[0]?.id;
    logger.info('✅ Incoming message saved to incoming_sms', {
      messageId: msg.id,
      sender: msg.sender,
      logId
    });

    return logId;
  } catch (error: any) {
    logger.warn('Could not save to incoming_sms, using sms_logs fallback:', {
      error: error.message,
      sender: msg.sender
    });

    try {
      // FALLBACK: Save to sms_logs but with correct semantics
      const fallbackResult = await query(
        `INSERT INTO sms_logs (
          recipient,  -- This is actually the SENDER (farmer's number)
          message,    -- Farmer's message
          sms_type,
          status,
          external_id,
          reply_received,  -- TRUE because we received this message
          reply_text,      -- The message they sent
          reply_timestamp, -- When they sent it
          sent_at,         -- When we received it
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
        RETURNING id`,
        [
          msg.sender,      // Farmer's number in recipient field
          msg.message,
          'alert',
          'delivered',
          msg.id,
          true,           // This is a received message
          msg.message,
          new Date(msg.receivedAt),
          new Date(msg.receivedAt)
        ]
      );

      return fallbackResult.rows[0]?.id;
    } catch (fallbackError) {
      logger.error('Both database saves failed:', fallbackError);
      return null;
    }
  }
}

async function isFarmerSubscribed(farmerPhone: string): Promise<boolean> {
  try {
    const result = await query(
      `SELECT is_active FROM sms_subscriptions WHERE phone = $1`,
      [farmerPhone]
    );
    return result.rows[0]?.is_active === true;
  } catch (error) {
    return false;
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

async function processFarmerMessage(
  phone: string,
  message: string,
  messageId: string,
  logId?: string
): Promise<{ processed: boolean; action?: string; message?: string }> {
  const userText = message.trim().toUpperCase();
  let action = 'processed';
  let replyContent = '';

  try {
    logger.info('🎯 DEBUG: processFarmerMessage called with:', {
      phone,
      isOurSim: phone === formatPhoneNumber(SIM_PHONE_NUMBER),
      messagePreview: message.substring(0, 50),
      messageId
    });

    // 🚨 REMOVE THIS: Get farmer context is causing duplicate subscription logic
    // const farmerContext = await getFarmerContext(phone);

    // Process based on message content
    if (userText === 'STOP') {
      // Use the dedicated function
      action = await handleUnsubscribe(phone);
      replyContent = 'You have been unsubscribed from AgriPrice alerts. Text JOIN to resubscribe.';
      // 🚨 handleUnsubscribe already sends a message, so we should NOT send another!
      return {
        processed: true,
        action,
        message: replyContent
      };

    } else if (userText === 'JOIN' || userText === 'START' || userText === 'YES') {
      // Use the dedicated function
      action = await handleSubscribe(phone);
      return {
        processed: true,
        action,
        message: 'Welcome message sent via handleSubscribe'
      };

    } else if (userText === 'HELP' || userText === 'INFO') {
      replyContent = `AGRIHELP - Commands:\nPRICE LOCATIONS:\n• NAIROBI\n• NAKURU\n• KISUMU\n• MOMBASA\n• ELDORET\n\nOTHER COMMANDS:\n• JOIN - Subscribe\n• STOP - Unsubscribe\n• HELP - This menu\n\n📞 Support: ${SUPPORT_PHONE}`;
      action = 'help_sent';

    } else if (isLocationQuery(userText)) {
      const location = extractLocationFromText(userText);
      if (location) {
        const prices = await getCropPricesByLocation(location);
        if (prices) {
          replyContent = ` ${location} MARKET PRICES:\n\n${prices}\nReply another location\nReply HELP for commands`;
          action = 'prices_sent';

          // Check if subscribed for location queries
          const isSubscribed = await isFarmerSubscribed(phone);
          if (!isSubscribed) {
            replyContent += '\n\n💡 Want daily alerts? Reply JOIN';
          }
        } else {
          replyContent = `No data for ${location}.\n\nTry: NAIROBI, NAKURU, KISUMU\nOr reply HELP for commands`;
          action = 'location_not_found';
        }
      }

    } else if (userText.includes('THANK') || userText.includes('ASANTE')) {
      replyContent = 'Karibu! Happy to help.\n\nNeed more info? Reply HELP';
      action = 'thank_you';

    } else if (userText.includes('HABARI') || userText === 'HI' || userText === 'HELLO') {
      replyContent = `👋 Habari! I'm AgriPrice SMS mode.\n Reply with location for crop prices\nReply HELP for commands\nSupport: ${SUPPORT_PHONE}`;
      action = 'greeting_reply';

    } else {
      // Unknown message - provide helpful response
      replyContent = `Sorry, I didn't understand: "${message}"\nTry:\n NAIROBI (for prices)\nHELP (for commands)\n📞 ${SUPPORT_PHONE}`;
      action = 'unknown_message';
    }

    // Send the reply if we have content
    if (replyContent) {
      logger.info(`📤 Sending reply to ${phone}`, {
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

      if (replyResult.id || replyResult.external_id) {
        // Track outgoing message in conversation
        updateConversation(phone, replyContent, 'outgoing');

        logger.info(`✅ Reply sent to ${phone}`, {
          logId: replyResult.id,
          externalId: replyResult.external_id,
          messageLength: replyContent.length
        });
      } else {
        logger.error(`❌ Failed to send reply to ${phone}`);
        action = 'reply_failed';
      }
    }

    return {
      processed: true,
      action,
      message: replyContent
    };

  } catch (error: any) {
    logger.error(`❌ Error processing message from ${phone}:`, error);
    return {
      processed: false,
      action: 'error',
      message: `Error: ${error.message}`
    };
  }
}

async function getFarmerContext(phone: string): Promise<{
  isSubscribed: boolean;
  lastInteraction: Date | null;
  messageCount: number;
}> {
  try {
    const subscriptionResult = await query(
      `SELECT is_active, updated_at 
       FROM sms_subscriptions 
       WHERE phone = $1`,
      [phone]
    );

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
  return locations.some(loc => text === loc || text.includes(loc));
}

function extractLocationFromText(text: string): string | null {
  const locations = ['NAIROBI', 'NAKURU', 'KISUMU', 'MOMBASA', 'ELDORET', 'KISII', 'THIKA'];
  for (const loc of locations) {
    if (text === loc || text.includes(loc)) {
      return loc;
    }
  }
  return null;
}

// ==================== WEBHOOK HANDLERS ====================
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
           created_at = CURRENT_TIMESTAMP
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

async function handleIncomingMessage(
  smsId: string,
  sender: string,
  message: string,
  receivedAt: string
): Promise<{ processed: boolean; action?: string; message?: string }> {
  try {
    logger.info(`📨 MESSAGE_RECEIVED webhook`, {
      smsId,
      sender,
      messagePreview: message?.substring(0, 50),
      receivedAt
    });


    const updateResult = await query(
      `UPDATE sms_logs 
       SET status = 'sent',
           external_id = COALESCE(external_id, $1),
           sent_at = COALESCE(sent_at, $2),
           created_at = CURRENT_TIMESTAMP
       WHERE (external_id = $1 OR message LIKE $3)
       AND status = 'pending'
       RETURNING id, recipient`,
      [
        smsId,
        new Date(receivedAt),
        `%${message?.substring(0, 50)}%`
      ]
    );

    if ((updateResult?.rowCount ?? 0) > 0) {
      logger.info(`✅ Updated SMS log for outgoing message`, {
        smsId,
        rowsUpdated: updateResult?.rowCount ?? 0
      });
    } else {
      logger.warn(`No matching SMS log found for MESSAGE_RECEIVED`, {
        smsId,
        messagePreview: message?.substring(0, 50)
      });
    }

    return {
      processed: true,
      action: 'outgoing_message_queued',
      message: 'Outgoing SMS queued by TextBee'
    };

  } catch (error: any) {
    logger.error('Failed to handle MESSAGE_RECEIVED webhook:', error);
    return {
      processed: false,
      message: `Error: ${error.message}`
    };
  }
}

async function handleMessageSent(data: any): Promise<{
  processed: boolean;
  action?: string;
  message?: string;
}> {
  try {
    const smsId = data.id || data.smsId;
    const batchId = data.batchId || data.smsBatchId;
    const recipient = data.recipient || data.to;
    const message = data.message || data.text;

    logger.info('✈️ MESSAGE SENT via TextBee', {
      smsId,
      batchId,
      recipient,
      messagePreview: message?.substring(0, 30)
    });

    // Update sms_logs for outgoing messages
    await query(
      `UPDATE sms_logs 
       SET status = 'sent',
           sent_at = CURRENT_TIMESTAMP,
           external_id = COALESCE($1, external_id)
       WHERE (external_id = $1 OR external_id = $2 OR recipient = $3)
       RETURNING id`,
      [smsId, batchId, recipient]
    );

    return {
      processed: true,
      action: 'message_sent',
      message: `Message ${smsId} sent to ${recipient}`
    };
  } catch (error: any) {
    logger.error('Failed to handle message sent:', error);
    return {
      processed: false,
      message: `Error updating sent status: ${error.message}`
    };
  }
}

async function handleMessageDelivered(data: any): Promise<{
  processed: boolean;
  action?: string;
  message?: string;
}> {
  try {
    const smsId = data.id || data.smsId;
    const batchId = data.batchId || data.smsBatchId;
    const recipient = data.recipient || data.to;

    logger.info('✅ MESSAGE DELIVERED via TextBee', {
      smsId,
      batchId,
      recipient
    });

    await query(
      `UPDATE sms_logs 
       SET status = 'delivered',
           delivered_at = CURRENT_TIMESTAMP
       WHERE (external_id = $1 OR external_id = $2 OR recipient = $3)
       RETURNING id`,
      [smsId, batchId, recipient]
    );

    return {
      processed: true,
      action: 'message_delivered',
      message: `Message delivered to ${recipient}`
    };
  } catch (error: any) {
    logger.error('Failed to handle message delivered:', error);
    return {
      processed: false,
      message: `Error updating delivered status: ${error.message}`
    };
  }
}

async function handleMessageFailed(data: {
  smsId: string;
  smsBatchId: string;
  recipient: string;
  error?: string;
}): Promise<{ processed: boolean; action?: string; message?: string }> {
  const { smsId, smsBatchId, recipient, error } = data;

  try {
    logger.error('❌ MESSAGE_FAILED webhook', {
      smsId,
      smsBatchId,
      recipient,
      error
    });

    await query(
      `UPDATE sms_logs 
       SET status = 'failed',
           error_message = COALESCE($1, error_message),
           created_at = CURRENT_TIMESTAMP
       WHERE (external_id = $2 OR external_id = $3 OR recipient = $4)`,
      [error, smsId, smsBatchId, recipient]
    );

    return {
      processed: true,
      action: 'message_failed',
      message: `Message failed for ${recipient}: ${error || 'Unknown error'}`
    };
  } catch (err: any) {
    logger.error('Failed to handle message failed:', err);
    return {
      processed: false,
      message: `Error updating failed status: ${err.message}`
    };
  }
}

export const processTextSmsWebhook = async (
  body: any,
  headers?: any,
  rawBody?: string
): Promise<{ processed: boolean; action?: string; message?: string }> => {
  try {
    // TextBee uses TWO different webhook formats:
    // 1. New format: { event: 'message.received', data: { ... } }
    // 2. Old format: { webhookEvent: 'MESSAGE_RECEIVED', ... }

    const { event, webhookEvent, data, ...rest } = body;
    const actualEvent = event || webhookEvent;

    if (!actualEvent) {
      logger.warn('Missing event/webhookEvent in TextBee webhook', body);
      return {
        processed: false,
        message: 'Missing event in webhook payload'
      };
    }

    logger.info(`📩 TextBee webhook: ${actualEvent}`, {
      format: event ? 'new_format' : 'old_format',
      hasData: !!data,
      bodyKeys: Object.keys(body)
    });

    // Handle different event types
    switch (actualEvent.toLowerCase()) {
      case 'message.received':  // ✅ NEW FORMAT: Farmer sends SMS
      case 'message_received':  // ✅ OLD FORMAT: Farmer sends SMS
        return await handleIncomingFarmerMessage(
          data || rest  // data for new format, rest for old
        );

      case 'message.sent':      // ✅ New format
      case 'message_sent':      // ✅ Old format
        return await handleMessageSent(data || rest);

      case 'message.delivered': // ✅ New format
      case 'message_delivered': // ✅ Old format
        return await handleMessageDelivered(data || rest);

      case 'message.failed':    // ✅ New format
      case 'message_failed':
        const failedData = data || rest;
        return await handleMessageFailed({
          smsId: failedData.id || failedData.smsId,
          smsBatchId: failedData.batchId || failedData.smsBatchId,
          recipient: failedData.recipient || failedData.to,
          error: failedData.error || failedData.message || failedData.reason
        });

      default:
        logger.warn(`Unknown TextBee webhook event: ${actualEvent}`, body);
        return {
          processed: false,
          action: 'unknown_event',
          message: `Unknown event type: ${actualEvent}`
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

async function handleIncomingFarmerMessage(data: any): Promise<{
  processed: boolean;
  action?: string;
  message?: string;
}> {
  try {
    // Handle both formats
    const messageId = data.id || data.smsId;
    const sender = data.sender || data.from;
    const message = data.message || data.text || data.content;
    const timestamp = data.timestamp || data.receivedAt || data.createdAt;
    const deviceId = data.deviceId || TEXTBEE_DEVICE_ID;

    if (!sender || !message) {
      logger.warn('Incomplete incoming message data:', data);
      return {
        processed: false,
        message: 'Missing sender or message in webhook'
      };
    }

    // 🚨🚨🚨 CRITICAL: FILTER OUT NON-FARMER MESSAGES 🚨🚨🚨

    // 1. Format numbers for comparison
    const formattedSender = formatPhoneNumber(sender);
    const ourSimNumber = formatPhoneNumber(SIM_PHONE_NUMBER);

    // 2. Skip messages from OUR OWN SIM (when we text ourselves)
    if (formattedSender === ourSimNumber) {
      logger.info('📱 SKIPPED: Message from our own SIM', {
        sender: formattedSender,
        messagePreview: message.substring(0, 50),
        reason: 'Self-message loop prevention'
      });
      return {
        processed: true,
        action: 'self_message_ignored',
        message: 'Ignored message from own SIM'
      };
    }

    // 3. Skip carrier/system messages by sender name
    const systemSenders = [
      'SAF', 'Safaricom', 'MPESA', 'Okoa', 'Airtel', 'Telkom',
      'SMART', 'JTL', 'SERVICE', 'INFO', 'ALERT', 'NOTICE'
    ];

    const isSystemSender = systemSenders.some(sys =>
      sender.toUpperCase().includes(sys.toUpperCase())
    );

    if (isSystemSender) {
      logger.info('📱 SKIPPED: System sender detected', {
        sender,
        messagePreview: message.substring(0, 50),
        reason: 'System/carrier message'
      });
      return {
        processed: true,
        action: 'system_sender_ignored',
        message: 'Ignored system sender message'
      };
    }

    // 4. Skip messages containing system keywords
    const systemKeywords = [
      'DELIVERED', 'FAILED', 'SENT', 'ACCEPTED', 'REJECTED',
      'BALANCE', 'CREDIT', 'YOUR BALANCE', 'DEAR CUSTOMER',
      'SERVICE MESSAGE', 'PROMOTION', 'ADVERTISEMENT',
      'MPESA', 'OKOA JAHIZI', 'AIRTIME', 'BUNDLE', 'DATA',
      'PLEASE ME THANK YOU',
      'PLEASE ME THANKYOU',
      'Please call me thank you',
      'SEND ME AIRTIME',
      'SEND AIRTIME',
      'AIRTIME PLEASE',
      'STRANDED',
      'NEED HELP',
      'GOD BLESS YOU',
      'GODBLESS',
      'BLESS YOU',
      'KINDLY SEND',
      'PLEASE SEND',
      'SEND ME MONEY',
      'MPESA ME',
      'I NEED MONEY',
      'I AM STRANDED',
      'I tried to call you'
    ];

    const upperMessage = message.toUpperCase();
    const isSystemContent = systemKeywords.some(keyword =>
      upperMessage.includes(keyword)
    );

    if (isSystemContent) {
      logger.info('📱 SKIPPED: System content detected', {
        sender: formattedSender,
        messagePreview: message.substring(0, 50),
        matchedKeyword: systemKeywords.find(k => upperMessage.includes(k))
      });
      return {
        processed: true,
        action: 'system_content_ignored',
        message: 'Ignored system content message'
      };
    }

    // 5. Skip very short messages (likely errors or codes)
    const trimmedMessage = message.trim();
    if (trimmedMessage.length < 2) {
      logger.info('📱 SKIPPED: Message too short', {
        sender: formattedSender,
        message,
        length: trimmedMessage.length
      });
      return {
        processed: true,
        action: 'short_message_ignored',
        message: 'Ignored very short message'
      };
    }

    // 6. Skip messages that are just numbers (likely codes)
    if (/^\d+$/.test(trimmedMessage)) {
      logger.info('📱 SKIPPED: Numeric-only message', {
        sender: formattedSender,
        message
      });
      return {
        processed: true,
        action: 'numeric_message_ignored',
        message: 'Ignored numeric-only message'
      };
    }

    // 7. Log the valid farmer message
    logger.info('📨 ✅ VALID FARMER MESSAGE RECEIVED', {
      messageId,
      sender: formattedSender,
      messagePreview: trimmedMessage.substring(0, 100),
      length: trimmedMessage.length,
      timestamp,
      deviceId
    });

    // 8. Save to incoming_sms table
    const incomingId = await saveIncomingMessageToDatabase({
      id: messageId || `webhook_${Date.now()}`,
      sender: formattedSender, // Use formatted version
      message: trimmedMessage,
      receivedAt: timestamp || new Date().toISOString(),
      deviceId: deviceId || TEXTBEE_DEVICE_ID,
      processed: false
    });

    // 9. Process and auto-reply
    const result = await processFarmerMessage(
      formattedSender, // Send to farmer's formatted number
      trimmedMessage,
      messageId,
      incomingId || undefined
    );

    // 10. Update incoming message as processed
    if (incomingId) {
      await query(
        `UPDATE incoming_sms SET processed = true WHERE id = $1`,
        [incomingId]
      );
    }

    return {
      processed: true,
      action: result.action || 'farmer_message_processed',
      message: `Processed message from ${formattedSender}`
    };

  } catch (error: any) {
    logger.error('❌ Failed to handle incoming farmer message:', {
      error: error.message,
      stack: error.stack,
      data: JSON.stringify(data).substring(0, 200)
    });
    return {
      processed: false,
      message: `Error processing farmer message: ${error.message}`
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
    isOurSim: formattedRecipient === formatPhoneNumber(SIM_PHONE_NUMBER),
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

// ==================== NEW TWO-WAY SMS FUNCTIONS ====================
export const checkForIncomingSms = async (): Promise<{
  success: boolean;
  messages: ReceivedSms[];
  stats: any;
}> => {
  try {
    const smsClient = new TextBeeClient();
    const result = await smsClient.getReceivedSms(20, 0);

    return {
      success: result.success,
      messages: result.messages,
      stats: {
        totalMessages: result.total,
        receivedMessages: result.messages.length,
        pollingStats: incomingSmsService.getStats()
      }
    };
  } catch (error: any) {
    logger.error('Failed to check incoming SMS:', error);
    return {
      success: false,
      messages: [],
      stats: { error: error.message }
    };
  }
};

export const startSmsPolling = (intervalMs: number = POLL_INTERVAL_MS): void => {
  incomingSmsService.startPolling(intervalMs);
};

export const stopSmsPolling = (): void => {
  incomingSmsService.stopPolling();
};

export const getPollingStats = () => {
  return incomingSmsService.getStats();
};

export const testTwoWaySms = async (): Promise<{
  success: boolean;
  steps: Array<{ step: string; success: boolean; details: any }>;
  recommendations: string[];
}> => {
  const steps = [];
  const recommendations = [];

  try {
    // Step 1: Test TextBee connection
    const smsClient = new TextBeeClient();
    steps.push({
      step: 'TextBee Client Initialization',
      success: true,
      details: { deviceId: TEXTBEE_DEVICE_ID, simNumber: SIM_PHONE_NUMBER }
    });

    // Step 2: Test getting received SMS
    const receivedResult = await smsClient.getReceivedSms(5, 0);
    steps.push({
      step: 'Get Received SMS API',
      success: receivedResult.success,
      details: {
        canAccess: receivedResult.success,
        messageCount: receivedResult.messages.length,
        sampleMessages: receivedResult.messages.slice(0, 2)
      }
    });

    if (!receivedResult.success) {
      recommendations.push('Check TextBee API permissions for reading received SMS');
    }

    // Step 3: Test sending SMS
    try {
      const testSend = await sendSmsMessage(
        SIM_PHONE_NUMBER, // Send to yourself
        'Test message for two-way SMS. Reply with NAIROBI.',
        { smsType: 'test' }
      );

      steps.push({
        step: 'Send SMS Test',
        success: !!testSend.id,
        details: {
          messageId: testSend.id,
          externalId: testSend.external_id,
          status: testSend.status
        }
      });
    } catch (sendError: any) {
      steps.push({
        step: 'Send SMS Test',
        success: false,
        details: { error: sendError.message }
      });
    }

    // Step 4: Check polling service
    steps.push({
      step: 'Polling Service Status',
      success: true,
      details: incomingSmsService.getStats()
    });

    // Step 5: Check database connection
    const dbTest = await testDatabaseConnection();
    steps.push({
      step: 'Database Connection',
      success: dbTest.connected,
      details: dbTest
    });

    // Generate recommendations
    if (receivedResult.messages.length === 0) {
      recommendations.push('No received messages found. Test by: 1. Send SMS to a farmer 2. Have farmer reply 3. Check logs');
      recommendations.push('Make sure your SIM card is properly inserted in the TextBee device.');
    }

    if (!receivedResult.success) {
      recommendations.push('TextBee incoming SMS API might require different permissions.');
    }

    recommendations.push(`To test auto-reply: Send SMS to ${SIM_PHONE_NUMBER} and reply with "NAIROBI"`);

    return {
      success: steps.every(s => s.success),
      steps,
      recommendations
    };

  } catch (error: any) {
    logger.error('Two-way SMS test failed:', error);
    steps.push({
      step: 'Overall Test',
      success: false,
      details: { error: error.message }
    });

    return {
      success: false,
      steps,
      recommendations: ['Check TextBee API configuration', 'Verify device is online']
    };
  }
};

// ==================== KEEP EXISTING FUNCTIONS ====================
export const testReplySystem = async (reply: SmsReply) => {
  // ... keep existing testReplySystem function exactly as it is ...
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
          created_at = CURRENT_TIMESTAMP
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
            created_at = CURRENT_TIMESTAMP
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
              created_at = CURRENT_TIMESTAMP
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

📞 Support: ${SUPPORT_PHONE}`;

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

// ==================== CONVERSATION MANAGEMENT ====================
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

// ==================== DEFAULT EXPORT ====================
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
  testTwoWaySms, // NEW: Replaces testSimBasedSms
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

  // Two-way SMS Management (NEW)
  checkForIncomingSms,
  startSmsPolling,
  stopSmsPolling,
  getPollingStats,

  // Conversation tracking
  getActiveConversations,
  getConversationByPhone,
  clearConversation,
  clearAllConversations
};