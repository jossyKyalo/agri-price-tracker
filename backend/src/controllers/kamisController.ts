import { Request, Response, NextFunction } from 'express';
import * as kamisService from '../services/kamisService';
import { ApiError } from '../utils/apiError';
import { logger } from '../utils/logger';
import { query } from '../database/connection'; 
import fs from 'fs';
import { restartScheduler } from '../services/scheduler.service'; 
 
export const triggerKamisSync = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    logger.info(`Manual KAMIS sync triggered by ${req.user?.email || 'admin'}`);
    
    const result = await kamisService.syncKamisData();

    res.json({
      success: true,
      message: 'Sync completed successfully',
      data: result
    });
  } catch (error) {
    next(error);
  }
};
 
export const uploadKamisData = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.file) {
      throw new ApiError('No file uploaded', 400);
    }

    logger.info(`Processing uploaded file: ${req.file.originalname}`);

    let fileBuffer: Buffer;
 
    if (req.file.buffer) {
        fileBuffer = req.file.buffer;
    } else if (req.file.path) {
        fileBuffer = fs.readFileSync(req.file.path); 
        fs.unlinkSync(req.file.path);
    } else {
        throw new ApiError('File upload failed: No data received', 500);
    }

    const result = await kamisService.processKamisFile(fileBuffer, req.file.originalname);

    res.json({
      success: true,
      message: 'KAMIS file processed successfully',
      data: result
    });

  } catch (error) {
    next(error);
  }
};
 
export const getKamisStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const status = await kamisService.getKamisSyncStatus();
    res.json({
        success: true,
        message: 'KAMIS sync status retrieved successfully',
        data: status
    });
  } catch (error) {
    next(error);
  }
}; 

export const getKamisLogs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const result = await query(
      `SELECT * FROM kamis_sync_logs 
       ORDER BY started_at DESC 
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const countResult = await query('SELECT COUNT(*) FROM kamis_sync_logs');
    const total = parseInt(countResult.rows[0].count);
    const pages = Math.ceil(total / Number(limit));

    res.json({
      success: true,
      message: 'KAMIS sync logs retrieved successfully',
      data: result.rows,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages
      }
    });
  } catch (error) {
    next(error);
  }
};

export const getSyncConfig = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await query(
      "SELECT value FROM system_settings WHERE key = $1", 
      ['kamis_config']
    );
    
    const config = result.rows.length > 0 ? result.rows[0].value : {};

    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    next(error);
  }
};

export const updateSyncConfig = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const configData = req.body;  
    const userId = req.user?.id;
 
    const result = await query(
      `INSERT INTO system_settings (key, value, updated_by, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (key) 
       DO UPDATE SET value = $2, updated_by = $3, updated_at = NOW()
       RETURNING value`,
      ['kamis_config', JSON.stringify(configData), userId]
    );

    logger.info(`KAMIS sync config updated by ${req.user?.email}`);
    
     
    await restartScheduler();

    res.json({
      success: true,
      message: 'Configuration saved and scheduler updated',
      data: result.rows[0].value
    });
  } catch (error) {
    next(error);
  }
};