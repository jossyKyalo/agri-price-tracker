import cron from 'node-cron';
import { query } from '../database/connection';
import { logger } from '../utils/logger';
import { syncKamisData } from './kamisService';

let scheduledTask: cron.ScheduledTask | null = null;

 
interface KamisConfig {
  autoSyncEnabled: boolean;
  frequency: 'daily' | 'weekly' | 'manual';
  syncTime: string;  
}

export const initScheduler = async () => {
  try {
    logger.info('⏳ Initializing Scheduler Service...');
 
    const result = await query("SELECT value FROM system_settings WHERE key = $1", ['kamis_config']);
    
    if (result.rows.length === 0) {
      logger.warn('Scheduler: No configuration found in system_settings. Skipping.');
      return;
    }

    const config: KamisConfig = result.rows[0].value;

    
    if (scheduledTask) {
      scheduledTask.stop();
      scheduledTask = null;
    }
 
    if (!config.autoSyncEnabled || config.frequency === 'manual') {
      logger.info('Scheduler: Auto-sync is disabled.');
      return;
    }

    
    const [hour, minute] = config.syncTime.split(':');
    
     
    let cronExpr = `${minute} ${hour} * * *`;  

    if (config.frequency === 'weekly') {
      cronExpr = `${minute} ${hour} * * 1`;  
    }
 
    scheduledTask = cron.schedule(cronExpr, async () => {
      logger.info('Scheduler: Triggering automated KAMIS sync...');
      try {
        await syncKamisData();
        logger.info('Scheduler: Sync job finished successfully.');
      } catch (error) {
        logger.error('Scheduler: Sync job failed.', error); 
      }
    });

    logger.info(`Scheduler: KAMIS Sync scheduled for ${config.syncTime} (${config.frequency}).`);

  } catch (error) {
    logger.error('Scheduler Initialization Failed:', error);
  }
};
 
export const restartScheduler = async () => {
  logger.info('♻️ Restarting Scheduler due to config change...');
  await initScheduler();
};