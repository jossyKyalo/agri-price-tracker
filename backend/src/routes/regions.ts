import { Router } from 'express';
import { validate, schemas } from '../middleware/validation.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { query } from '../database/connection.js';
import { ApiError } from '../utils/apiError.js';
import type { ApiResponse } from '../types/index.js';

const router = Router();

// Get all regions (public)
router.get('/', async (req, res, next) => {
  try {
    const { is_active = true } = req.query as { is_active?: boolean };

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (is_active !== undefined) {
      conditions.push(`is_active = $${paramIndex++}`);
      params.push(is_active);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await query(
      `SELECT * FROM regions ${whereClause} ORDER BY name ASC`,
      params
    );

    const response: ApiResponse = {
      success: true,
      message: 'Regions retrieved successfully',
      data: result.rows
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

// Get region by ID (public)
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await query('SELECT * FROM regions WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      throw new ApiError('Region not found', 404);
    }

    const response: ApiResponse = {
      success: true,
      message: 'Region retrieved successfully',
      data: result.rows[0]
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

// Create region (admin only)
router.post('/', authenticate, requireAdmin, validate(schemas.createRegion), async (req, res, next) => {
  try {
    const { name, code, description } = req.body;

    const result = await query(
      'INSERT INTO regions (name, code, description) VALUES ($1, $2, $3) RETURNING *',
      [name, code, description]
    );

    const response: ApiResponse = {
      success: true,
      message: 'Region created successfully',
      data: result.rows[0]
    };

    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
});

// Update region (admin only)
router.put('/:id', authenticate, requireAdmin, validate(schemas.updateRegion), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, code, description, is_active } = req.body;

    const result = await query(
      `UPDATE regions 
       SET name = COALESCE($1, name),
           code = COALESCE($2, code),
           description = COALESCE($3, description),
           is_active = COALESCE($4, is_active),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING *`,
      [name, code, description, is_active, id]
    );

    if (result.rows.length === 0) {
      throw new ApiError('Region not found', 404);
    }

    const response: ApiResponse = {
      success: true,
      message: 'Region updated successfully',
      data: result.rows[0]
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

// Delete region (admin only)
router.delete('/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await query('DELETE FROM regions WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      throw new ApiError('Region not found', 404);
    }

    const response: ApiResponse = {
      success: true,
      message: 'Region deleted successfully'
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

export default router;
