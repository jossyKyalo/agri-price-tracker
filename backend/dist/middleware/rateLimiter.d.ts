import { Request, Response, NextFunction } from 'express';
import { RateLimiterMemory } from 'rate-limiter-flexible';
declare const rateLimiters: {
    general: RateLimiterMemory;
    auth: RateLimiterMemory;
    sms: RateLimiterMemory;
    chat: RateLimiterMemory;
    priceSubmission: RateLimiterMemory;
};
export declare const createRateLimiter: (limiterName: keyof typeof rateLimiters) => (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const rateLimiter: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const authRateLimiter: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const smsRateLimiter: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const chatRateLimiter: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const priceSubmissionRateLimiter: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const ipWhitelist: (whitelist: string[]) => (req: Request, res: Response, next: NextFunction) => void;
export {};
//# sourceMappingURL=rateLimiter.d.ts.map