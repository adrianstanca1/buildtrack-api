import { Request, Response, NextFunction } from 'express';
interface ApiError extends Error {
    statusCode?: number;
    code?: string;
}
export declare function errorHandler(err: ApiError, _req: Request, res: Response, _next: NextFunction): void;
export declare function notFoundHandler(_req: Request, res: Response): void;
export declare function createError(message: string, statusCode?: number, code?: string): ApiError;
export {};
//# sourceMappingURL=errorHandler.d.ts.map