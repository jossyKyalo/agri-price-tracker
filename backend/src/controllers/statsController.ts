import { Request, Response, NextFunction } from 'express';
import { query } from '../database/connection';
import { ApiResponse } from '../types';

export const getPublicStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try { 
    const farmerCountResult = await query(
      `SELECT COUNT(*) FROM users WHERE role = 'farmer' AND is_active = true`
    ); 
    
    const response: ApiResponse = {
      success: true,
      message: 'Public stats retrieved',
      data: {
        farmers: parseInt(farmerCountResult.rows[0].count) || 0
      }
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};