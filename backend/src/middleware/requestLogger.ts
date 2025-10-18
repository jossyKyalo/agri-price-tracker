import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const start = Date.now();
  
  // Log request
  logger.http(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    user: req.user?.id,
    query: req.query,
    body: req.method === 'POST' || req.method === 'PUT' ? 
      sanitizeBody(req.body) : undefined
  });

  
  const originalEnd = res.end;
  res.end = function(chunk?: any, encoding?: any, cb?: (() => void) | undefined): Response<any, Record<string, any>> {
    const duration = Date.now() - start;
    
    logger.http(`${req.method} ${req.path} - ${res.statusCode}`, {
      duration: `${duration}ms`,
      ip: req.ip,
      user: req.user?.id,
      statusCode: res.statusCode
    });

     
    // @ts-ignore
    return originalEnd.call(this, chunk, encoding, cb);
  } as typeof res.end;

  next();
};

// Sanitize request body to remove sensitive information
const sanitizeBody = (body: any): any => {
  if (!body || typeof body !== 'object') {
    return body;
  }

  const sanitized = { ...body };
  const sensitiveFields = ['password', 'token', 'secret', 'key', 'auth'];
  
  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  }

  return sanitized;
};