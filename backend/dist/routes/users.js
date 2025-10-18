import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { query } from '../database/connection.js';
import { ApiError } from '../utils/apiError.js';
const router = Router();
// Get all users (admin only)
router.get('/', authenticate, requireAdmin, async (req, res, next) => {
    try {
        const { page = 1, limit = 20, role, region, is_active } = req.query;
        const offset = (page - 1) * limit;
        const conditions = [];
        const params = [];
        let paramIndex = 1;
        if (role) {
            conditions.push(`role = $${paramIndex++}`);
            params.push(role);
        }
        if (region) {
            conditions.push(`region ILIKE $${paramIndex++}`);
            params.push(`%${region}%`);
        }
        if (is_active !== undefined) {
            conditions.push(`is_active = $${paramIndex++}`);
            params.push(is_active);
        }
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        params.push(limit, offset);
        const result = await query(`SELECT id, email, full_name, phone, role, region, organization, 
              is_active, email_verified, last_login, created_at, updated_at
       FROM users ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`, params);
        const countResult = await query(`SELECT COUNT(*) FROM users ${whereClause}`, params.slice(0, -2));
        const total = parseInt(countResult.rows[0].count);
        const pages = Math.ceil(total / limit);
        const response = {
            success: true,
            message: 'Users retrieved successfully',
            data: result.rows,
            pagination: {
                page,
                limit,
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
// Get user by ID (admin only)
router.get('/:id', authenticate, requireAdmin, async (req, res, next) => {
    try {
        const { id } = req.params;
        const result = await query(`SELECT id, email, full_name, phone, role, region, organization, 
              is_active, email_verified, last_login, created_at, updated_at
       FROM users WHERE id = $1`, [id]);
        if (result.rows.length === 0) {
            throw new ApiError('User not found', 404);
        }
        const response = {
            success: true,
            message: 'User retrieved successfully',
            data: result.rows[0]
        };
        res.json(response);
    }
    catch (error) {
        next(error);
    }
});
// Update user status (admin only)
router.put('/:id/status', authenticate, requireAdmin, async (req, res, next) => {
    try {
        const { id } = req.params;
        const { is_active } = req.body;
        const result = await query('UPDATE users SET is_active = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *', [is_active, id]);
        if (result.rows.length === 0) {
            throw new ApiError('User not found', 404);
        }
        const response = {
            success: true,
            message: `User ${is_active ? 'activated' : 'deactivated'} successfully`,
            data: result.rows[0]
        };
        res.json(response);
    }
    catch (error) {
        next(error);
    }
});
// Update user role (admin only)
router.put('/:id/role', authenticate, requireAdmin, async (req, res, next) => {
    try {
        const { id } = req.params;
        const { role } = req.body;
        if (!['farmer', 'admin', 'super_admin'].includes(role)) {
            throw new ApiError('Invalid role', 400);
        }
        const result = await query('UPDATE users SET role = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *', [role, id]);
        if (result.rows.length === 0) {
            throw new ApiError('User not found', 404);
        }
        const response = {
            success: true,
            message: 'User role updated successfully',
            data: result.rows[0]
        };
        res.json(response);
    }
    catch (error) {
        next(error);
    }
});
// Delete user (admin only)
router.delete('/:id', authenticate, requireAdmin, async (req, res, next) => {
    try {
        const { id } = req.params;
        // Prevent deleting super admin
        const userCheck = await query('SELECT role FROM users WHERE id = $1', [id]);
        if (userCheck.rows.length > 0 && userCheck.rows[0].role === 'super_admin') {
            throw new ApiError('Cannot delete super admin user', 403);
        }
        const result = await query('DELETE FROM users WHERE id = $1 RETURNING id', [id]);
        if (result.rows.length === 0) {
            throw new ApiError('User not found', 404);
        }
        const response = {
            success: true,
            message: 'User deleted successfully'
        };
        res.json(response);
    }
    catch (error) {
        next(error);
    }
});
export default router;
//# sourceMappingURL=users.js.map