import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';
import { ApiError } from '../utils/apiError.js';
import type { ApiResponse } from '../types/index.js';

export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  let statusCode = 500;
  let message = 'Internal server error';
  let isOperational = false;

  // Handle different types of errors
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

  // Log error
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

  // Send error response
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

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Close server & exit process
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception:', error);
  // Close server & exit process
  process.exit(1);
});