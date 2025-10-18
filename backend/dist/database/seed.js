import { query } from './connection.js';
import { logger } from '../utils/logger.js';
import bcrypt from 'bcryptjs';
export const seedDatabase = async () => {
    try {
        logger.info('Starting database seeding...');
        // Seed regions
        const regions = [
            { name: 'Central Kenya', code: 'CENTRAL' },
            { name: 'Western Kenya', code: 'WESTERN' },
            { name: 'Eastern Kenya', code: 'EASTERN' },
            { name: 'Rift Valley', code: 'RIFT_VALLEY' },
            { name: 'Coast', code: 'COAST' },
            { name: 'Northern Kenya', code: 'NORTHERN' },
            { name: 'Nyanza', code: 'NYANZA' }
        ];
        for (const region of regions) {
            await query(`INSERT INTO regions (name, code) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING`, [region.name, region.code]);
        }
        // Seed crops
        const crops = [
            { name: 'Maize', category: 'cereals' },
            { name: 'Beans', category: 'legumes' },
            { name: 'Tomatoes', category: 'vegetables' },
            { name: 'Potatoes', category: 'vegetables' },
            { name: 'Onions', category: 'vegetables' },
            { name: 'Bananas', category: 'fruits' },
            { name: 'Rice', category: 'cereals' },
            { name: 'Wheat', category: 'cereals' },
            { name: 'Carrots', category: 'vegetables' },
            { name: 'Cabbage', category: 'vegetables' },
            { name: 'Kale', category: 'vegetables' },
            { name: 'Spinach', category: 'vegetables' },
            { name: 'Mangoes', category: 'fruits' },
            { name: 'Avocados', category: 'fruits' },
            { name: 'Oranges', category: 'fruits' },
            { name: 'Pineapples', category: 'fruits' },
            { name: 'Green Grams', category: 'legumes' },
            { name: 'Cowpeas', category: 'legumes' },
            { name: 'Groundnuts', category: 'legumes' },
            { name: 'Sweet Potatoes', category: 'vegetables' }
        ];
        for (const crop of crops) {
            await query(`INSERT INTO crops (name, category) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING`, [crop.name, crop.category]);
        }
        // Seed markets
        const markets = [
            { name: 'Nairobi Central Market', region: 'Central Kenya' },
            { name: 'Kiambu Market', region: 'Central Kenya' },
            { name: 'Thika Market', region: 'Central Kenya' },
            { name: 'Kisumu Market', region: 'Western Kenya' },
            { name: 'Bungoma Market', region: 'Western Kenya' },
            { name: 'Kakamega Market', region: 'Western Kenya' },
            { name: 'Meru Market', region: 'Eastern Kenya' },
            { name: 'Machakos Market', region: 'Eastern Kenya' },
            { name: 'Kitui Market', region: 'Eastern Kenya' },
            { name: 'Nakuru Market', region: 'Rift Valley' },
            { name: 'Eldoret Market', region: 'Rift Valley' },
            { name: 'Kericho Market', region: 'Rift Valley' },
            { name: 'Mombasa Market', region: 'Coast' },
            { name: 'Malindi Market', region: 'Coast' },
            { name: 'Kisii Market', region: 'Nyanza' },
            { name: 'Homa Bay Market', region: 'Nyanza' }
        ];
        for (const market of markets) {
            const regionResult = await query(`SELECT id FROM regions WHERE name = $1`, [market.region]);
            if (regionResult.rows.length > 0) {
                await query(`INSERT INTO markets (name, region_id) VALUES ($1, $2) ON CONFLICT (name, region_id) DO NOTHING`, [market.name, regionResult.rows[0].id]);
            }
        }
        // Create super admin user
        const hashedPassword = await bcrypt.hash('admin123', 12);
        await query(`INSERT INTO users (email, password_hash, full_name, role, region, organization, is_active, email_verified) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (email) DO NOTHING`, [
            'admin@agriprice.co.ke',
            hashedPassword,
            'System Administrator',
            'super_admin',
            'Central Kenya',
            'AgriPrice System',
            true,
            true
        ]);
        // Seed SMS templates
        const smsTemplates = [
            {
                name: 'Price Alert',
                template: 'AGRI ALERT: {crop} price has {trend} by {percentage}% to KSh {price}/kg in {region}. Current market: {market}',
                variables: ['crop', 'trend', 'percentage', 'price', 'region', 'market'],
                type: 'alert'
            },
            {
                name: 'Daily Price Update',
                template: 'AGRI UPDATE: Today\'s prices - {crop}: KSh {price}/kg ({region}). Prediction: {prediction}. For more info, reply HELP',
                variables: ['crop', 'price', 'region', 'prediction'],
                type: 'update'
            },
            {
                name: 'Weather Alert',
                template: 'AGRI WEATHER: {weather_condition} expected in {region} for next {days} days. Protect your {crop}. More: reply WEATHER',
                variables: ['weather_condition', 'region', 'days', 'crop'],
                type: 'weather'
            }
        ];
        const adminResult = await query(`SELECT id FROM users WHERE email = 'admin@agriprice.co.ke'`);
        if (adminResult.rows.length > 0) {
            const adminId = adminResult.rows[0].id;
            for (const template of smsTemplates) {
                await query(`INSERT INTO sms_templates (name, template, variables, sms_type, created_by) 
           VALUES ($1, $2, $3, $4, $5) ON CONFLICT (name) DO NOTHING`, [
                    template.name,
                    template.template,
                    JSON.stringify(template.variables),
                    template.type,
                    adminId
                ]);
            }
        }
        // Seed system settings
        const systemSettings = [
            {
                key: 'kamis_sync_enabled',
                value: JSON.stringify(true),
                description: 'Enable automatic KAMIS data synchronization'
            },
            {
                key: 'sms_alerts_enabled',
                value: JSON.stringify(true),
                description: 'Enable SMS alert system'
            },
            {
                key: 'ml_predictions_enabled',
                value: JSON.stringify(true),
                description: 'Enable ML price predictions'
            },
            {
                key: 'max_price_variance',
                value: JSON.stringify(50),
                description: 'Maximum price variance percentage for alerts'
            }
        ];
        for (const setting of systemSettings) {
            await query(`INSERT INTO system_settings (key, value, description) 
         VALUES ($1, $2, $3) ON CONFLICT (key) DO NOTHING`, [setting.key, setting.value, setting.description]);
        }
        logger.info('Database seeding completed successfully');
    }
    catch (error) {
        logger.error('Seeding failed:', error);
        throw error;
    }
};
// Run seeding if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    seedDatabase()
        .then(() => {
        logger.info('Seeding completed');
        process.exit(0);
    })
        .catch((error) => {
        logger.error('Seeding failed:', error);
        process.exit(1);
    });
}
//# sourceMappingURL=seed.js.map