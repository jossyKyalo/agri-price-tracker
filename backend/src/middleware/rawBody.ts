
import { Request, Response, NextFunction } from 'express';

 
export const rawBodyMiddleware = (
  _req: Request,
  _res: Response,
  next: NextFunction
) => {
  next();
};

export const rawBodySimpleMiddleware = rawBodyMiddleware;
