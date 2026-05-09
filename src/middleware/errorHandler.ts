import { Request, Response, NextFunction } from 'express';

interface ApiError extends Error {
  statusCode?: number;
  code?: string;
}

export function errorHandler(
  err: ApiError,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  console.error('[Error]', err);

  // Default error
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal server error';
  const code = err.code || 'INTERNAL_ERROR';

  // Don't leak internal errors in production
  const isDev = process.env.NODE_ENV !== 'production';

  res.status(statusCode).json({
    success: false,
    error: {
      message: statusCode === 500 && !isDev ? 'Internal server error' : message,
      code,
      ...(isDev && { stack: err.stack }),
    },
  });
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({
    success: false,
    error: { message: 'Endpoint not found', code: 'NOT_FOUND' },
  });
}

export function createError(message: string, statusCode = 500, code = 'INTERNAL_ERROR'): ApiError {
  const error = new Error(message) as ApiError;
  error.statusCode = statusCode;
  error.code = code;
  return error;
}
