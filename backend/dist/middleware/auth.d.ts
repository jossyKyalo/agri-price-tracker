import { Request, Response, NextFunction } from 'express';
import type { User } from '../types/index.js';
declare global {
    namespace Express {
        interface Request {
            user?: User;
        }
    }
}
export interface JwtPayload {
    userId: string;
    email: string;
    role: string;
    iat: number;
    exp: number;
}
export declare const authenticate: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const authorize: (...roles: string[]) => (req: Request, res: Response, next: NextFunction) => void;
export declare const requireAdmin: (req: Request, res: Response, next: NextFunction) => void;
export declare const requireSuperAdmin: (req: Request, res: Response, next: NextFunction) => void;
export declare const optionalAuth: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const generateToken: (user: User) => string;
export declare const generateRefreshToken: (user: User) => string;
export declare const verifyRefreshToken: (token: string) => JwtPayload;
//# sourceMappingURL=auth.d.ts.map