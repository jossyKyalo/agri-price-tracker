import { query, transaction } from '../database/connection';
import { logger } from '../utils/logger';
import { parse as csvParseSync } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import util from 'util';
import { fileURLToPath } from 'url';


const execPromise = util.promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

 
const PROJECT_ROOT = path.resolve(__dirname, '../../');
const DATA_DIR = path.join(PROJECT_ROOT, 'data/raw');
const LATEST_FILE = path.join(DATA_DIR, 'kamis_latest.csv');
const SCRAPER_SCRIPT = path.join(PROJECT_ROOT, 'src/ml-model-service/data/scraping/kamis_scraper.py'); 
 
const categorizeCrop = (commodityName: string): string => {
  const lowerName = (commodityName || '').toLowerCase();
  
  if (lowerName.match(/fertilizer/)) return 'farm_inputs';
  if (lowerName.match(/sunflower cake|cotton seed cake|bran|pollard/)) return 'animal_feeds';
  if (lowerName.match(/oil|cooking fat/)) return 'processed_products';
  if (lowerName.match(/tea|coffee|cotton|macadamia|cashew|korosho|sisal|pyrethrum|sunflower/)) return 'cash_crops';
  if (lowerName.match(/donkey|cattle|cow|bull|goat|sheep|camel|pig|livestock|heifer|steer|rabbit/)) return 'livestock';
  if (lowerName.match(/chicken|poultry|turkey|duck|geese|hen/)) return 'poultry';
  if (lowerName.match(/fish|tilapia|omena|nile perch|catfish|mudfish|haplochromis|trout|carp|protopterus|bass|labeo|mormyrus|eel|synodontis|alestes|barbus|snapper|demersal|barracuda|kasumba|tuna|mackerel|shark|sardine|lobster|kamba|prawn|crab|kaa|shrimp|octopus|pweza|squid|ngisi|oyster|scavenger|changu|tangu|grouper|grunt|taamamba|kora|mullet|fumi|threadfin|bream|jack|trevally|kolekole|halfbeak|anchov|herring|marlin|pelagic|rockcode|tewa/)) return 'fisheries';
  if (lowerName.match(/egg|milk|honey|beef|mutton|pork|meat/)) return 'animal_products';
  if (lowerName.match(/maize|rice|wheat|sorghum|millet|barley|oat|cereal/)) return 'cereals';
  if (lowerName.match(/bean|pea|gram|cowpea|lentil|njahi|dolichos|pulse|soya|ground\s?nut|peanut|njugu mawe/)) return 'legumes';
  if (lowerName.match(/potato|cassava|yam|arrow root|sweet potato|cocoyam|tuber/)) return 'roots_tubers';
  if (lowerName.match(/banana|mango|orange|pineapple|pawpaw|watermelon|avocado|passion|lemon|lime|tangerine|guava|jackfruit|berry|berries|melon|grape|apple|dragon\s?fruit|coconut/)) return 'fruits';
  if (lowerName.match(/tomato|kales|sukuma|cabbage|onion|spinach|carrot|pepper|chilli|brinjal|lettuce|managu|terere|vegetable|broccoli|cauliflower|cucumber|kunda|mrenda|spider\s?flower|saga|jute|pumpkin|butternut|capsicum|crotolaria|mito|miro|courgette|okra|gumbo|lady\'s\s?finger/)) return 'vegetables';
  if (lowerName.match(/ginger|garlic|coriander|dhania|chives|turmeric|pepper|chilies/)) return 'spices_herbs';

  return 'general';
};

const determineUnit = (category: string, commodityName: string): string => {
  const lowerName = (commodityName || '').toLowerCase();
  if (category === 'livestock') return 'head';
  if (category === 'poultry') return 'bird';
  if (lowerName.match(/milk|oil|juice|honey|yoghurt/)) return 'litre';
  if (lowerName.match(/egg/)) return 'tray';
  if (lowerName.match(/timber|post|pole|pineapple|watermelon|coconut|pumpkin|butternut|cabbage/)) return 'piece';
  return 'kg';
};

 

export const syncKamisData = async (): Promise<any> => {
  const syncId = await startSyncLog();

  try {
    logger.info('🔄 Starting KAMIS data synchronization...');
    
 
    try {
        const { stdout, stderr } = await execPromise(`python "${SCRAPER_SCRIPT}"`);
        logger.info(`Scraper stdout: ${stdout}`); 
        if (stderr && !stderr.includes("UserWarning") && !stderr.includes("DeprecationWarning")) {
             logger.warn(`Scraper stderr: ${stderr}`);
        }
    } catch (err: any) {
        logger.error(`Scraper execution failed: ${err.message}`); 
    }
 
    if (!fs.existsSync(LATEST_FILE)) {
        throw new Error('Scraper finished but no output file found at ' + LATEST_FILE);
    }

  
    const fileBuffer = fs.readFileSync(LATEST_FILE);
    const result = await processKamisFile(fileBuffer, 'kamis_latest.csv');

    
    await updateSyncLog(syncId, result.total_rows, result.inserted, 0, 'completed');
    logger.info(`KAMIS sync completed: ${result.inserted} inserted.`);
    
    return { 
        records_synced: result.inserted,
        details: result 
    };

  } catch (error: any) {
    logger.error('KAMIS synchronization failed:', error);
    await updateSyncLog(syncId, 0, 0, 0, 'failed', error.message);
    throw error;
  }
};
 

export async function processKamisFile(buffer: Buffer, filename: string) {
  const ext = (path.extname(filename) || '').toLowerCase();
  let rows: any[] = [];

  try {
    if (ext === '.xlsx' || ext === '.xls') {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        throw new Error('No sheets found in Excel file');
      }
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) {
        throw new Error('Sheet data is undefined');
      }
      rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
    } else {
      const text = buffer.toString('utf8');
      const cleanText = text.replace(/^\uFEFF/, ''); 
      rows = csvParseSync(cleanText, { columns: true, skip_empty_lines: true, trim: true });
    }
  } catch (err) {
    throw new Error('Failed to parse file: ' + String(err));
  }

  return await transaction(async (client) => {
    let insertedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const rawRow of rows) {
      try {
        const row: any = {};
        for (const k of Object.keys(rawRow)) {
          row[k.toLowerCase().trim()] = rawRow[k];
        }

        const cropName = (row.crop || row.crop_name || row['commodity'] || row['crop name'] || row['productname'] || '').toString().trim();
        const regionName = (row.region || row.region_name || row['county'] || row['district'] || '').toString().trim();
        const marketName = (row.market || row.market_name || row['market name'] || '').toString().trim();
        
        const priceRaw = row.price ?? row['unit price'] ?? row['wholesale'] ?? row['retail'];
        const priceVal = parseFloat(String(priceRaw).replace(/,/g, ''));

        const dateRaw = row.entry_date || row.date || row['date'] || new Date();
        const entryDate = new Date(dateRaw).toISOString();

        if (!cropName || !regionName || isNaN(priceVal)) {
          skippedCount++;
          continue;
        }

        
        let cropId;
        const cropRes = await client.query('SELECT id FROM crops WHERE LOWER(name) = LOWER($1)', [cropName]);
        if (cropRes.rows.length > 0) {
          cropId = cropRes.rows[0].id;
        } else {
          const cat = categorizeCrop(cropName);
          const unit = determineUnit(cat, cropName);
          const newCrop = await client.query(
             'INSERT INTO crops(name, category, unit, is_active) VALUES ($1, $2, $3, true) RETURNING id', 
             [cropName, cat, unit]
          );
          cropId = newCrop.rows[0].id;
        }

         
        let regionId;
        const regionRes = await client.query('SELECT id FROM regions WHERE LOWER(name) = LOWER($1)', [regionName]);
        if (regionRes.rows.length > 0) {
          regionId = regionRes.rows[0].id;
        } else {
          const newRegion = await client.query(
             'INSERT INTO regions(name, code, is_active) VALUES ($1, $2, true) RETURNING id',
             [regionName, regionName.toUpperCase().replace(/\s/g, '_')]
          );
          regionId = newRegion.rows[0].id;
        }
 
        let marketId = null;
        if (marketName) {
            const marketRes = await client.query('SELECT id FROM markets WHERE LOWER(name) = LOWER($1) AND region_id = $2', [marketName, regionId]);
            if (marketRes.rows.length > 0) {
                marketId = marketRes.rows[0].id;
            } else {
                const newMarket = await client.query(
                    'INSERT INTO markets(name, region_id, is_active) VALUES ($1, $2, true) RETURNING id',
                    [marketName, regionId]
                );
                marketId = newMarket.rows[0].id;
            }
        }
 
        const dupCheck = await client.query(
            `SELECT id FROM price_entries WHERE crop_id=$1 AND region_id=$2 AND market_id IS NOT DISTINCT FROM $3 AND DATE(entry_date)=DATE($4)`,
            [cropId, regionId, marketId, entryDate]
        );

        if (dupCheck.rows.length === 0) {
            await client.query(
                `INSERT INTO price_entries (crop_id, region_id, market_id, price, entry_date, source, is_verified)
                 VALUES ($1, $2, $3, $4, $5, 'kamis', true)`,
                [cropId, regionId, marketId, priceVal, entryDate]
            );
            insertedCount++;
        } else {
            skippedCount++;
        }

      } catch (rowError) {
        errorCount++;
        logger.error('Row import error', rowError);
      }
    }

    return {
      inserted: insertedCount,
      skipped: skippedCount,
      errors: errorCount,
      total_rows: rows.length
    };
  });
}
 

const startSyncLog = async (): Promise<string> => { 
    await query(`CREATE TABLE IF NOT EXISTS kamis_sync_logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        sync_date TIMESTAMP DEFAULT NOW(),
        completed_at TIMESTAMP,
        records_processed INT DEFAULT 0,
        records_inserted INT DEFAULT 0,
        records_updated INT DEFAULT 0,
        status VARCHAR(50),
        error_message TEXT
    )`);
 
    const result = await query(
      'INSERT INTO kamis_sync_logs (status, sync_date) VALUES ($1, NOW()) RETURNING id',
      ['running']
    );
    return result.rows[0].id;
};
  
const updateSyncLog = async (id: string, processed: number, inserted: number, updated: number, status: string, errorMessage?: string) => {
    await query(
      `UPDATE kamis_sync_logs 
       SET records_processed = $1, records_inserted = $2, records_updated = $3, 
           status = $4, error_message = $5, completed_at = CURRENT_TIMESTAMP
       WHERE id = $6`,
      [processed, inserted, updated, status, errorMessage, id]
    );
};

export const getKamisSyncStatus = async (): Promise<any> => {
    try { 
        const result = await query('SELECT * FROM kamis_sync_logs ORDER BY sync_date DESC LIMIT 1');
        if (result.rows.length === 0) return { last_sync: null, records_synced: 0, is_active: false };
        const row = result.rows[0];
        return {
            last_sync: row.sync_date,
            records_synced: (row.records_inserted || 0) + (row.records_updated || 0),
            is_active: row.status === 'running'
        };
    } catch (e) {
        return { last_sync: null, records_synced: 0, is_active: false };
    }
};