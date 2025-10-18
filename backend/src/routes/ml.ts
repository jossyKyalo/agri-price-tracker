import { Router } from 'express';
import { authenticate, requireAdmin, optionalAuth } from '../middleware/auth';
import { generatePricePrediction, getPredictions } from '../services/mlService';
import type { ApiResponse } from '../types/index';

const router = Router();

// Get price predictions (public with optional auth)
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

// Generate prediction for specific crop/region (admin only)
router.post('/predictions/generate', authenticate, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const { crop_id, region_id, prediction_days = 7 } = req.body;

    if (!crop_id || !region_id) {
      res.status(400).json({
        success: false,
        message: 'crop_id and region_id are required'
      });
      return;
    }

    const prediction = await generatePricePrediction(crop_id, region_id, prediction_days);

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

export default router;