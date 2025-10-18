import axios from 'axios';
import { query, transaction } from '../database/connection';
import { logger } from '../utils/logger';

interface KamisPriceData {
  commodity: string;
  variety?: string;
  market: string;
  region: string;
  price: number;
  unit: string;
  date: string;
}

export const syncKamisData = async (): Promise<void> => {
  const syncId = await startSyncLog();
  
  try {
    logger.info('Starting KAMIS data synchronization');
    
    // Fetch data from KAMIS API
    const kamisData = await fetchKamisData();
    
    if (!kamisData || kamisData.length === 0) {
      await updateSyncLog(syncId, 0, 0, 0, 'completed', 'No data received from KAMIS API');
      return;
    }

    let inserted = 0;
    let updated = 0;

    await transaction(async (client) => {
      for (const item of kamisData) {
        try {
          const result = await processKamisItem(client, item);
          if (result.inserted) inserted++;
          if (result.updated) updated++;
        } catch (error) {
          logger.error(`Failed to process KAMIS item:`, error);
        }
      }
    });

    await updateSyncLog(syncId, kamisData.length, inserted, updated, 'completed');
    logger.info(`KAMIS sync completed: ${inserted} inserted, ${updated} updated`);

  } catch (error: any) {
    logger.error('KAMIS synchronization failed:', error);
    await updateSyncLog(syncId, 0, 0, 0, 'failed', error.message);
    throw error;
  }
};

const fetchKamisData = async (): Promise<KamisPriceData[]> => {
  try {
    const response = await axios.get(process.env.KAMIS_API_URL + '/prices', {
      headers: {
        'Authorization': `Bearer ${process.env.KAMIS_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    return response.data.data || [];
  } catch (error: any) {
    if (error.code === 'ECONNABORTED') {
      throw new Error('KAMIS API request timeout');
    }
    if (error.response?.status === 401) {
      throw new Error('KAMIS API authentication failed');
    }
    if (error.response?.status === 429) {
      throw new Error('KAMIS API rate limit exceeded');
    }
    
    logger.error('KAMIS API error:', error.response?.data || error.message);
    throw new Error(`KAMIS API error: ${error.response?.status || error.message}`);
  }
};

const processKamisItem = async (client: any, item: KamisPriceData): Promise<{inserted: boolean, updated: boolean}> => {
  try {
    // Find or create crop
    const cropResult = await client.query(
      'SELECT id FROM crops WHERE LOWER(name) = LOWER($1)',
      [item.commodity]
    );

    let cropId;
    if (cropResult.rows.length === 0) {
      const newCrop = await client.query(
        'INSERT INTO crops (name, category, unit) VALUES ($1, $2, $3) RETURNING id',
        [item.commodity, 'general', item.unit || 'kg']
      );
      cropId = newCrop.rows[0].id;
    } else {
      cropId = cropResult.rows[0].id;
    }

    // Find or create region
    const regionResult = await client.query(
      'SELECT id FROM regions WHERE LOWER(name) = LOWER($1)',
      [item.region]
    );

    let regionId;
    if (regionResult.rows.length === 0) {
      const newRegion = await client.query(
        'INSERT INTO regions (name, code) VALUES ($1, $2) RETURNING id',
        [item.region, item.region.toUpperCase().replace(/\s+/g, '_')]
      );
      regionId = newRegion.rows[0].id;
    } else {
      regionId = regionResult.rows[0].id;
    }

    // Find or create market
    let marketId = null;
    if (item.market) {
      const marketResult = await client.query(
        'SELECT id FROM markets WHERE LOWER(name) = LOWER($1) AND region_id = $2',
        [item.market, regionId]
      );

      if (marketResult.rows.length === 0) {
        const newMarket = await client.query(
          'INSERT INTO markets (name, region_id) VALUES ($1, $2) RETURNING id',
          [item.market, regionId]
        );
        marketId = newMarket.rows[0].id;
      } else {
        marketId = marketResult.rows[0].id;
      }
    }

    // Check if price entry already exists
    const existingEntry = await client.query(
      `SELECT id FROM price_entries 
       WHERE crop_id = $1 AND region_id = $2 AND market_id = $3 
       AND entry_date = $4 AND source = 'kamis'`,
      [cropId, regionId, marketId, item.date]
    );

    if (existingEntry.rows.length > 0) {
      // Update existing entry
      await client.query(
        `UPDATE price_entries 
         SET price = $1, unit = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [item.price, item.unit || 'kg', existingEntry.rows[0].id]
      );
      return { inserted: false, updated: true };
    } else {
      // Insert new entry
      await client.query(
        `INSERT INTO price_entries (crop_id, region_id, market_id, price, unit, source, is_verified, entry_date)
         VALUES ($1, $2, $3, $4, $5, 'kamis', true, $6)`,
        [cropId, regionId, marketId, item.price, item.unit || 'kg', item.date]
      );
      return { inserted: true, updated: false };
    }

  } catch (error) {
    logger.error('Failed to process KAMIS item:', error);
    throw error;
  }
};

const startSyncLog = async (): Promise<string> => {
  const result = await query(
    'INSERT INTO kamis_sync_logs (sync_date, status) VALUES (CURRENT_DATE, $1) RETURNING id',
    ['running']
  );
  return result.rows[0].id;
};

const updateSyncLog = async (
  id: string,
  processed: number,
  inserted: number,
  updated: number,
  status: string,
  errorMessage?: string
): Promise<void> => {
  await query(
    `UPDATE kamis_sync_logs 
     SET records_processed = $1, records_inserted = $2, records_updated = $3, 
         status = $4, error_message = $5, completed_at = CURRENT_TIMESTAMP
     WHERE id = $6`,
    [processed, inserted, updated, status, errorMessage, id]
  );
};

export const getKamisSyncStatus = async (): Promise<any> => {
  const result = await query(
    'SELECT * FROM kamis_sync_logs ORDER BY started_at DESC LIMIT 1'
  );
  
  return result.rows[0] || null;
};

export const manualKamisSync = async (): Promise<void> => {
  logger.info('Manual KAMIS sync triggered');
  await syncKamisData();
};