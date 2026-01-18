
import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { ApiError } from '../utils/apiError';

const smsLeopardWebhookSchema = Joi.object({
    message_id: Joi.string().optional(),
    to: Joi.string().required(),
    status: Joi.string()
        .valid('DELIVERED', 'FAILED', 'PENDING', 'SENT')
        .required(),
    error: Joi.string().optional(),
    cost: Joi.number().optional(),
    timestamp: Joi.string().optional(),
}).unknown(true);

export const validateSmsWebhook = (
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    try {
        // Ensure JSON body exists
        if (!req.body || Object.keys(req.body).length === 0) {
            throw new ApiError('Empty webhook payload', 400);
        }

        const { error } = smsLeopardWebhookSchema.validate(req.body, {
            abortEarly: false,
        });

        if (error) {
            const message = error.details.map(d => d.message).join(', ');
            throw new ApiError(`SMSLeopard webhook validation error: ${message}`, 400);
        }

        next();
    } catch (err) {
        next(err);
    }
};


export const acceptSmsWebhook = (
    _req: Request,
    _res: Response,
    next: NextFunction
): void => {
    next();
};
