export declare class ApiError extends Error {
    statusCode: number;
    isOperational: boolean;
    constructor(message: string, statusCode?: number, isOperational?: boolean);
}
export declare const createNotFoundError: (resource: string) => ApiError;
export declare const createValidationError: (message: string) => ApiError;
export declare const createUnauthorizedError: (message?: string) => ApiError;
export declare const createForbiddenError: (message?: string) => ApiError;
export declare const createConflictError: (message: string) => ApiError;
export declare const createInternalError: (message?: string) => ApiError;
//# sourceMappingURL=apiError.d.ts.map