import cron from 'node-cron';
import { logger } from '../utils/logger';
import { sendDailyPriceUpdate } from './smsService';
import { syncKamisData } from './kamisService'; 
import { generateDailyPredictions } from './mlService'; 

export const startCronJobs = (): void => {
  logger.info('Starting cron jobs...');

   
  cron.schedule('0 */4 * * *', async () => {
    logger.info('🔄 Cron: Running KAMIS data sync job');
    try {
      await syncKamisData();
    } catch (error) {
      logger.error('Cron: KAMIS data sync job failed:', error);
    }
  });
 
  cron.schedule('0 6 * * *', async () => {
    logger.info('Cron: Running ML predictions generation job');
    try {
      await generateDailyPredictions();
    } catch (error) {
      logger.error('Cron: ML predictions generation job failed:', error);
    }
  });
 
  cron.schedule('30 8 * * *', async () => {
    logger.info('Cron: Running daily price update SMS job');
    try { 
      await sendDailyPriceUpdate('system_cron');
    } catch (error) {
      logger.error('Cron: Daily price update SMS job failed:', error);
    }
  });
 
  cron.schedule('0 2 * * 0', async () => {
    logger.info('Cron: Running cleanup job');
    try {
      await cleanupOldLogs();
    } catch (error) {
      logger.error('Cron: Cleanup job failed:', error);
    }
  });

  logger.info('Cron jobs started successfully');
};

const cleanupOldLogs = async (): Promise<void> => {
  try { 
    const { query } = await import('../database/connection');
       
    await query("DELETE FROM sms_logs WHERE created_at < NOW() - INTERVAL '90 days'");
       
    await query("DELETE FROM chat_conversations WHERE user_id IS NULL AND created_at < NOW() - INTERVAL '30 days'");
     
    await query(`
      DELETE FROM kamis_sync_logs 
      WHERE id NOT IN (
        SELECT id FROM kamis_sync_logs 
        ORDER BY started_at DESC 
        LIMIT 100
      )
    `);

    logger.info('Database cleanup completed successfully');
  } catch (error) {
    logger.error('Cleanup failed:', error);
    throw error;
  }
};