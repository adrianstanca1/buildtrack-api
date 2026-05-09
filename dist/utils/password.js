"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashPassword = hashPassword;
exports.comparePassword = comparePassword;
exports.validatePassword = validatePassword;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const SALT_ROUNDS = 12;
async function hashPassword(password) {
    return bcryptjs_1.default.hash(password, SALT_ROUNDS);
}
async function comparePassword(password, hash) {
    return bcryptjs_1.default.compare(password, hash);
}
function validatePassword(password) {
    const errors = [];
    if (password.length < 8) {
        errors.push('Password must be at least 8 characters');
    }
    if (password.length > 72) {
        errors.push('Password must be less than 72 characters');
    }
    if (!/[a-z]/.test(password)) {
        errors.push('Password must contain a lowercase letter');
    }
    if (!/[A-Z]/.test(password)) {
        errors.push('Password must contain an uppercase letter');
    }
    if (!/\d/.test(password)) {
        errors.push('Password must contain a number');
    }
    if (!/[^a-zA-Z0-9]/.test(password)) {
        errors.push('Password must contain a special character');
    }
    return { valid: errors.length === 0, errors };
}
//# sourceMappingURL=password.js.map