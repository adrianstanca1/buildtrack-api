import { Response } from 'express';
export declare function successResponse<T>(res: Response, data: T, statusCode?: number): Response<any, Record<string, any>>;
export declare function errorResponse(res: Response, message: string, code?: string, statusCode?: number, details?: any): Response<any, Record<string, any>>;
export declare function paginatedResponse<T>(res: Response, data: T[], total: number, page: number, limit: number): Response<any, Record<string, any>>;
//# sourceMappingURL=response.d.ts.map