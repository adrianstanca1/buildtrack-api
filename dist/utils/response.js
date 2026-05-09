"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.successResponse = successResponse;
exports.errorResponse = errorResponse;
exports.paginatedResponse = paginatedResponse;
function successResponse(res, data, statusCode = 200) {
    return res.status(statusCode).json({
        success: true,
        data,
    });
}
function errorResponse(res, message, code = 'INTERNAL_ERROR', statusCode = 500, details) {
    return res.status(statusCode).json({
        success: false,
        error: {
            message,
            code,
            ...(details && { details }),
        },
    });
}
function paginatedResponse(res, data, total, page, limit) {
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
//# sourceMappingURL=response.js.map