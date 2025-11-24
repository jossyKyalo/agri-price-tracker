import pool from '../database/connection';
 
const categorizeCrop = (commodityName: string): string => {
  const lowerName = (commodityName || '').toLowerCase();
 
  if (lowerName.match(/fertilizer/)) return 'farm_inputs';
  if (lowerName.match(/sunflower cake|cotton seed cake|bran|pollard/)) return 'animal_feeds';

   
  if (lowerName.match(/oil|cooking fat/)) return 'processed_products';
 
  if (lowerName.match(/egg|milk|honey|beef|mutton|pork|meat|ghee|butter|yoghurt|cream/)) return 'animal_products';

  
  if (lowerName.match(/tea|coffee|cotton|macadamia|cashew|korosho|sisal|pyrethrum|sunflower/)) return 'cash_crops';

   
  if (lowerName.match(/donkey|cattle|cow|bull|goat|sheep|camel|pig|livestock|heifer|steer|rabbit/)) return 'livestock';
  
   
  if (lowerName.match(/chicken|poultry|turkey|duck|geese|hen/)) return 'poultry';
  
  
  if (lowerName.match(/fish|tilapia|omena|nile perch|catfish|mudfish|haplochromis|trout|carp|protopterus|bass|labeo|mormyrus|eel|synodontis|alestes|barbus|snapper|demersal|barracuda|kasumba|tuna|mackerel|shark|sardine|lobster|kamba|prawn|crab|kaa|shrimp|octopus|pweza|squid|ngisi|oyster|scavenger|changu|tangu|grouper|grunt|taamamba|kora|mullet|fumi|threadfin|bream|jack|trevally|kolekole|halfbeak|anchov|herring|marlin|pelagic|rockcode|tewa/)) return 'fisheries';
  
  
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
 
  if (lowerName.match(/milk|oil|juice|honey|yoghurt/)) return 'litre';
 
  if (lowerName.match(/egg/)) return 'tray';
 
  if (category === 'livestock') return 'head';
  if (category === 'poultry') return 'bird';
   
  if (lowerName.match(/timber|post|pole/)) return 'piece';
 
  if (lowerName.match(/pineapple|watermelon|coconut|pumpkin|butternut|cabbage/)) return 'piece';
 
  return 'kg';
};

const updateMetadata = async () => {
  try {
    console.log('🚀 Starting Metadata Fixer (Correcting Milk/Livestock)...');
    
    const result = await pool.query('SELECT id, name, category, unit FROM crops');
    const crops = result.rows;
    
    console.log(`📊 Found ${crops.length} crops in the database.`);
    console.log('🔄 Analyzing and updating...');

    let updatedCount = 0;
    let unchangedCount = 0;

    for (const crop of crops) {
      const newCategory = categorizeCrop(crop.name);
      const newUnit = determineUnit(newCategory, crop.name);
 
      if (crop.category !== newCategory || crop.unit !== newUnit) {
        
        await pool.query(
          'UPDATE crops SET category = $1, unit = $2 WHERE id = $3',
          [newCategory, newUnit, crop.id]
        );
        
        console.log(`   ✅ Fixed: ${crop.name}`);
        console.log(`      Cat: ${crop.category} -> ${newCategory}`);
        console.log(`      Unit: ${crop.unit} -> ${newUnit}`);
        updatedCount++;
      } else {
        unchangedCount++;
      }
    }

    console.log('\n═══════════════════════════════════════════');
    console.log(`🎉 Update Complete!`);
    console.log(`   ✅ Updated: ${updatedCount} crops`);
    console.log(`   ⏭️  Skipped: ${unchangedCount} crops (Already correct)`);
    console.log('═══════════════════════════════════════════');

  } catch (error) {
    console.error('❌ Error updating metadata:', error);
  } finally {
    await pool.end();
    process.exit(0);
  }
};

updateMetadata();