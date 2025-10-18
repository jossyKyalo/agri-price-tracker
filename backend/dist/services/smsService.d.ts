import type { SmsLog } from '../types/index.js';
/**
 * Send a single SMS
 */
export declare const sendSmsMessage: (recipient: string, message: string, smsType: string, sentBy?: string) => Promise<SmsLog>;
/**
 * Send bulk SMS (multiple recipients)
 */
export declare const sendBulkSms: (recipients: string[], message: string, smsType: string, sentBy?: string) => Promise<SmsLog[]>;
/**
 * Fetch subscribed numbers (filters: crop, region, alert type)
 */
export declare const getSubscribedNumbers: (cropIds?: string[], regionIds?: string[], alertTypes?: string[]) => Promise<string[]>;
/**
 * Send price alert notification
 */
export declare const sendPriceAlert: (cropName: string, price: number, region: string, trend: "up" | "down" | "stable", percentage: number) => Promise<void>;
/**
 * Send daily top price update
 */
export declare const sendDailyPriceUpdate: () => Promise<void>;
/**
 * Process SMS delivery webhook
 */
export declare const processSmsWebhook: (req: any) => Promise<void>;
//# sourceMappingURL=smsService.d.ts.map