import axios from 'axios';
import { query } from '../database/connection';
import { logger } from '../utils/logger';
import { exec } from 'child_process';
import path from 'path';
import util from 'util';
import type { PredictionResponse } from '../types/index';

 
const execPromise = util.promisify(exec);

export interface MLPredictionRequest {
  commodity: string;
  market: string;
  county: string;
  prediction_days: number;
  current_price: number;
}


const  ML_MODEL_URL= process.env.ML_MODEL_URL;

const storePrediction = async (prediction: PredictionResponse): Promise<void> => {
  try { 
    const mainPrediction = prediction.predicted_prices[0];
    if (!mainPrediction) {
      throw new Error('Prediction data is missing predicted_prices');
    }

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

  } catch (error: any) {
    logger.error('Failed to store prediction:', error); 
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

    const prices = result.rows
      .map(row => parseFloat(row.price))
      .filter(price => !isNaN(price) && price > 0);
    
    if (prices.length === 0) {
      logger.warn(`No valid prices found for ${cropId} in ${regionId} for fallback`);
      return null;
    }
    
    const currentPrice = prices[0]!;
     
    const recentPrices = prices.slice(0, Math.min(7, prices.length));
    const average = recentPrices.reduce((sum, price) => sum + price, 0) / recentPrices.length;
     
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

  } catch (error: any) {
    logger.error('Simple prediction failed:', error);
    return null;
  }
};

export const runModelTraining = async (): Promise<boolean> => {
    try {
        const mlUrl = process.env.ML_MODEL_URL || 'http://0.0.0.0:8000';
        logger.info(`Requesting Model Retraining at ${mlUrl}/train...`);
        const response = await axios.post(`${mlUrl}/train`, {}, { timeout: 5000 });
        if (response.status === 200 || response.status === 202) {
            logger.info('Training started successfully.');
            return true;
        }
        return false;
    } catch (error: any) {
        logger.error('Failed to trigger model training:', error.message);
        return false;
    }
};


export const reloadPredictionApi = async (): Promise<void> => {
    try {
        logger.info('Sending reload signal to Python API...');
        await axios.post(`${ML_MODEL_URL}/reload`);
        logger.info('Python API reloaded successfully.');
    } catch (error) {
        logger.error('Failed to reload Python API (Is it running?):', error);
    }
};

 
export const generatePricePrediction = async (
  commodityName: string,
  marketName: string,
  countyName: string,  
  cropId: string, 
  regionId: string,
  currentPrice: number,  
  predictionDays: number = 7
): Promise<PredictionResponse | null> => {
  try {
    const requestData: MLPredictionRequest = {
      commodity: commodityName,
      market: marketName,
      county: countyName,
      prediction_days: predictionDays,
      current_price: currentPrice  
    };

    const mlUrl = process.env.ML_MODEL_URL || 'http://localhost:8001';

    const response = await axios.post(
      `${mlUrl}/predict`,
      requestData,
      { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }
    ); 
    
    const predictionResult = response.data;
    const mainPrediction = predictionResult.predictions[0];

    const dbPrediction: PredictionResponse = {
      crop_id: cropId,
      region_id: regionId,
      current_price: predictionResult.current_price, // Use returned price (should match sent)
      predicted_prices: [{
        date: new Date(mainPrediction.date),
        price: mainPrediction.predicted_price,
        confidence: predictionResult.confidence  
      }],
      factors: {
        method: 'ml-gradient-boost',
        trend: predictionResult.trend,
        recommendation: predictionResult.recommendation
      },
      model_version: 'v2-boosted-clamped'  
    };
      
    await storePrediction(dbPrediction);
    return dbPrediction;

  } catch (error: any) {
    logger.warn(`ML service failed for ${commodityName}. Falling back.`);
    return null; 
  }
};

 
export const generateDailyPredictions = async (): Promise<void> => {
  try {
    logger.info('Starting batch prediction generation...');

    // UPDATED QUERY: Get the LATEST price for each combo
    const combinations = await query(`
      SELECT DISTINCT ON (pe.crop_id, pe.region_id, pe.market_id)
        pe.crop_id, 
        pe.region_id, 
        pe.market_id,
        pe.price as latest_price, -- ✅ FETCH PRICE
        c.name as crop_name, 
        r.name as region_name,
        m.name as market_name,
        r.name as county_name
      FROM price_entries pe
      JOIN crops c ON pe.crop_id = c.id
      JOIN regions r ON pe.region_id = r.id
      JOIN markets m ON pe.market_id = m.id
      WHERE pe.entry_date >= CURRENT_DATE - INTERVAL '30 days'
        AND pe.is_verified = true
      ORDER BY pe.crop_id, pe.region_id, pe.market_id, pe.entry_date DESC
    `);

    let generated = 0;
    let failed = 0;

    for (const combo of combinations.rows) {
      await new Promise(r => setTimeout(r, 50));  

      const result = await generatePricePrediction(
          combo.crop_name,
          combo.market_name,
          combo.county_name || combo.region_name,
          combo.crop_id,
          combo.region_id,
          parseFloat(combo.latest_price)  
      );

      if (result) generated++;
      else failed++;
    }

    logger.info(`Daily predictions completed: ${generated} generated, ${failed} failed`);

  } catch (error: any) {
    logger.error('Daily predictions generation failed:', error);
    throw error;
  }
};

 
export const getPredictions = async (cropId?: string, regionId?: string, limit: number = 20) => {
    try {
        const conditions: string[] = ['pp.prediction_date >= CURRENT_DATE'];
        const params: any[] = [];
        let paramIndex = 1;
        if (cropId) { conditions.push(`pp.crop_id = $${paramIndex++}`); params.push(cropId); }
        if (regionId) { conditions.push(`pp.region_id = $${paramIndex++}`); params.push(regionId); }
        params.push(limit);
        const result = await query(
          `SELECT pp.*, c.name as crop_name, r.name as region_name
           FROM price_predictions pp
           JOIN crops c ON pp.crop_id = c.id
           JOIN regions r ON pp.region_id = r.id
           WHERE ${conditions.join(' AND ')}
           ORDER BY pp.created_at DESC LIMIT $${paramIndex}`, params
        );
        return result.rows;
    } catch (error: any) {
        logger.error('Failed to get predictions:', error); return [];
    }
}

// function execPromise(arg0: string): { stdout: any; stderr: any; } | PromiseLike<{ stdout: any; stderr: any; }> {
//   throw new Error('Function not implemented.');
// }
