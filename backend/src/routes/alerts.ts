import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth';
import { query } from '../database/connection';
import type { ApiResponse } from '../types/index';

const router = Router();

// Get system alerts (admin only)
router.get('/', authenticate, requireAdmin, async (req, res, next) => {
  try {
    // 1. KAMIS sync failures
    const kamisAlerts = await query(
      `SELECT id, 
              CASE 
                  WHEN status = 'failed' THEN 'danger'
                  WHEN status = 'pending' THEN 'warning'
                  ELSE 'info'
              END AS type,
              COALESCE(error_message, 'KAMIS sync issue') AS message,
              started_at AS created_at
       FROM kamis_sync_logs
       WHERE status != 'completed'
       ORDER BY started_at DESC
       LIMIT 20`
    );

    // 2. Low verified price entries in the last 7 days (data quality alert)
    const lowVerifiedEntries = await query(
      `SELECT uuid_generate_v4() AS id,
              'warning' AS type,
              CONCAT('Low verified entries in region ', r.name) AS message,
              CURRENT_TIMESTAMP AS created_at
       FROM regions r
       LEFT JOIN price_entries pe 
         ON pe.region_id = r.id 
        AND pe.is_verified = true 
        AND pe.entry_date >= CURRENT_DATE - INTERVAL '7 days'
       GROUP BY r.id
       HAVING COUNT(pe.id) < 5`
    );

    // Combine alerts
    const alerts = [...kamisAlerts.rows, ...lowVerifiedEntries.rows];

    const response: ApiResponse = {
      success: true,
      message: 'System alerts retrieved successfully',
      data: alerts
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

export default router;
