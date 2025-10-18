import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
export declare const validate: (schema: Joi.ObjectSchema) => (req: Request, res: Response, next: NextFunction) => void;
export declare const schemas: {
    register: Joi.ObjectSchema<any>;
    login: Joi.ObjectSchema<any>;
    updateProfile: Joi.ObjectSchema<any>;
    changePassword: Joi.ObjectSchema<any>;
    adminRequest: Joi.ObjectSchema<any>;
    reviewAdminRequest: Joi.ObjectSchema<any>;
    createCrop: Joi.ObjectSchema<any>;
    updateCrop: Joi.ObjectSchema<any>;
    createPriceEntry: Joi.ObjectSchema<any>;
    updatePriceEntry: Joi.ObjectSchema<any>;
    sendSms: Joi.ObjectSchema<any>;
    createSmsTemplate: Joi.ObjectSchema<any>;
    updateSmsTemplate: Joi.ObjectSchema<any>;
    smsSubscription: Joi.ObjectSchema<any>;
    chatMessage: Joi.ObjectSchema<any>;
    createMarket: Joi.ObjectSchema<any>;
    updateMarket: Joi.ObjectSchema<any>;
    createRegion: Joi.ObjectSchema<any>;
    updateRegion: Joi.ObjectSchema<any>;
};
export declare const validateQuery: (schema: Joi.ObjectSchema) => (req: Request, res: Response, next: NextFunction) => void;
export declare const querySchemas: {
    pagination: Joi.ObjectSchema<any>;
    priceQuery: Joi.ObjectSchema<any>;
    dateRange: Joi.ObjectSchema<any>;
};
//# sourceMappingURL=validation.d.ts.map