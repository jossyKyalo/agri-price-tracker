import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import Papa from 'papaparse';
import pool from '../database/connection';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.join(__dirname, '../ml-model-service/data/raw/kamis_data.csv');

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
  ProductName: string;
}

// Complete mapping of all 47 Kenyan counties to regions
const countyToRegion: Record<string, { region: string; code: string }> = {
  // Nairobi
  'Nairobi': { region: 'Nairobi', code: 'nairobi' },
  
  // Central Kenya
  'Kiambu': { region: 'Central', code: 'central' },
  'Murang\'a': { region: 'Central', code: 'central' },
  'Nyeri': { region: 'Central', code: 'central' },
  'Kirinyaga': { region: 'Central', code: 'central' },
  'Nyandarua': { region: 'Central', code: 'central' },
  
  // Coast
  'Mombasa': { region: 'Coast', code: 'coast' },
  'Kilifi': { region: 'Coast', code: 'coast' },
  'Kwale': { region: 'Coast', code: 'coast' },
  'Lamu': { region: 'Coast', code: 'coast' },
  'Tana River': { region: 'Coast', code: 'coast' },
  'Taita Taveta': { region: 'Coast', code: 'coast' },
  
  // Eastern
  'Machakos': { region: 'Eastern', code: 'eastern' },
  'Kitui': { region: 'Eastern', code: 'eastern' },
  'Makueni': { region: 'Eastern', code: 'eastern' },
  'Embu': { region: 'Eastern', code: 'eastern' },
  'Meru': { region: 'Eastern', code: 'eastern' },
  'Tharaka Nithi': { region: 'Eastern', code: 'eastern' },
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
  'Homa Bay': { region: 'Nyanza', code: 'nyanza' },
  'Migori': { region: 'Nyanza', code: 'nyanza' },
  
  // Rift Valley
  'Nakuru': { region: 'Rift Valley', code: 'rift-valley' },
  'Uasin Gishu': { region: 'Rift Valley', code: 'rift-valley' },
  'Trans Nzoia': { region: 'Rift Valley', code: 'rift-valley' },
  'Nandi': { region: 'Rift Valley', code: 'rift-valley' },
  'Baringo': { region: 'Rift Valley', code: 'rift-valley' },
  'Elgeyo Marakwet': { region: 'Rift Valley', code: 'rift-valley' },
  'Laikipia': { region: 'Rift Valley', code: 'rift-valley' },
  'Narok': { region: 'Rift Valley', code: 'rift-valley' },
  'Kajiado': { region: 'Rift Valley', code: 'rift-valley' },
  'Kericho': { region: 'Rift Valley', code: 'rift-valley' },
  'Bomet': { region: 'Rift Valley', code: 'rift-valley' },
  'Samburu': { region: 'Rift Valley', code: 'rift-valley' },
  'Turkana': { region: 'Rift Valley', code: 'rift-valley' },
  'West Pokot': { region: 'Rift Valley', code: 'rift-valley' },
  
  // Western
  'Kakamega': { region: 'Western', code: 'western' },
  'Bungoma': { region: 'Western', code: 'western' },
  'Vihiga': { region: 'Western', code: 'western' },
  'Busia': { region: 'Western', code: 'western' }
};

const parsePrice = (priceStr: string): number | null => {
  if (!priceStr) return null;
  // Remove any non-numeric characters except decimal point
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

const importKamisData = async () => {
  try {
    console.log(' Starting KAMIS data import...');
    console.log(`Reading file: ${DATA_FILE}\n`);

    // Check database connection
    console.log('🔌 Testing database connection...');
    const connectionTest = await pool.query('SELECT NOW()');
    console.log(` Database connected at: ${connectionTest.rows[0].now}\n`);

    if (!fs.existsSync(DATA_FILE)) {
      console.error(`File not found: ${DATA_FILE}`);
      console.log('\nPlease ensure your CSV file is at:');
      console.log(`  ${DATA_FILE}`);
      console.log('\nExpected columns: Commodity, Classification, Market, Wholesale, Retail, County, Date\n');
      await pool.end();
      process.exit(1);
    }

    const fileContent = fs.readFileSync(DATA_FILE, 'utf-8');
    
    const parseResult = await new Promise<Papa.ParseResult<KamisRecord>>((resolve) => {
      Papa.parse(fileContent, {
        header: true,
        skipEmptyLines: true,
        complete: resolve
      });
    });

    const records = parseResult.data;
    console.log(`Loaded ${records.length} records from CSV\n`);

    // Track unique values for seeding
    const uniqueCrops = new Map<string, { classification: string; productName: string }>();
    const uniqueCounties = new Set<string>();
    const uniqueMarkets = new Map<string, string>(); // market -> county

    // First pass: collect unique crops, counties, and markets
    console.log(' Analyzing data...');
    for (const record of records) {
      if (record.Commodity) {
        uniqueCrops.set(record.Commodity, {
          classification: record.Classification || 'general',
          productName: record.ProductName || record.Commodity
        });
      }
      if (record.County) {
        uniqueCounties.add(record.County);
      }
      if (record.Market && record.County) {
        uniqueMarkets.set(record.Market, record.County);
      }
    }

    console.log(`  Found ${uniqueCrops.size} unique crops`);
    console.log(`  Found ${uniqueCounties.size} unique counties`);
    console.log(`  Found ${uniqueMarkets.size} unique markets\n`);

    // Import regions (consolidate counties into regions)
    console.log('🗺️  Importing regions...');
    const regionSet = new Set<{ name: string; code: string }>();
    
    for (const county of uniqueCounties) {
      const mapping = countyToRegion[county];
      if (mapping) {
        regionSet.add({ name: mapping.region, code: mapping.code });
      } else {
        console.log(`  County not mapped: ${county} - adding as is`);
        regionSet.add({ 
          name: county, 
          code: county.toLowerCase().replace(/\s+/g, '-').replace(/'/g, '') 
        });
      }
    }

    const regionMap = new Map<string, string>(); // region code -> region_id

    for (const region of regionSet) {
      try {
        const result = await pool.query(
          `INSERT INTO regions (name, code, description, is_active)
           VALUES ($1, $2, $3, true)
           ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
           RETURNING id, code`,
          [region.name, region.code, `${region.name} Region`]
        );
        
        regionMap.set(region.code, result.rows[0].id);
        console.log(`  ${region.name} (${region.code})`);
      } catch (error) {
        console.error(`  Error importing ${region.name}:`, error);
      }
    }

    // Create county to region_id mapping
    const countyToRegionId = new Map<string, string>();
    for (const county of uniqueCounties) {
      const mapping = countyToRegion[county];
      if (mapping) {
        const region_id = regionMap.get(mapping.code);
        if (region_id) {
          countyToRegionId.set(county, region_id);
        }
      } else {
        const code = county.toLowerCase().replace(/\s+/g, '-').replace(/'/g, '');
        const region_id = regionMap.get(code);
        if (region_id) {
          countyToRegionId.set(county, region_id);
        }
      }
    }

    // Import crops
    console.log('\n🌱 Importing crops...');
    const cropMap = new Map<string, string>(); // commodity name -> crop_id

    for (const [commodity, info] of uniqueCrops) {
      const category = categorizeCrop(info.classification);
      
      try {
        const result = await pool.query(
          `INSERT INTO crops (name, category, unit, description, is_active)
           VALUES ($1, $2, 'kg', $3, true)
           ON CONFLICT DO NOTHING
           RETURNING id`,
          [commodity, category, info.productName]
        );

        if (result.rows.length > 0) {
          cropMap.set(commodity, result.rows[0].id);
          console.log(`  ✅ ${commodity} (${category})`);
        } else {
          // Crop already exists, get its id
          const existing = await pool.query(
            'SELECT id FROM crops WHERE LOWER(name) = LOWER($1)',
            [commodity]
          );
          if (existing.rows.length > 0) {
            cropMap.set(commodity, existing.rows[0].id);
            console.log(`  ⏭️  ${commodity} (exists)`);
          }
        }
      } catch (error) {
        console.error(`  ❌ Error importing ${commodity}:`, error);
      }
    }

    // Import markets
    console.log('\n🏪 Importing markets...');
    const marketMap = new Map<string, { id: string; region_id: string }>(); // market name -> {id, region_id}

    for (const [marketName, county] of uniqueMarkets) {
      const region_id = countyToRegionId.get(county);
      
      if (!region_id) {
        console.log(`  Region not found for market: ${marketName} (${county})`);
        continue;
      }

      try {
        const result = await pool.query(
          `INSERT INTO markets (name, region_id, location, is_active)
           VALUES ($1, $2, $3, true)
           ON CONFLICT (name, region_id) DO NOTHING
           RETURNING id`,
          [marketName, region_id, county]
        );

        if (result.rows.length > 0) {
          marketMap.set(`${marketName}|${county}`, { id: result.rows[0].id, region_id });
          console.log(` ${marketName} (${county})`);
        } else {
          // Market already exists, get its id
          const existing = await pool.query(
            'SELECT id FROM markets WHERE LOWER(name) = LOWER($1) AND region_id = $2',
            [marketName, region_id]
          );
          if (existing.rows.length > 0) {
            marketMap.set(`${marketName}|${county}`, { id: existing.rows[0].id, region_id });
            console.log(`  ${marketName} (exists)`);
          }
        }
      } catch (error) {
        console.error(` Error importing ${marketName}:`, error);
      }
    }

    // Import prices
    console.log('\nImporting price entries...');
    let wholesaleCount = 0;
    let retailCount = 0;
    let skipped = 0;

    for (const record of records) {
      const crop_id = cropMap.get(record.Commodity);
      const marketKey = `${record.Market}|${record.County}`;
      const marketInfo = marketMap.get(marketKey);
      
      if (!crop_id || !marketInfo) {
        skipped++;
        if (skipped % 100 === 0) {
          console.log(` Skipped ${skipped} records (missing crop or market)...`);
        }
        continue;
      }

      const entryDate = record.Date || new Date().toISOString().split('T')[0];

      try {
        // Import wholesale price
        const wholesalePrice = parsePrice(record.Wholesale);
        if (wholesalePrice !== null && wholesalePrice > 0) {
          await pool.query(
            `INSERT INTO price_entries (
              crop_id, region_id, market_id, price,
              entry_date, source, is_verified
            ) VALUES ($1, $2, $3, $4, $5, 'kamis', true)
            ON CONFLICT DO NOTHING`,
            [
              crop_id,
              marketInfo.region_id,
              marketInfo.id,
              wholesalePrice,
              entryDate
            ]
          );
          wholesaleCount++;
        }

        // Import retail price
        const retailPrice = parsePrice(record.Retail);
        if (retailPrice !== null && retailPrice > 0) {
          await pool.query(
            `INSERT INTO price_entries (
              crop_id, region_id, market_id, price,
              entry_date, source, is_verified
            ) VALUES ($1, $2, $3, $4, $5, 'kamis', true)
            ON CONFLICT DO NOTHING`,
            [
              crop_id,
              marketInfo.region_id,
              marketInfo.id,
              retailPrice,
              entryDate
            ]
          );
          retailCount++;
        }

        if ((wholesaleCount + retailCount) % 200 === 0) {
          console.log(` Imported ${wholesaleCount + retailCount} price entries...`);
        }
      } catch (error) {
        console.error(`Error importing price for ${record.Commodity}:`, error);
        skipped++;
      }
    }

    console.log(`\nPrice import completed!`);
    console.log(`  Wholesale prices: ${wholesaleCount}`);
    console.log(`  Retail prices: ${retailCount}`);
    console.log(`  Skipped: ${skipped}`);
 
    console.log('\n KAMIS data import completed successfully!');
    console.log('═══════════════════════════════════════════');
    
    const stats = await Promise.all([
      pool.query('SELECT COUNT(*) FROM regions'),
      pool.query('SELECT COUNT(*) FROM crops'),
      pool.query('SELECT COUNT(*) FROM markets'),
      pool.query('SELECT COUNT(*) FROM price_entries WHERE source = \'kamis\'')
    ]);
    
    console.log(` Total regions: ${stats[0].rows[0].count}`);
    console.log(` Total crops: ${stats[1].rows[0].count}`);
    console.log(` Total markets: ${stats[2].rows[0].count}`);
    console.log(` Total KAMIS prices: ${stats[3].rows[0].count}`);

    // Show sample data
    console.log('\n Sample crops:');
    const sampleCrops = await pool.query('SELECT name, category FROM crops LIMIT 5');
    sampleCrops.rows.forEach(crop => {
      console.log(`  - ${crop.name} (${crop.category})`);
    });

    console.log('\n Sample regions:');
    const sampleRegions = await pool.query('SELECT name, code FROM regions');
    sampleRegions.rows.forEach(region => {
      console.log(`  - ${region.name} (${region.code})`);
    });

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Fatal error during import:', error);
    await pool.end();
    process.exit(1);
  }
};

importKamisData();