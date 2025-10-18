import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { ApiError } from '../utils/apiError.js';

// Generic validation middleware
export const validate = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error } = schema.validate(req.body, { abortEarly: false });
    
    if (error) {
      const errorMessage = error.details
        .map(detail => detail.message)
        .join(', ');
      
      next(new ApiError(`Validation error: ${errorMessage}`, 400));
      return;
    }
    
    next();
  };
};

// Validation schemas
export const schemas = {
  // User schemas
  register: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
    full_name: Joi.string().min(2).max(255).required(),
    phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).optional(),
    region: Joi.string().max(100).optional(),
    organization: Joi.string().max(255).optional()
  }),

  login: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
  }),

  updateProfile: Joi.object({
    full_name: Joi.string().min(2).max(255).optional(),
    phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).optional(),
    region: Joi.string().max(100).optional(),
    organization: Joi.string().max(255).optional()
  }),

  changePassword: Joi.object({
    current_password: Joi.string().required(),
    new_password: Joi.string().min(6).required()
  }),

  // Admin request schemas
  adminRequest: Joi.object({
    full_name: Joi.string().min(2).max(255).required(),
    email: Joi.string().email().required(),
    phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).required(),
    region: Joi.string().max(100).required(),
    organization: Joi.string().max(255).required(),
    reason: Joi.string().max(1000).optional()
  }),

  reviewAdminRequest: Joi.object({
    status: Joi.string().valid('approved', 'rejected').required(),
    reason: Joi.string().max(500).optional()
  }),

  // Crop schemas
  createCrop: Joi.object({
    name: Joi.string().min(2).max(100).required(),
    category: Joi.string().max(50).required(),
    description: Joi.string().max(500).optional(),
    unit: Joi.string().max(20).optional()
  }),

  updateCrop: Joi.object({
    name: Joi.string().min(2).max(100).optional(),
    category: Joi.string().max(50).optional(),
    description: Joi.string().max(500).optional(),
    unit: Joi.string().max(20).optional(),
    is_active: Joi.boolean().optional()
  }),

  // Price entry schemas
  createPriceEntry: Joi.object({
    crop_id: Joi.string().uuid().required(),
    region_id: Joi.string().uuid().required(),
    market_id: Joi.string().uuid().optional(),
    price: Joi.number().positive().required(),
    unit: Joi.string().max(20).optional(),
    source: Joi.string().valid('kamis', 'farmer', 'admin').optional(),
    notes: Joi.string().max(500).optional(),
    entry_date: Joi.date().optional()
  }),

  updatePriceEntry: Joi.object({
    price: Joi.number().positive().optional(),
    notes: Joi.string().max(500).optional(),
    is_verified: Joi.boolean().optional()
  }),

  // SMS schemas
  sendSms: Joi.object({
    recipients: Joi.array().items(Joi.string().pattern(/^\+?[1-9]\d{1,14}$/)).min(1).required(),
    message: Joi.string().min(1).max(160).required(),
    sms_type: Joi.string().valid('alert', 'update', 'prediction', 'weather', 'general').required(),
    template_id: Joi.string().uuid().optional(),
    template_variables: Joi.object().optional()
  }),

  createSmsTemplate: Joi.object({
    name: Joi.string().min(2).max(100).required(),
    template: Joi.string().min(1).max(160).required(),
    variables: Joi.array().items(Joi.string()).optional(),
    sms_type: Joi.string().valid('alert', 'update', 'prediction', 'weather', 'general').required()
  }),

  updateSmsTemplate: Joi.object({
    name: Joi.string().min(2).max(100).optional(),
    template: Joi.string().min(1).max(160).optional(),
    variables: Joi.array().items(Joi.string()).optional(),
    sms_type: Joi.string().valid('alert', 'update', 'prediction', 'weather', 'general').optional(),
    is_active: Joi.boolean().optional()
  }),

  smsSubscription: Joi.object({
    phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).required(),
    crops: Joi.array().items(Joi.string().uuid()).optional(),
    regions: Joi.array().items(Joi.string().uuid()).optional(),
    alert_types: Joi.array().items(Joi.string()).optional()
  }),

  // Chat schemas
  chatMessage: Joi.object({
    message: Joi.string().min(1).max(1000).required(),
    session_id: Joi.string().optional(),
    context: Joi.object().optional()
  }),

  // Market schemas
  createMarket: Joi.object({
    name: Joi.string().min(2).max(100).required(),
    region_id: Joi.string().uuid().required(),
    location: Joi.string().max(255).optional(),
    contact_info: Joi.object().optional()
  }),

  updateMarket: Joi.object({
    name: Joi.string().min(2).max(100).optional(),
    location: Joi.string().max(255).optional(),
    contact_info: Joi.object().optional(),
    is_active: Joi.boolean().optional()
  }),

  // Region schemas
  createRegion: Joi.object({
    name: Joi.string().min(2).max(100).required(),
    code: Joi.string().min(2).max(10).required(),
    description: Joi.string().max(500).optional()
  }),

  updateRegion: Joi.object({
    name: Joi.string().min(2).max(100).optional(),
    code: Joi.string().min(2).max(10).optional(),
    description: Joi.string().max(500).optional(),
    is_active: Joi.boolean().optional()
  })
};

// Query parameter validation
export const validateQuery = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error } = schema.validate(req.query, { abortEarly: false });
    
    if (error) {
      const errorMessage = error.details
        .map(detail => detail.message)
        .join(', ');
      
      next(new ApiError(`Query validation error: ${errorMessage}`, 400));
      return;
    }
    
    next();
  };
};

// Common query schemas
export const querySchemas = {
  pagination: Joi.object({
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    sort: Joi.string().optional(),
    order: Joi.string().valid('asc', 'desc').optional()
  }),

  priceQuery: Joi.object({
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    sort: Joi.string().optional(),
    order: Joi.string().valid('asc', 'desc').optional(),
    crop_id: Joi.string().uuid().optional(),
    region_id: Joi.string().uuid().optional(),
    market_id: Joi.string().uuid().optional(),
    source: Joi.string().valid('kamis', 'farmer', 'admin').optional(),
    verified: Joi.boolean().optional(),
    date_from: Joi.date().optional(),
    date_to: Joi.date().optional()
  }),

  dateRange: Joi.object({
    date_from: Joi.date().required(),
    date_to: Joi.date().required()
  })
};