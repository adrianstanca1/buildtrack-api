"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadsRouter = void 0;
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const uuid_1 = require("uuid");
const auth_js_1 = require("../middleware/auth.js");
const response_js_1 = require("../utils/response.js");
const minio_js_1 = require("../config/minio.js");
const router = (0, express_1.Router)();
exports.uploadsRouter = router;
const storage = multer_1.default.memoryStorage();
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760', 10) },
    fileFilter: (_req, file, cb) => {
        const allowed = /jpeg|jpg|png|gif|pdf|doc|docx|xls|xlsx|csv/;
        const ext = allowed.test(path_1.default.extname(file.originalname).toLowerCase());
        const mime = allowed.test(file.mimetype);
        if (ext && mime)
            return cb(null, true);
        cb(new Error('Only images, PDFs, and Office documents are allowed'));
    },
});
// ─── Single File Upload ──────────────────────────────────────────────────
router.post('/', auth_js_1.authenticateToken, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return (0, response_js_1.errorResponse)(res, 'No file uploaded', 'VALIDATION_ERROR', 400);
        }
        const ext = path_1.default.extname(req.file.originalname);
        const key = `uploads/${(0, uuid_1.v4)()}${ext}`;
        const url = await (0, minio_js_1.uploadFile)(key, req.file.buffer, req.file.mimetype);
        (0, response_js_1.successResponse)(res, {
            originalName: req.file.originalname,
            filename: key,
            url,
            size: req.file.size,
            mimetype: req.file.mimetype,
        }, 201);
    }
    catch (err) {
        (0, response_js_1.errorResponse)(res, err.message || 'Upload failed', 'INTERNAL_ERROR', 500);
    }
});
// ─── Multiple File Upload ────────────────────────────────────────────────
router.post('/multiple', auth_js_1.authenticateToken, upload.array('files', 10), async (req, res) => {
    try {
        if (!req.files || !Array.isArray(req.files)) {
            return (0, response_js_1.errorResponse)(res, 'No files uploaded', 'VALIDATION_ERROR', 400);
        }
        const files = await Promise.all(req.files.map(async (f) => {
            const ext = path_1.default.extname(f.originalname);
            const key = `uploads/${(0, uuid_1.v4)()}${ext}`;
            const url = await (0, minio_js_1.uploadFile)(key, f.buffer, f.mimetype);
            return {
                originalName: f.originalname,
                filename: key,
                url,
                size: f.size,
                mimetype: f.mimetype,
            };
        }));
        (0, response_js_1.successResponse)(res, { files }, 201);
    }
    catch (err) {
        (0, response_js_1.errorResponse)(res, err.message || 'Upload failed', 'INTERNAL_ERROR', 500);
    }
});
//# sourceMappingURL=uploads.js.map