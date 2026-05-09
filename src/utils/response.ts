import { Response } from 'express';

export function successResponse<T>(res: Response, data: T, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    data,
  });
}

export function errorResponse(
  res: Response,
  message: string,
  code = 'INTERNAL_ERROR',
  statusCode = 500,
  details?: any
) {
  return res.status(statusCode).json({
    success: false,
    error: {
      message,
      code,
      ...(details && { details }),
    },
  });
}

export function paginatedResponse<T>(
  res: Response,
  data: T[],
  total: number,
  page: number,
  limit: number
) {
  return res.status(200).json({
    success: true,
    data,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1,
    },
  });
}
