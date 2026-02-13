import fs from 'fs'; 
import path from 'path';
import Papa from 'papaparse';
import pool from '../database/connection';

 
const DATA_FILE = path.join(__dirname, '../ml-model-service/data/raw/kamis_latest.csv');

interface KamisRecord {
  Commodity: string;
  Classification: string;
  Grade: string;
  Sex: string;
  Market: string;
  Wholesale: string;
  Retail: string;
  'Supply Volume': string;
  County: string;
  Date: string;
  ProductID: string;
  CropName: string;
}
 
const countyToRegion: Record<string, { region: string; code: string }> = {
  // Nairobi
  'Nairobi': { region: 'Nairobi', code: 'nairobi' },
  // Central Kenya
  'Kiambu': { region: 'Central', code: 'central' },
  'Muranga': { region: 'Central', code: 'central' },
  'Nyeri': { region: 'Central', code: 'central' },
  'Kirinyaga': { region: 'Central', code: 'central' },
  'Nyandarua': { region: 'Central', code: 'central' },
  // Coast
  'Mombasa': { region: 'Coast', code: 'coast' },
  'Kilifi': { region: 'Coast', code: 'coast' },
  'Kwale': { region: 'Coast', code: 'coast' },
  'Lamu': { region: 'Coast', code: 'coast' },
  'Tana-River': { region: 'Coast', code: 'coast' },
  'Taita-Taveta': { region: 'Coast', code: 'coast' },
  // Eastern
  'Machakos': { region: 'Eastern', code: 'eastern' },
  'Kitui': { region: 'Eastern', code: 'eastern' },
  'Makueni': { region: 'Eastern', code: 'eastern' },
  'Embu': { region: 'Eastern', code: 'eastern' },
  'Meru': { region: 'Eastern', code: 'eastern' },
  'Tharaka-Nithi': { region: 'Eastern', code: 'eastern' },
  'Isiolo': { region: 'Eastern', code: 'eastern' },
  'Marsabit': { region: 'Eastern', code: 'eastern' },
  // North Eastern
  'Garissa': { region: 'North Eastern', code: 'north-eastern' },
  'Wajir': { region: 'North Eastern', code: 'north-eastern' },
  'Mandera': { region: 'North Eastern', code: 'north-eastern' },
  // Nyanza
  'Kisumu': { region: 'Nyanza', code: 'nyanza' },
  'Siaya': { region: 'Nyanza', code: 'nyanza' },
  'Kisii': { region: 'Nyanza', code: 'nyanza' },
  'Nyamira': { region: 'Nyanza', code: 'nyanza' },
  'Homa-bay': { region: 'Nyanza', code: 'nyanza' },
  'Migori': { region: 'Nyanza', code: 'nyanza' },
  // Rift Valley
  'Nakuru': { region: 'Rift Valley', code: 'rift-valley' },
  'Uasin-Gishu': { region: 'Rift Valley', code: 'rift-valley' },
  'Trans-Nzoia': { region: 'Rift Valley', code: 'rift-valley' },
  'Nandi': { region: 'Rift Valley', code: 'rift-valley' },
  'Baringo': { region: 'Rift Valley', code: 'rift-valley' },
  'Elgeyo-Marakwet': { region: 'Rift Valley', code: 'rift-valley' },
  'Laikipia': { region: 'Rift Valley', code: 'rift-valley' },
  'Narok': { region: 'Rift Valley', code: 'rift-valley' },
  'Kajiado': { region: 'Rift Valley', code: 'rift-valley' },
  'Kericho': { region: 'Rift Valley', code: 'rift-valley' },
  'Bomet': { region: 'Rift Valley', code: 'rift-valley' },
  'Samburu': { region: 'Rift Valley', code: 'rift-valley' },
  'Turkana': { region: 'Rift Valley', code: 'rift-valley' },
  'West-Pokot': { region: 'Rift Valley', code: 'rift-valley' },
  // Western
  'Kakamega': { region: 'Western', code: 'western' },
  'Bungoma': { region: 'Western', code: 'western' },
  'Vihiga': { region: 'Western', code: 'western' },
  'Busia': { region: 'Western', code: 'western' }
};

const parsePrice = (priceStr: string): number | null => {
  if (!priceStr) return null; 
  const cleaned = priceStr.toString().replace(/[^\d.]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? null : parsed;
};

const categorizeCrop = (classification: string): string => {
  if (!classification) return 'general';
  
  const lowerClass = classification.toLowerCase();
  
  if (lowerClass.includes('cereal')) return 'cereals';
  if (lowerClass.includes('legume') || lowerClass.includes('pulse')) return 'legumes';
  if (lowerClass.includes('vegetable')) return 'vegetables';
  if (lowerClass.includes('fruit')) return 'fruits';
  if (lowerClass.includes('root') || lowerClass.includes('tuber')) return 'root_tubers';
  if (lowerClass.includes('livestock') || lowerClass.includes('animal')) return 'livestock';
  if (lowerClass.includes('dairy')) return 'dairy';
  if (lowerClass.includes('poultry')) return 'poultry';
  
  return 'general';
};

const validateAndFixDate = (dateStr: string): string | null => {
    if (!dateStr) return null;

    const today = new Date();
    today.setDate(today.getDate() + 1);
    
    let targetDate = new Date(dateStr);

    if (!isNaN(targetDate.getTime()) && targetDate <= today) {
        return dateStr;
    }

    const parts = dateStr.split('-');
    if (parts.length === 3) {
        const year = parseInt(parts[0] || '0');
        const month = parseInt(parts[1] || '0');
        const day = parseInt(parts[2] || '0');

        if (day <= 12) {
            const fixedDate = new Date(year, day - 1, month);
            const y = fixedDate.getFullYear();
            const m = String(fixedDate.getMonth() + 1).padStart(2, '0');
            const d = String(fixedDate.getDate()).padStart(2, '0');
            const fixedStr = `${y}-${m}-${d}`;

            if (fixedDate <= today) {
                console.log(`   ⚠️ Fixed Future Date: ${dateStr} -> ${fixedStr}`);
                return fixedStr;
            }
        }
    }

    console.warn(`   ⚠️ Skipped invalid future date: ${dateStr}`);
    return null; 
};

// --- DB Cleanup to remove duplicates/bad regions ---
const cleanupLegacyRegions = async () => {
  console.log('🧹 Running database cleanup & normalization...');
  
  const uniqueTargetRegions = new Set(Object.values(countyToRegion).map(r => JSON.stringify(r)));
  for (const regionJson of uniqueTargetRegions) {
      const r = JSON.parse(regionJson);
      await pool.query(
          `INSERT INTO regions (name, code, description, is_active)
           VALUES ($1, $2, $3, true)
           ON CONFLICT (code) DO NOTHING`,
          [r.region, r.code, `${r.region} Region`]
      );
  }

  let migratedCount = 0;
  for (const [county, mapping] of Object.entries(countyToRegion)) {
      const badCode = county.toLowerCase().replace(/\s+/g, '-').replace(/'/g, '');
      const goodCode = mapping.code;

      if (badCode === goodCode) continue;

      const badRegionRes = await pool.query('SELECT id FROM regions WHERE code = $1', [badCode]);
      const goodRegionRes = await pool.query('SELECT id FROM regions WHERE code = $1', [goodCode]);

      if (badRegionRes.rows.length > 0 && goodRegionRes.rows.length > 0) {
          const badId = badRegionRes.rows[0].id;
          const goodId = goodRegionRes.rows[0].id;

          const badMarkets = await pool.query('SELECT id, name FROM markets WHERE region_id = $1', [badId]);

          for (const market of badMarkets.rows) {
              const existingMarket = await pool.query(
                  'SELECT id FROM markets WHERE region_id = $1 AND name = $2',
                  [goodId, market.name]
              );

              if (existingMarket.rows.length > 0) {
                  const targetMarketId = existingMarket.rows[0].id;
                  
                  await pool.query(`
                      DELETE FROM price_entries pe_bad
                      WHERE market_id = $1
                      AND EXISTS (
                          SELECT 1 FROM price_entries pe_good
                          WHERE pe_good.market_id = $2
                          AND pe_good.crop_id = pe_bad.crop_id
                          AND pe_good.entry_date = pe_bad.entry_date
                      )
                  `, [market.id, targetMarketId]);

                  await pool.query(
                      'UPDATE price_entries SET market_id = $1, region_id = $2 WHERE market_id = $3',
                      [targetMarketId, goodId, market.id]
                  );

                  await pool.query('DELETE FROM markets WHERE id = $1', [market.id]);
              } else {
                  await pool.query('UPDATE markets SET region_id = $1 WHERE id = $2', [goodId, market.id]);
                  await pool.query('UPDATE price_entries SET region_id = $1 WHERE market_id = $2', [goodId, market.id]);
              }
          }
          
          await pool.query('UPDATE price_entries SET region_id = $1 WHERE region_id = $2', [goodId, badId]);
          await pool.query('DELETE FROM price_predictions WHERE region_id = $1', [badId]);
          await pool.query('DELETE FROM regions WHERE id = $1', [badId]);
          migratedCount++;
      }
  }
  if (migratedCount > 0) {
      console.log(`✅ Fixed and removed ${migratedCount} incorrect legacy regions.\n`);
  } else {
      console.log('✅ Database regions are clean.\n');
  }
};

const importKamisData = async () => {
  try {
    console.log('🚀 Starting KAMIS data import...');
    console.log(`📂 Reading delta file: ${DATA_FILE}\n`);
 
    console.log('🔌 Testing database connection...');
    const connectionTest = await pool.query('SELECT NOW()');
    console.log(`✅ Database connected at: ${connectionTest.rows[0].now}\n`);

    await cleanupLegacyRegions();

    if (!fs.existsSync(DATA_FILE)) {
      console.error(`❌ File not found: ${DATA_FILE}`);
      process.exit(1);
    }

    const fileContent = fs.readFileSync(DATA_FILE, 'utf-8');
    if (!fileContent.trim()) {
      console.log('⚠️  File is empty. No new data.');
      process.exit(0);
    }

    const parseResult = await new Promise<Papa.ParseResult<KamisRecord>>((resolve) => {
      Papa.parse(fileContent, { header: true, skipEmptyLines: true, complete: resolve });
    });

    const records = parseResult.data;
    console.log(`📊 Loaded ${records.length} records\n`);
    
    if (records.length > 0 && records[0]) {
        console.log(`🔍 DEBUG: First Record Date in CSV: ${records[0].Date}`);
        const parsedDate = validateAndFixDate(records[0].Date) || 'SKIPPED';
        console.log(`🔍 DEBUG: Will be inserted as: ${parsedDate}\n`);
    }
 
    const uniqueCrops = new Map<string, { classification: string; cropName: string }>();
    const uniqueCounties = new Set<string>();
    const uniqueMarkets = new Map<string, string>();
 
    for (const record of records) {
      if (record.Commodity) uniqueCrops.set(record.Commodity, { classification: record.Classification, cropName: record.CropName || record.Commodity });
      if (record.County) uniqueCounties.add(record.County);
      if (record.Market && record.County) uniqueMarkets.set(record.Market, record.County);
    }

    const regionMap = new Map<string, string>();
    const regionsRes = await pool.query('SELECT id, code FROM regions');
    regionsRes.rows.forEach(r => regionMap.set(r.code, r.id));

    const countyToRegionId = new Map<string, string>();
    for (const county of uniqueCounties) {
      const mapping = countyToRegion[county];
      const code = mapping ? mapping.code : county.toLowerCase().replace(/\s+/g, '-').replace(/'/g, '');
      const rid = regionMap.get(code);
      if (rid) countyToRegionId.set(county, rid);
    }
 
    console.log('\n🌱 Importing crops...');
    const cropMap = new Map<string, string>();
    for (const [commodity, info] of uniqueCrops) {
      const category = categorizeCrop(info.classification);
      const res = await pool.query(
        `INSERT INTO crops (name, category, unit, description, is_active) VALUES ($1, $2, 'kg', $3, true)
         ON CONFLICT (name) DO UPDATE SET category = EXCLUDED.category RETURNING id`,
        [commodity, category, info.cropName]
      );
      cropMap.set(commodity, res.rows[0].id);
    }
 
    console.log('\n🏪 Importing markets...');
    const marketMap = new Map<string, { id: string; region_id: string }>();
    for (const [marketName, county] of uniqueMarkets) {
      const region_id = countyToRegionId.get(county);
      if (!region_id) continue;
      
      try {
          const res = await pool.query(
            `INSERT INTO markets (name, region_id, location, is_active) VALUES ($1, $2, $3, true)
             ON CONFLICT (name, region_id) DO UPDATE SET location = EXCLUDED.location RETURNING id`,
            [marketName, region_id, county]
          );
          marketMap.set(`${marketName}|${county}`, { id: res.rows[0].id, region_id });
      } catch (e) {
          const existing = await pool.query('SELECT id FROM markets WHERE name=$1 AND region_id=$2', [marketName, region_id]);
          if (existing.rows.length > 0) {
              marketMap.set(`${marketName}|${county}`, { id: existing.rows[0].id, region_id });
          }
      }
    }

    console.log('\n💰 Importing price entries...');
    let count = 0;
    
    for (const record of records) {
      const crop_id = cropMap.get(record.Commodity);
      const marketKey = `${record.Market}|${record.County}`;
      const marketInfo = marketMap.get(marketKey);
      
      if (!crop_id || !marketInfo) continue;

      const entryDate = validateAndFixDate(record.Date);
      if (!entryDate) continue; 

      const wholesale = parsePrice(record.Wholesale);
      const retail = parsePrice(record.Retail);

      // --- FIX: Prioritize Retail Price ---
      // If retail exists, use it. Otherwise, use wholesale.
      const priceToSave = (retail && retail > 0) ? retail : (wholesale && wholesale > 0 ? wholesale : null);

      if (priceToSave) {
        await pool.query(
          `INSERT INTO price_entries (crop_id, region_id, market_id, price, entry_date, source, is_verified, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, 'kamis', true, NOW(), NOW())
           ON CONFLICT (crop_id, market_id, entry_date) 
           DO UPDATE SET price = EXCLUDED.price, updated_at = NOW()`,
          [crop_id, marketInfo.region_id, marketInfo.id, priceToSave, entryDate]
        );
        count++;
      }
      
      if (count % 100 === 0) process.stdout.write('.');
    }

    console.log(`\n\n🎉 Import completed! Processed ${count} prices.`);
    await pool.end();
    process.exit(0);

  } catch (error) {
    console.error('❌ Fatal error:', error);
    await pool.end();
    process.exit(1);
  }
};

importKamisData();