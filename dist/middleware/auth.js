"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateToken = authenticateToken;
exports.requireRole = requireRole;
exports.optionalAuth = optionalAuth;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const database_js_1 = require("../config/database.js");
async function authenticateToken(req, res, next) {
    try {
        // Check Authorization header
        const authHeader = req.headers['authorization'];
        const token = authHeader?.split(' ')[1]; // Bearer TOKEN
        if (!token) {
            // Also check cookie
            const cookieToken = req.cookies?.accessToken;
            if (!cookieToken) {
                res.status(401).json({
                    success: false,
                    error: { message: 'Access token required', code: 'UNAUTHORIZED' },
                });
                return;
            }
        }
        const secret = process.env.JWT_SECRET;
        if (!secret) {
            res.status(500).json({
                success: false,
                error: { message: 'Server configuration error', code: 'INTERNAL_ERROR' },
            });
            return;
        }
        const decoded = jsonwebtoken_1.default.verify(token || req.cookies?.accessToken, secret);
        // Verify user still exists in database
        const result = await database_js_1.pool.query('SELECT id, email, role, first_name, last_name FROM users WHERE id = $1', [decoded.userId]);
        if (result.rows.length === 0) {
            res.status(401).json({
                success: false,
                error: { message: 'User not found', code: 'UNAUTHORIZED' },
            });
            return;
        }
        req.user = {
            id: result.rows[0].id,
            email: result.rows[0].email,
            role: result.rows[0].role,
            firstName: result.rows[0].first_name,
            lastName: result.rows[0].last_name,
        };
        next();
    }
    catch (err) {
        if (err instanceof jsonwebtoken_1.default.TokenExpiredError) {
            res.status(401).json({
                success: false,
                error: { message: 'Token expired', code: 'TOKEN_EXPIRED' },
            });
            return;
        }
        res.status(401).json({
            success: false,
            error: { message: 'Invalid token', code: 'UNAUTHORIZED' },
        });
    }
}
function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            res.status(401).json({
                success: false,
                error: { message: 'Authentication required', code: 'UNAUTHORIZED' },
            });
            return;
        }
        if (!roles.includes(req.user.role)) {
            res.status(403).json({
                success: false,
                error: { message: 'Insufficient permissions', code: 'FORBIDDEN' },
            });
            return;
        }
        next();
    };
}
function optionalAuth(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader?.split(' ')[1];
    const cookieToken = req.cookies?.accessToken;
    if (!token && !cookieToken) {
        next();
        return;
    }
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        next();
        return;
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(token || cookieToken, secret);
        req.user = {
            id: decoded.userId,
            email: decoded.email,
            role: decoded.role,
        };
    }
    catch {
        // Invalid token, proceed without user
    }
    next();
}
//# sourceMappingURL=auth.js.map