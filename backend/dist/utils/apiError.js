export class ApiError extends Error {
    statusCode;
    isOperational;
    constructor(message, statusCode = 500, isOperational = true) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        Error.captureStackTrace(this, this.constructor);
    }
}
export const createNotFoundError = (resource) => {
    return new ApiError(`${resource} not found`, 404);
};
export const createValidationError = (message) => {
    return new ApiError(`Validation error: ${message}`, 400);
};
export const createUnauthorizedError = (message = 'Unauthorized') => {
    return new ApiError(message, 401);
};
export const createForbiddenError = (message = 'Forbidden') => {
    return new ApiError(message, 403);
};
export const createConflictError = (message) => {
    return new ApiError(message, 409);
};
export const createInternalError = (message = 'Internal server error') => {
    return new ApiError(message, 500, false);
};
//# sourceMappingURL=apiError.js.map