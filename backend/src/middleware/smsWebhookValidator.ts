// middleware/smsWebhookValidator.ts
import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { ApiError } from '../utils/apiError';
import { schemas } from './validation';

/**
 * Special validation for SMS webhooks that uses raw body
 * This bypasses normal validation to handle Textbelt signature verification
 */
export const validateSmsWebhook = (req: Request, res: Response, next: NextFunction): void => {
  try {
    // Validate required headers for paid tier
    const signature = req.headers['x-textbelt-signature'];
    const timestamp = req.headers['x-textbelt-timestamp'];
    
    // If using paid Textbelt tier, validate signature headers
    if (process.env.TEXTBELT_API_KEY && process.env.TEXTBELT_API_KEY !== 'textbelt') {
      if (!signature || !timestamp) {
        throw new ApiError('Missing Textbelt signature headers', 400);
      }
      
      // Validate timestamp format
      const timestampNum = parseInt(timestamp as string, 10);
      if (isNaN(timestampNum)) {
        throw new ApiError('Invalid timestamp format', 400);
      }
    }

    // Validate request body against schema
    const { error } = schemas.smsWebhook.validate(req.body, { abortEarly: false });

    if (error) {
      const errorMessage = error.details
        .map(detail => detail.message)
        .join(', ');

      throw new ApiError(`Webhook validation error: ${errorMessage}`, 400);
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Alternative: Skip validation entirely for webhooks (since Textbelt controls the payload)
 * This is useful if you want to accept webhooks even if validation fails
 */
export const acceptSmsWebhook = (req: Request, res: Response, next: NextFunction): void => {
  // Always accept webhook, validation happens in service layer
  next();
};