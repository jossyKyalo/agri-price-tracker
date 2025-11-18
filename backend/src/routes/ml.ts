import { Router } from 'express';
import { authenticate, requireAdmin, optionalAuth } from '../middleware/auth';
import { generatePricePrediction, getPredictions, generateDailyPredictions } from '../services/mlService';
import type { ApiResponse } from '../types/index';
import { query } from '../database/connection';
import { logger } from '../utils/logger';
import { ApiError } from '../utils/apiError';
import axios from 'axios';

const router = Router();

router.get('/', optionalAuth, async (req, res, next): Promise<void> => {
  try {
    const mlServiceResponse = await axios.get(
      `${process.env.ML_MODEL_URL}/`,
      { timeout: 5000 }
    );

    const response: ApiResponse = {
      success: true,
      message: 'ML service status retrieved successfully',
      data: mlServiceResponse.data
    };
    res.json(response);

  } catch (error: any) {
    logger.error('Failed to connect to ML service:', error.message);
    next(new ApiError('ML service is unavailable', 503));
  }
});

router.get('/predictions', optionalAuth, async (req, res, next): Promise<void> => {
  try {
    const { crop_id, region_id, limit = 20 } = req.query;

    const predictions = await getPredictions(
      crop_id as string,
      region_id as string,
      Number(limit)
    );

    const response: ApiResponse = {
      success: true,
      message: 'Price predictions retrieved successfully',
      data: predictions
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});


router.post('/predictions/generate', authenticate, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const { crop_id, region_id, market_id, prediction_days = 7 } = req.body;

    if (!crop_id || !region_id || !market_id) {
      res.status(400).json({
        success: false,
        message: 'crop_id, region_id, and market_id are required'
      });
      return;
    }

    const namesResult = await query(
      `SELECT 
        (SELECT name FROM crops WHERE id = $1) as crop_name,
        (SELECT name FROM regions WHERE id = $2) as region_name,
        (SELECT name FROM markets WHERE id = $3) as market_name
      `,
      [crop_id, region_id, market_id]
    );

    if (namesResult.rows.length === 0) {
      const err: any = new Error('Could not find names for one or more IDs.');
      err.status = 500;
      throw err;
    }

    const { crop_name, region_name, market_name } = namesResult.rows[0];

    if (!crop_name || !region_name || !market_name) {
      res.status(404).json({
        success: false,
        message: 'One or more IDs (crop, region, market) are invalid.'
      });
      return;
    }

    const prediction = await generatePricePrediction(
      crop_name,
      market_name,
      region_name,
      crop_id as string,
      region_id as string,
      Number(prediction_days)
    );

    if (!prediction) {
      res.status(400).json({
        success: false,
        message: 'Insufficient data to generate prediction'
      });
      return;
    }

    const response: ApiResponse = {
      success: true,
      message: 'Price prediction generated successfully',
      data: prediction
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

router.post('/predictions/run-daily-job', authenticate, requireAdmin, async (req, res, next): Promise<void> => {
  try { 
    generateDailyPredictions();

    const response: ApiResponse = {
      success: true,
      message: 'Daily prediction job started in the background.'
    };
    res.status(202).json(response); 

  } catch (error) {
    next(error);
  }
});

export default router;