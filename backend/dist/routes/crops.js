import { Router } from 'express';
import { validate, schemas } from '../middleware/validation.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { query } from '../database/connection.js';
import { ApiError } from '../utils/apiError.js';
const router = Router();
// Get all crops (public)
router.get('/', async (req, res, next) => {
    try {
        const { category, is_active = true } = req.query;
        const conditions = [];
        const params = [];
        let paramIndex = 1;
        if (is_active !== undefined) {
            conditions.push(`is_active = $${paramIndex++}`);
            params.push(is_active);
        }
        if (category) {
            conditions.push(`category = $${paramIndex++}`);
            params.push(category);
        }
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const result = await query(`SELECT * FROM crops ${whereClause} ORDER BY name ASC`, params);
        const response = {
            success: true,
            message: 'Crops retrieved successfully',
            data: result.rows
        };
        res.json(response);
    }
    catch (error) {
        next(error);
    }
});
// Get crop by ID (public)
router.get('/:id', async (req, res, next) => {
    try {
        const { id } = req.params;
        const result = await query('SELECT * FROM crops WHERE id = $1', [id]);
        if (result.rows.length === 0) {
            throw new ApiError('Crop not found', 404);
        }
        const response = {
            success: true,
            message: 'Crop retrieved successfully',
            data: result.rows[0]
        };
        res.json(response);
    }
    catch (error) {
        next(error);
    }
});
// Create crop (admin only)
router.post('/', authenticate, requireAdmin, validate(schemas.createCrop), async (req, res, next) => {
    try {
        const { name, category, description, unit = 'kg' } = req.body;
        const result = await query('INSERT INTO crops (name, category, description, unit) VALUES ($1, $2, $3, $4) RETURNING *', [name, category, description, unit]);
        const response = {
            success: true,
            message: 'Crop created successfully',
            data: result.rows[0]
        };
        res.status(201).json(response);
    }
    catch (error) {
        next(error);
    }
});
// Update crop (admin only)
router.put('/:id', authenticate, requireAdmin, validate(schemas.updateCrop), async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, category, description, unit, is_active } = req.body;
        const result = await query(`UPDATE crops 
       SET name = COALESCE($1, name),
           category = COALESCE($2, category),
           description = COALESCE($3, description),
           unit = COALESCE($4, unit),
           is_active = COALESCE($5, is_active),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING *`, [name, category, description, unit, is_active, id]);
        if (result.rows.length === 0) {
            throw new ApiError('Crop not found', 404);
        }
        const response = {
            success: true,
            message: 'Crop updated successfully',
            data: result.rows[0]
        };
        res.json(response);
    }
    catch (error) {
        next(error);
    }
});
// Delete crop (admin only)
router.delete('/:id', authenticate, requireAdmin, async (req, res, next) => {
    try {
        const { id } = req.params;
        const result = await query('DELETE FROM crops WHERE id = $1 RETURNING id', [id]);
        if (result.rows.length === 0) {
            throw new ApiError('Crop not found', 404);
        }
        const response = {
            success: true,
            message: 'Crop deleted successfully'
        };
        res.json(response);
    }
    catch (error) {
        next(error);
    }
});
export default router;
//# sourceMappingURL=crops.js.map