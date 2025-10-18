import axios from 'axios';
import { query } from '../database/connection';
import { logger } from '../utils/logger';
import type { PredictionRequest, PredictionResponse } from '../types/index';

export const generatePricePrediction = async (
  cropId: string,
  regionId: string,
  predictionDays: number = 7
): Promise<PredictionResponse | null> => {
  try {
    // Get historical price data
    const historicalData = await query(
      `SELECT price, entry_date
       FROM price_entries
       WHERE crop_id = $1 AND region_id = $2 AND is_verified = true
       ORDER BY entry_date DESC
       LIMIT 90`,
      [cropId, regionId]
    );

    if (historicalData.rows.length < 10) {
      logger.warn(`Insufficient data for prediction: ${cropId} in ${regionId}`);
      return null;
    }

    // Prepare data for ML model
    const requestData: PredictionRequest = {
      crop_id: cropId,
      region_id: regionId,
      historical_data: historicalData.rows,
      prediction_days: predictionDays
    };

    // Call ML model API
    const response = await axios.post(
      `${process.env.ML_MODEL_URL}/predict`,
      requestData,
      {
        headers: {
          'Authorization': `Bearer ${process.env.ML_MODEL_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    const prediction: PredictionResponse = response.data;

    // Store prediction in database
    await storePrediction(prediction);

    logger.info(`Prediction generated for crop ${cropId} in region ${regionId}`);
    return prediction;

  } catch (error: any) {
    logger.error('ML prediction failed:', error);
    
    // Fallback to simple trend analysis
    return generateSimplePrediction(cropId, regionId, predictionDays);
  }
};

const generateSimplePrediction = async (
  cropId: string,
  regionId: string,
  predictionDays: number
): Promise<PredictionResponse | null> => {
  try {
    const result = await query(
      `SELECT price, entry_date
       FROM price_entries
       WHERE crop_id = $1 AND region_id = $2 AND is_verified = true
       ORDER BY entry_date DESC
       LIMIT 30`,
      [cropId, regionId]
    );

    if (result.rows.length < 5) {
      return null;
    }

    // Parse and validate prices
    const prices = result.rows
      .map(row => parseFloat(row.price))
      .filter(price => !isNaN(price) && price > 0);
    
    if (prices.length === 0) {
      logger.warn(`No valid prices found for ${cropId} in ${regionId}`);
      return null;
    }
    
    const currentPrice = prices[0]!; // guaranteed after check
    
    // Simple moving average
    const recentPrices = prices.slice(0, Math.min(7, prices.length));
    const average = recentPrices.reduce((sum, price) => sum + price, 0) / recentPrices.length;
    
    // Trend factor
    const trendFactor = prices.length >= 14 ? (() => {
      const oldPrices = prices.slice(7, 14);
      const oldAverage = oldPrices.reduce((sum, price) => sum + price, 0) / oldPrices.length;
      return average / oldAverage;
    })() : 1.0;
    
    const predictedPrice = currentPrice * trendFactor;

    const prediction: PredictionResponse = {
      crop_id: cropId,
      region_id: regionId,
      current_price: currentPrice,
      predicted_prices: [{
        date: new Date(Date.now() + predictionDays * 24 * 60 * 60 * 1000),
        price: Math.max(predictedPrice, currentPrice * 0.8),
        confidence: prices.length >= 14 ? 0.7 : 0.5
      }],
      factors: {
        method: 'simple_trend',
        trend_factor: trendFactor,
        data_points: prices.length
      },
      model_version: 'fallback-v1.0'
    };

    await storePrediction(prediction);
    return prediction;

  } catch (error) {
    logger.error('Simple prediction failed:', error);
    return null;
  }
};

const storePrediction = async (prediction: PredictionResponse): Promise<void> => {
  try {
    const mainPrediction = prediction.predicted_prices[0]!; // guaranteed

    await query(
      `INSERT INTO price_predictions (
        crop_id, region_id, current_price, predicted_price, prediction_date,
        confidence_score, model_version, factors
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (crop_id, region_id, prediction_date) 
      DO UPDATE SET 
        predicted_price = EXCLUDED.predicted_price,
        confidence_score = EXCLUDED.confidence_score,
        factors = EXCLUDED.factors`,
      [
        prediction.crop_id,
        prediction.region_id,
        prediction.current_price,
        mainPrediction.price,
        mainPrediction.date,
        mainPrediction.confidence,
        prediction.model_version,
        JSON.stringify(prediction.factors)
      ]
    );

  } catch (error) {
    logger.error('Failed to store prediction:', error);
    throw error;
  }
};

export const generateDailyPredictions = async (): Promise<void> => {
  try {
    logger.info('Starting daily predictions generation');

    const combinations = await query(`
      SELECT DISTINCT pe.crop_id, pe.region_id, c.name as crop_name, r.name as region_name
      FROM price_entries pe
      JOIN crops c ON pe.crop_id = c.id
      JOIN regions r ON pe.region_id = r.id
      WHERE pe.entry_date >= CURRENT_DATE - INTERVAL '30 days'
        AND pe.is_verified = true
      GROUP BY pe.crop_id, pe.region_id, c.name, r.name
      HAVING COUNT(*) >= 5
    `);

    let generated = 0;
    let failed = 0;

    for (const combo of combinations.rows) {
      try {
        const prediction = await generatePricePrediction(combo.crop_id, combo.region_id);
        if (prediction) {
          generated++;
        } else {
          failed++;
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        logger.error(`Failed to generate prediction for ${combo.crop_name} in ${combo.region_name}:`, error);
        failed++;
      }
    }

    logger.info(`Daily predictions completed: ${generated} generated, ${failed} failed`);

  } catch (error) {
    logger.error('Daily predictions generation failed:', error);
    throw error;
  }
};

export const getPredictions = async (
  cropId?: string,
  regionId?: string,
  limit: number = 20
): Promise<any[]> => {
  try {
    const conditions: string[] = ['pp.prediction_date >= CURRENT_DATE'];
    const params: any[] = [];
    let paramIndex = 1;

    if (cropId) {
      conditions.push(`pp.crop_id = $${paramIndex++}`);
      params.push(cropId);
    }

    if (regionId) {
      conditions.push(`pp.region_id = $${paramIndex++}`);
      params.push(regionId);
    }

    params.push(limit);

    const result = await query(
      `SELECT pp.*, c.name as crop_name, r.name as region_name
       FROM price_predictions pp
       JOIN crops c ON pp.crop_id = c.id
       JOIN regions r ON pp.region_id = r.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY pp.created_at DESC
       LIMIT $${paramIndex}`,
      params
    );

    return result.rows;

  } catch (error) {
    logger.error('Failed to get predictions:', error);
    return [];
  }
};
