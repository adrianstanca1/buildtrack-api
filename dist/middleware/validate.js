"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validate = validate;
exports.validateParams = validateParams;
exports.validateQuery = validateQuery;
const zod_1 = require("zod");
function validate(schema) {
    return (req, res, next) => {
        try {
            const result = schema.parse(req.body);
            req.body = result;
            next();
        }
        catch (error) {
            if (error instanceof zod_1.ZodError) {
                const issues = error.issues.map((issue) => ({
                    field: issue.path.join('.'),
                    message: issue.message,
                }));
                res.status(400).json({
                    success: false,
                    error: {
                        message: 'Validation failed',
                        code: 'VALIDATION_ERROR',
                        details: issues,
                    },
                });
                return;
            }
            next(error);
        }
    };
}
function validateParams(schema) {
    return (req, res, next) => {
        try {
            const result = schema.parse(req.params);
            req.params = result;
            next();
        }
        catch (error) {
            if (error instanceof zod_1.ZodError) {
                res.status(400).json({
                    success: false,
                    error: {
                        message: 'Invalid URL parameters',
                        code: 'VALIDATION_ERROR',
                        details: error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
                    },
                });
                return;
            }
            next(error);
        }
    };
}
function validateQuery(schema) {
    return (req, res, next) => {
        try {
            const result = schema.parse(req.query);
            req.query = result;
            next();
        }
        catch (error) {
            if (error instanceof zod_1.ZodError) {
                res.status(400).json({
                    success: false,
                    error: {
                        message: 'Invalid query parameters',
                        code: 'VALIDATION_ERROR',
                        details: error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
                    },
                });
                return;
            }
            next(error);
        }
    };
}
//# sourceMappingURL=validate.js.map