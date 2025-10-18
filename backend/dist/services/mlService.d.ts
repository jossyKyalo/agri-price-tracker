import type { PredictionResponse } from '../types/index.js';
export declare const generatePricePrediction: (cropId: string, regionId: string, predictionDays?: number) => Promise<PredictionResponse | null>;
export declare const generateDailyPredictions: () => Promise<void>;
export declare const getPredictions: (cropId?: string, regionId?: string, limit?: number) => Promise<any[]>;
//# sourceMappingURL=mlService.d.ts.map