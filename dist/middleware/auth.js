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
const redis_js_1 = require("../config/redis.js");
async function authenticateToken(req, res, next) {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader?.split(' ')[1] || req.cookies?.accessToken;
        if (!token) {
            res.status(401).json({
                success: false,
                error: { message: 'Access token required', code: 'UNAUTHORIZED' },
            });
            return;
        }
        const secret = process.env.JWT_SECRET;
        if (!secret) {
            res.status(500).json({
                success: false,
                error: { message: 'Server configuration error', code: 'INTERNAL_ERROR' },
            });
            return;
        }
        const decoded = jsonwebtoken_1.default.verify(token, secret);
        const userId = decoded.userId;
        // Try Redis cache first (5-minute TTL)
        let user = await (0, redis_js_1.getCachedUser)(userId);
        if (!user) {
            // Cache miss — query database
            const result = await database_js_1.pool.query('SELECT id, email, role, first_name, last_name FROM users WHERE id = $1', [userId]);
            if (result.rows.length === 0) {
                res.status(401).json({
                    success: false,
                    error: { message: 'User not found', code: 'UNAUTHORIZED' },
                });
                return;
            }
            user = {
                id: result.rows[0].id,
                email: result.rows[0].email,
                role: result.rows[0].role,
                firstName: result.rows[0].first_name,
                lastName: result.rows[0].last_name,
            };
            // Cache for 5 minutes
            await (0, redis_js_1.setCachedUser)(userId, user, 300);
        }
        req.user = user;
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
        if (!req.user || !roles.includes(req.user.role)) {
            res.status(403).json({
                success: false,
                error: { message: 'Forbidden: insufficient permissions', code: 'FORBIDDEN' },
            });
            return;
        }
        next();
    };
}
function optionalAuth(req, res, next) {
    // Try to authenticate but don't fail if no token
    authenticateToken(req, res, () => {
        // Reset user if auth failed (so req.user stays undefined)
        next();
    }).catch(() => next());
}
//# sourceMappingURL=auth.js.map