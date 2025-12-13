import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { ApiError } from '../utils/apiError';
import type { ApiResponse } from '../types/index';

export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  let statusCode = 500;
  let message = 'Internal server error';
  let isOperational = false;

  
  if (error instanceof ApiError) {
    statusCode = error.statusCode;
    message = error.message;
    isOperational = error.isOperational;
  } else if (error.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation error';
    isOperational = true;
  } else if (error.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid ID format';
    isOperational = true;
  } else if (error.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
    isOperational = true;
  } else if (error.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
    isOperational = true;
  } else if (error.message?.includes('duplicate key')) {
    statusCode = 409;
    message = 'Resource already exists';
    isOperational = true;
  } else if (error.message?.includes('foreign key')) {
    statusCode = 400;
    message = 'Invalid reference';
    isOperational = true;
  }

  
  if (!isOperational || statusCode >= 500) {
    logger.error(`${req.method} ${req.path} - ${statusCode} - ${message}`, {
      error: error.message,
      stack: error.stack,
      user: req.user?.id,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
  } else {
    logger.warn(`${req.method} ${req.path} - ${statusCode} - ${message}`, {
      user: req.user?.id,
      ip: req.ip
    });
  }

  
  const response: ApiResponse = {
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && {
      error: error.message,
      stack: error.stack
    })
  };

  res.status(statusCode).json(response);
};


process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});


process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});