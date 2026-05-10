"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAccessToken = generateAccessToken;
exports.generateRefreshToken = generateRefreshToken;
exports.verifyAccessToken = verifyAccessToken;
exports.verifyRefreshToken = verifyRefreshToken;
exports.decodeToken = decodeToken;
exports.hashRefreshToken = hashRefreshToken;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = __importDefault(require("crypto"));
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const ACCESS_EXPIRY = process.env.JWT_ACCESS_EXPIRY || '15m';
const REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '7d';
if (!JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is required');
}
if (!JWT_REFRESH_SECRET) {
    throw new Error('JWT_REFRESH_SECRET environment variable is required');
}
function generateAccessToken(payload) {
    return jsonwebtoken_1.default.sign(payload, JWT_SECRET, { expiresIn: ACCESS_EXPIRY });
}
function generateRefreshToken(payload) {
    return jsonwebtoken_1.default.sign(payload, JWT_REFRESH_SECRET, { expiresIn: REFRESH_EXPIRY });
}
function verifyAccessToken(token) {
    return jsonwebtoken_1.default.verify(token, JWT_SECRET);
}
function verifyRefreshToken(token) {
    return jsonwebtoken_1.default.verify(token, JWT_REFRESH_SECRET);
}
function decodeToken(token) {
    try {
        return jsonwebtoken_1.default.decode(token);
    }
    catch {
        return null;
    }
}
/** Hash a refresh token for secure storage (SHA-256). */
function hashRefreshToken(token) {
    return crypto_1.default.createHash('sha256').update(token).digest('hex');
}
//# sourceMappingURL=jwt.js.map