import { Request, Response, NextFunction } from 'express';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { ApiError } from '../utils/apiError';
import { logger } from '../utils/logger';
 
const rateLimiters = { 
  general: new RateLimiterMemory({
    points: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
    duration: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000') / 1000, 
  }),

  
  auth: new RateLimiterMemory({
    points: 5, 
    duration: 900, 
    blockDuration: 900, 
  }),

   
  sms: new RateLimiterMemory({
    points: 10, 
    duration: 3600, 
  }),

  
  chat: new RateLimiterMemory({
    points: 30, 
    duration: 60, 
  }),

  
  priceSubmission: new RateLimiterMemory({
    points: 20, 
    duration: 3600, 
  }),
};
 
export const createRateLimiter = (limiterName: keyof typeof rateLimiters) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const limiter = rateLimiters[limiterName]; 
      const key = req.ip || 'unknown';
      await limiter.consume(key);
      next();
    } catch (rejRes: any) {
      const secs = Math.round(rejRes.msBeforeNext / 1000) || 1;
      const limiter = rateLimiters[limiterName];
      let key: string;
      if (limiterName === 'sms' || limiterName === 'chat' || limiterName === 'priceSubmission') {
        key = req.user?.id || req.ip || 'unknown';
      } else {
        key = req.ip || 'unknown';
      }
      logger.warn('Rate limit exceeded', {
        user: req.user?.id,
        path: req.path,
        resetTime: secs
      });

      res.set('Retry-After', String(secs));
      next(new ApiError('Too many requests, please try again later', 429));
    }
  };
};
 
export const rateLimiter = createRateLimiter('general');
export const authRateLimiter = createRateLimiter('auth');
export const smsRateLimiter = createRateLimiter('sms');
export const chatRateLimiter = createRateLimiter('chat');
export const priceSubmissionRateLimiter = createRateLimiter('priceSubmission');

 
export const ipWhitelist = (whitelist: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const clientIP = req.ip || 'unknown';

    if (whitelist.includes(clientIP)) {
      next();
      return;
    }
    
    next(new ApiError('Access denied from this IP address', 403));
  };
};