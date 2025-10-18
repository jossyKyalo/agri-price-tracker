import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { getKamisSyncStatus, manualKamisSync } from '../services/kamisService.js';
import { query } from '../database/connection.js';
const router = Router();
// Get KAMIS sync status (admin only)
router.get('/status', authenticate, requireAdmin, async (req, res, next) => {
    try {
        const status = await getKamisSyncStatus();
        const response = {
            success: true,
            message: 'KAMIS sync status retrieved successfully',
            data: status
        };
        res.json(response);
    }
    catch (error) {
        next(error);
    }
});
// Manual KAMIS sync (admin only)
router.post('/sync', authenticate, requireAdmin, async (req, res, next) => {
    try {
        // Start sync in background
        manualKamisSync().catch(error => {
            console.error('Manual KAMIS sync failed:', error);
        });
        const response = {
            success: true,
            message: 'KAMIS sync started successfully'
        };
        res.json(response);
    }
    catch (error) {
        next(error);
    }
});
// Get KAMIS sync logs (admin only)
router.get('/logs', authenticate, requireAdmin, async (req, res, next) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const offset = (Number(page) - 1) * Number(limit);
        const result = await query(`SELECT * FROM kamis_sync_logs 
       ORDER BY started_at DESC 
       LIMIT $1 OFFSET $2`, [limit, offset]);
        const countResult = await query('SELECT COUNT(*) FROM kamis_sync_logs');
        const total = parseInt(countResult.rows[0].count);
        const pages = Math.ceil(total / Number(limit));
        const response = {
            success: true,
            message: 'KAMIS sync logs retrieved successfully',
            data: result.rows,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total,
                pages
            }
        };
        res.json(response);
    }
    catch (error) {
        next(error);
    }
});
export default router;
//# sourceMappingURL=kamis.js.map