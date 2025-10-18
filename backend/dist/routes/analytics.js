import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { query } from '../database/connection.js';
const router = Router();
// Get price analytics (admin only)
router.get('/prices', authenticate, requireAdmin, async (req, res, next) => {
    try {
        const { period = '30', crop_id, region_id } = req.query;
        const conditions = [`pe.entry_date >= CURRENT_DATE - INTERVAL '${period} days'`];
        const params = [];
        let paramIndex = 1;
        if (crop_id) {
            conditions.push(`pe.crop_id = $${paramIndex++}`);
            params.push(crop_id);
        }
        if (region_id) {
            conditions.push(`pe.region_id = $${paramIndex++}`);
            params.push(region_id);
        }
        const whereClause = `WHERE ${conditions.join(' AND ')}`;
        // Price trends
        const trendsResult = await query(`SELECT 
         DATE(pe.entry_date) as date,
         c.name as crop_name,
         r.name as region_name,
         AVG(pe.price) as avg_price,
         MIN(pe.price) as min_price,
         MAX(pe.price) as max_price,
         COUNT(*) as entries_count
       FROM price_entries pe
       JOIN crops c ON pe.crop_id = c.id
       JOIN regions r ON pe.region_id = r.id
       ${whereClause}
       GROUP BY DATE(pe.entry_date), c.name, r.name, pe.crop_id, pe.region_id
       ORDER BY date DESC, crop_name, region_name`, params);
        // Price volatility
        const volatilityResult = await query(`SELECT 
         c.name as crop_name,
         r.name as region_name,
         STDDEV(pe.price) as price_volatility,
         AVG(pe.price) as avg_price,
         COUNT(*) as data_points
       FROM price_entries pe
       JOIN crops c ON pe.crop_id = c.id
       JOIN regions r ON pe.region_id = r.id
       ${whereClause}
       GROUP BY c.name, r.name
       HAVING COUNT(*) >= 5
       ORDER BY price_volatility DESC`, params);
        const response = {
            success: true,
            message: 'Price analytics retrieved successfully',
            data: {
                trends: trendsResult.rows,
                volatility: volatilityResult.rows,
                period: `${period} days`
            }
        };
        res.json(response);
    }
    catch (error) {
        next(error);
    }
});
// Get user analytics (admin only)
router.get('/users', authenticate, requireAdmin, async (req, res, next) => {
    try {
        const stats = await Promise.all([
            // User registration trends
            query(`
        SELECT 
          DATE(created_at) as date,
          COUNT(*) as registrations
        FROM users 
        WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY DATE(created_at)
        ORDER BY date DESC
      `),
            // User activity by role
            query(`
        SELECT 
          role,
          COUNT(*) as count,
          COUNT(CASE WHEN last_login >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as active_last_week
        FROM users 
        WHERE is_active = true
        GROUP BY role
      `),
            // Regional distribution
            query(`
        SELECT 
          region,
          COUNT(*) as user_count
        FROM users 
        WHERE is_active = true AND region IS NOT NULL
        GROUP BY region
        ORDER BY user_count DESC
      `)
        ]);
        const response = {
            success: true,
            message: 'User analytics retrieved successfully',
            data: {
                registrationTrends: stats[0].rows,
                roleDistribution: stats[1].rows,
                regionalDistribution: stats[2].rows
            }
        };
        res.json(response);
    }
    catch (error) {
        next(error);
    }
});
// Get system analytics (admin only)
router.get('/system', authenticate, requireAdmin, async (req, res, next) => {
    try {
        const stats = await Promise.all([
            // Daily activity
            query(`
        SELECT 
          CURRENT_DATE as date,
          (SELECT COUNT(*) FROM price_entries WHERE DATE(created_at) = CURRENT_DATE) as price_entries,
          (SELECT COUNT(*) FROM sms_logs WHERE DATE(created_at) = CURRENT_DATE) as sms_sent,
          (SELECT COUNT(*) FROM chat_conversations WHERE DATE(created_at) = CURRENT_DATE) as chat_sessions,
          (SELECT COUNT(*) FROM users WHERE DATE(last_login) = CURRENT_DATE) as active_users
      `),
            // Data quality metrics
            query(`
        SELECT 
          COUNT(*) as total_entries,
          COUNT(CASE WHEN is_verified = true THEN 1 END) as verified_entries,
          COUNT(CASE WHEN source = 'kamis' THEN 1 END) as kamis_entries,
          COUNT(CASE WHEN source = 'farmer' THEN 1 END) as farmer_entries,
          COUNT(CASE WHEN source = 'admin' THEN 1 END) as admin_entries
        FROM price_entries
        WHERE entry_date >= CURRENT_DATE - INTERVAL '30 days'
      `),
            // Performance metrics
            query(`
        SELECT 
          COUNT(*) as total_predictions,
          AVG(confidence_score) as avg_confidence,
          COUNT(CASE WHEN confidence_score >= 0.8 THEN 1 END) as high_confidence_predictions
        FROM price_predictions
        WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
      `)
        ]);
        const response = {
            success: true,
            message: 'System analytics retrieved successfully',
            data: {
                dailyActivity: stats[0].rows[0],
                dataQuality: stats[1].rows[0],
                mlPerformance: stats[2].rows[0]
            }
        };
        res.json(response);
    }
    catch (error) {
        next(error);
    }
});
export default router;
//# sourceMappingURL=analytics.js.map