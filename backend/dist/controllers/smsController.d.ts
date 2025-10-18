import { Request, Response, NextFunction } from 'express';
export declare const sendSms: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const getSmsLogs: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const createSmsTemplate: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const getSmsTemplates: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const updateSmsTemplate: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const deleteSmsTemplate: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const subscribeSms: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const getSmsSubscriptions: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const unsubscribeSms: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const getSmsStats: (req: Request, res: Response, next: NextFunction) => Promise<void>;
//# sourceMappingURL=smsController.d.ts.map