export class ApiError extends Error {
  public statusCode: number;
  public isOperational: boolean;

  constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
    super(message);
    
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    
    
    Error.captureStackTrace(this, this.constructor);
  }
}


export const createNotFoundError = (resource: string): ApiError => {
  return new ApiError(`${resource} not found`, 404);
};

export const createValidationError = (message: string): ApiError => {
  return new ApiError(`Validation error: ${message}`, 400);
};

export const createUnauthorizedError = (message: string = 'Unauthorized'): ApiError => {
  return new ApiError(message, 401);
};

export const createForbiddenError = (message: string = 'Forbidden'): ApiError => {
  return new ApiError(message, 403);
};

export const createConflictError = (message: string): ApiError => {
  return new ApiError(message, 409);
};

export const createInternalError = (message: string = 'Internal server error'): ApiError => {
  return new ApiError(message, 500, false);
};