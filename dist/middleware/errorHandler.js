"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
exports.notFoundHandler = notFoundHandler;
exports.createError = createError;
function errorHandler(err, _req, res, _next) {
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
function notFoundHandler(_req, res) {
    res.status(404).json({
        success: false,
        error: { message: 'Endpoint not found', code: 'NOT_FOUND' },
    });
}
function createError(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.code = code;
    return error;
}
//# sourceMappingURL=errorHandler.js.map