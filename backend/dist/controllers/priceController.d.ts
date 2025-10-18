import { Request, Response, NextFunction } from 'express';
export declare const getPrices: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const createPriceEntry: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const updatePriceEntry: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const deletePriceEntry: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const getPendingVerifications: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const verifyPriceEntry: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const rejectPriceEntry: (req: Request, res: Response, next: NextFunction) => Promise<void>;
//# sourceMappingURL=priceController.d.ts.map