import cron from 'node-cron';
import { logger } from '../utils/logger.js';
import { sendDailyPriceUpdate } from './smsService.js';
import { syncKamisData } from './kamisService.js';
import { generateDailyPredictions } from './mlService.js';
export const startCronJobs = () => {
    logger.info('Starting cron jobs...');
    // Daily price update SMS - 8:00 AM
    cron.schedule('0 8 * * *', async () => {
        logger.info('Running daily price update SMS job');
        try {
            await sendDailyPriceUpdate();
        }
        catch (error) {
            logger.error('Daily price update SMS job failed:', error);
        }
    });
    // KAMIS data sync - Every 4 hours
    cron.schedule('0 */4 * * *', async () => {
        logger.info('Running KAMIS data sync job');
        try {
            await syncKamisData();
        }
        catch (error) {
            logger.error('KAMIS data sync job failed:', error);
        }
    });
    // ML predictions generation - Daily at 6:00 AM
    cron.schedule('0 6 * * *', async () => {
        logger.info('Running ML predictions generation job');
        try {
            await generateDailyPredictions();
        }
        catch (error) {
            logger.error('ML predictions generation job failed:', error);
        }
    });
    // Cleanup old logs - Weekly on Sunday at 2:00 AM
    cron.schedule('0 2 * * 0', async () => {
        logger.info('Running cleanup job');
        try {
            await cleanupOldLogs();
        }
        catch (error) {
            logger.error('Cleanup job failed:', error);
        }
    });
    logger.info('Cron jobs started successfully');
};
const cleanupOldLogs = async () => {
    try {
        const { query } = await import('../database/connection.js');
        // Delete SMS logs older than 90 days
        await query('DELETE FROM sms_logs WHERE created_at < NOW() - INTERVAL \'90 days\'');
        // Delete chat conversations older than 30 days (for anonymous users)
        await query('DELETE FROM chat_conversations WHERE user_id IS NULL AND created_at < NOW() - INTERVAL \'30 days\'');
        // Delete old KAMIS sync logs (keep last 100)
        await query(`
      DELETE FROM kamis_sync_logs 
      WHERE id NOT IN (
        SELECT id FROM kamis_sync_logs 
        ORDER BY started_at DESC 
        LIMIT 100
      )
    `);
        logger.info('Cleanup completed successfully');
    }
    catch (error) {
        logger.error('Cleanup failed:', error);
        throw error;
    }
};
//# sourceMappingURL=cronService.js.map