import { Request, Response, NextFunction } from 'express';
import { query, transaction } from '../database/connection';
import { ApiError } from '../utils/apiError';
import { logger } from '../utils/logger';
import type { PriceEntry, CreatePriceEntry, PriceQueryParams, ApiResponse } from '../types/index';

export const getPrices = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      page = 1,
      limit = 20,
      crop_id,
      region_id,
      market_id,
      source,
      verified,
      date_from,
      date_to,
      sort = 'entry_date',
      order = 'desc'
    } = req.query as PriceQueryParams;

    const offset = (page - 1) * limit;
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    // Build WHERE conditions
    if (crop_id) {
      conditions.push(`pe.crop_id = $${paramIndex++}`);
      params.push(crop_id);
    }
    if (region_id) {
      conditions.push(`pe.region_id = $${paramIndex++}`);
      params.push(region_id);
    }
    if (market_id) {
      conditions.push(`pe.market_id = $${paramIndex++}`);
      params.push(market_id);
    }
    if (source) {
      conditions.push(`pe.source = $${paramIndex++}`);
      params.push(source);
    }
    if (verified !== undefined) {
      conditions.push(`pe.is_verified = $${paramIndex++}`);
      params.push(verified);
    }
    if (date_from) {
      conditions.push(`pe.entry_date >= $${paramIndex++}`);
      params.push(date_from);
    }
    if (date_to) {
      conditions.push(`pe.entry_date <= $${paramIndex++}`);
      params.push(date_to);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Add pagination params
    params.push(limit, offset);

    const result = await query(
      `SELECT pe.*, 
              c.name as crop_name,
              r.name as region_name,
              m.name as market_name,
              u1.full_name as entered_by_name,
              u2.full_name as verified_by_name
       FROM price_entries pe
       JOIN crops c ON pe.crop_id = c.id
       JOIN regions r ON pe.region_id = r.id
       LEFT JOIN markets m ON pe.market_id = m.id
       LEFT JOIN users u1 ON pe.entered_by = u1.id
       LEFT JOIN users u2 ON pe.verified_by = u2.id
       ${whereClause}
       ORDER BY pe.${sort} ${order.toUpperCase()}
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      params
    );

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) FROM price_entries pe ${whereClause}`,
      params.slice(0, -2) // Remove limit and offset
    );

    const total = parseInt(countResult.rows[0].count);
    const pages = Math.ceil(total / limit);

    const response: ApiResponse<PriceEntry[]> = {
      success: true,
      message: 'Prices retrieved successfully',
      data: result.rows,
      pagination: {
        page,
        limit,
        total,
        pages
      }
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};

export const createPriceEntry = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      crop_id,
      region_id,
      market_id,
      price,
      unit = 'kg',
      source = 'farmer',
      notes,
      entry_date
    }: CreatePriceEntry = req.body;

    const enteredBy = req.user?.id;

    const result = await query(
      `INSERT INTO price_entries (crop_id, region_id, market_id, price, unit, source, entered_by, notes, entry_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, crop_id, region_id, market_id, price, unit, source, notes, entry_date, created_at`,
      [crop_id, region_id, market_id, price, unit, source, enteredBy, notes, entry_date || new Date()]
    );

    logger.info(`New price entry created: ${crop_id} - ${price} by ${req.user?.email || 'system'}`);

    const response: ApiResponse<PriceEntry> = {
      success: true,
      message: 'Price entry created successfully',
      data: result.rows[0]
    };

    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
};

export const updatePriceEntry = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { price, notes, is_verified } = req.body;
    const userId = req.user!.id;

    const result = await query(
      `UPDATE price_entries 
       SET price = COALESCE($1, price),
           notes = COALESCE($2, notes),
           is_verified = COALESCE($3, is_verified),
           verified_by = CASE WHEN $3 = true THEN $4 ELSE verified_by END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING *`,
      [price, notes, is_verified, userId, id]
    );

    if (result.rows.length === 0) {
      throw new ApiError('Price entry not found', 404);
    }

    logger.info(`Price entry updated: ${id} by ${req.user!.email}`);

    const response: ApiResponse<PriceEntry> = {
      success: true,
      message: 'Price entry updated successfully',
      data: result.rows[0]
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};

export const deletePriceEntry = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;

    const result = await query('DELETE FROM price_entries WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      throw new ApiError('Price entry not found', 404);
    }

    logger.info(`Price entry deleted: ${id} by ${req.user!.email}`);

    const response: ApiResponse = {
      success: true,
      message: 'Price entry deleted successfully'
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};

export const getPendingVerifications = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const result = await query(
      `SELECT pe.*, 
              c.name as crop_name,
              r.name as region_name,
              m.name as market_name,
              u.full_name as entered_by_name
       FROM price_entries pe
       JOIN crops c ON pe.crop_id = c.id
       JOIN regions r ON pe.region_id = r.id
       LEFT JOIN markets m ON pe.market_id = m.id
       LEFT JOIN users u ON pe.entered_by = u.id
       WHERE pe.is_verified = false
       ORDER BY pe.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const countResult = await query('SELECT COUNT(*) FROM price_entries WHERE is_verified = false');
    const total = parseInt(countResult.rows[0].count);
    const pages = Math.ceil(total / Number(limit));

    const response: ApiResponse<PriceEntry[]> = {
      success: true,
      message: 'Pending verifications retrieved successfully',
      data: result.rows,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages
      }
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};

export const verifyPriceEntry = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const result = await query(
      `UPDATE price_entries 
       SET is_verified = true, verified_by = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND is_verified = false
       RETURNING *`,
      [userId, id]
    );

    if (result.rows.length === 0) {
      throw new ApiError('Price entry not found or already verified', 404);
    }

    logger.info(`Price entry verified: ${id} by ${req.user!.email}`);

    const response: ApiResponse<PriceEntry> = {
      success: true,
      message: 'Price entry verified successfully',
      data: result.rows[0]
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};

export const rejectPriceEntry = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;

    const result = await query('DELETE FROM price_entries WHERE id = $1 AND is_verified = false RETURNING id', [id]);

    if (result.rows.length === 0) {
      throw new ApiError('Price entry not found or already verified', 404);
    }

    logger.info(`Price entry rejected: ${id} by ${req.user!.email}`);

    const response: ApiResponse = {
      success: true,
      message: 'Price entry rejected successfully'
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};