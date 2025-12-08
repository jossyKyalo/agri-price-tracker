import axios from 'axios';
import { pool } from '../database/connection';
import { query } from '../database/connection';
import { logger } from '../utils/logger';
import { ApiError } from '../utils/apiError';


interface SmsLog {
  recipient: string;
  message: string;
  sms_type: string;
  status: 'sent' | 'failed' | 'pending';
  external_id?: string;
  sent_by?: string;
  error_message?: string;
}

const SMS_MODE_API_KEY = process.env.SMS_MODE_API_KEY || '';
const SENDER_ID = 'Agri Price';

const formatPhoneNumber = (phone: string): string => {
  let formatted = phone.replace(/\D/g, '');
  if (formatted.startsWith('0')) formatted = '254' + formatted.substring(1);
  else if (formatted.startsWith('7') || formatted.startsWith('1')) formatted = '254' + formatted;
  return formatted;
};

export const sendSmsMessage = async (
  recipient: string,
  message: string,
  smsType: string = 'general',
  sentBy?: string
): Promise<SmsLog> => {
  const formattedRecipient = formatPhoneNumber(recipient);
  let status: 'sent' | 'failed' = 'failed';
  let externalId = '';
  let errorMsg = '';

  if (SMS_MODE_API_KEY) {
    try {
      const response = await axios.post(
        'https://rest.smsmode.com/sms/v1/messages',
        {
          recipient: { to: formattedRecipient },
          body: { text: message },
          from: SENDER_ID
        },
        { headers: { 'X-Api-Key': SMS_MODE_API_KEY, 'Content-Type': 'application/json' } }
      );

      if (response.status === 201 || response.status === 200) {
        status = 'sent';
        externalId = response.data.id;
        logger.info(`SMS sent to ${formattedRecipient}`);
      } else {
        errorMsg = JSON.stringify(response.data);
        logger.error('SMS API Error:', response.data);
      }
    } catch (error: any) {
      errorMsg = error.response?.data?.message || error.message;
      logger.error('SMS Send Failed:', errorMsg);
    }
  } else {
    status = 'sent';
    externalId = 'dev-mock-id-' + Date.now();
    logger.info(`[Mock SMS] To: ${recipient} | Msg: ${message}`);
  }

  try {
    const result = await pool.query(
      `INSERT INTO sms_logs (recipient, message, sms_type, status, external_id, sent_by, error_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [formattedRecipient, message, smsType, status, externalId, sentBy, errorMsg]
    );
    return result.rows[0];
  } catch (dbError) {
    logger.error('Failed to save SMS log', dbError);
    return { recipient, message, sms_type: smsType, status, external_id: externalId };
  }
};


export const sendBulkSms = async (
  recipients: string[],
  message: string,
  smsType: string = 'general',
  sentBy?: string
): Promise<SmsLog[]> => {
  const results: SmsLog[] = [];
  logger.info(`Starting bulk SMS (${smsType}) to ${recipients.length} users`);

  for (const phone of recipients) {
    const result = await sendSmsMessage(phone, message, smsType, sentBy);
    results.push(result);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  return results;
};

export const subscribeUser = async (phone: string, cropIds: string[]) => {
  const client = await pool.connect();
  try {
    const formattedPhone = formatPhoneNumber(phone);

    const query = `
      INSERT INTO sms_subscriptions (phone, crops, is_active, updated_at)
      VALUES ($1, $2, true, NOW())
      ON CONFLICT (phone) 
      DO UPDATE SET crops = $2, is_active = true, updated_at = NOW()
      RETURNING id;
    `;

    const result = await client.query(query, [formattedPhone, cropIds]);

    await sendSmsMessage(
      formattedPhone,
      `Welcome to AgriPrice! You are now tracking ${cropIds.length} crops. You will receive daily updates.`
    );

    return result.rows[0];
  } catch (error) {
    logger.error('Subscription error:', error);
    throw new ApiError('Failed to subscribe user', 500);
  } finally {
    client.release();
  }
};

export const unsubscribeUser = async (phone: string) => {
  const formattedPhone = formatPhoneNumber(phone);
  await pool.query('UPDATE sms_subscriptions SET is_active = false WHERE phone = $1', [formattedPhone]);
  return true;
};

export const getSubscribedNumbers = async (
  cropNames?: string[],
  regionIds?: string[]
): Promise<string[]> => {
  try {
    let whereConditions: string[] = ['is_active = true'];
    const params: any[] = [];
    let paramIndex = 1;
    if (cropNames && cropNames.length > 0) {
      whereConditions.push(`crops && $${paramIndex++}::text[]`);
      params.push(cropNames);
    }

    const queryStr = `SELECT DISTINCT phone FROM sms_subscriptions WHERE ${whereConditions.join(' AND ')}`;
    const result = await pool.query(queryStr, params);

    return result.rows.map(row => row.phone);
  } catch (error) {
    logger.error('❌ Failed to get subscribed numbers:', error);
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
    const direction = trend === 'up' ? 'risen' : trend === 'down' ? 'dropped' : 'remained stable';
    const message = `AgriPrice Alert: ${cropName} prices in ${region} have ${direction} by ${percentage}% to KSh ${price}.`;

    const subscribers = await getSubscribedNumbers([cropName]);

    if (subscribers.length > 0) {
      await sendBulkSms(subscribers, message);
      logger.info(`✅ Price alert sent to ${subscribers.length} subscribers for ${cropName}`);
    }
  } catch (error) {
    logger.error('❌ Failed to send price alert:', error);
  }
};

export const sendDailyPriceUpdate = async (): Promise<void> => {
  try {
    const priceChanges = await pool.query(`
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

    let message = 'AGRI UPDATE: Today\'s prices: ';
    const priceList = priceChanges.rows
      .map(row => `${row.crop_name}: ${row.price}/= (${row.region_name})`)
      .join(', ');

    message += priceList;
    const subscribers = await getSubscribedNumbers();

    if (subscribers.length > 0) {
      await sendBulkSms(subscribers, message);
      logger.info(`✅ Daily update sent to ${subscribers.length} subscribers`);
    }
  } catch (error) {
    logger.error('❌ Failed to send daily price update:', error);
  }
};

export const processSmsWebhook = async (req: any): Promise<void> => {
  try {
    const { id, status, phoneNumber } = req.body;
    await
      query('UPDATE sms_logs SET status = $1, delivered_at = CURRENT_TIMESTAMP WHERE external_id = $2', [status, id]);
    logger.info(`📬 Delivery report updated: ${id} - ${status} (${phoneNumber})`);
  }
  catch (error) { logger.error('❌ Failed to process SMS webhook:', error); }
};