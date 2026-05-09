import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import { authenticateToken } from '../middleware/auth.js';
import { successResponse, errorResponse } from '../utils/response.js';

const router = Router();

const uploadDir = process.env.UPLOAD_DIR || './uploads';

// Ensure upload directory exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760', 10) },
  fileFilter: (_req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|pdf|doc|docx|xls|xlsx|csv/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext && mime) return cb(null, true);
    cb(new Error('Only images, PDFs, and Office documents are allowed'));
  },
});

// ─── Single File Upload ──────────────────────────────────────────────────
router.post('/', authenticateToken, upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return errorResponse(res, 'No file uploaded', 'VALIDATION_ERROR', 400);
    }
    const url = `${process.env.API_URL || ''}/uploads/${req.file.filename}`;
    successResponse(res, {
      originalName: req.file.originalname,
      filename: req.file.filename,
      url,
      size: req.file.size,
      mimetype: req.file.mimetype,
    }, 201);
  } catch (err) {
    errorResponse(res, 'Upload failed', 'INTERNAL_ERROR', 500);
  }
});

// ─── Multiple File Upload ────────────────────────────────────────────────
router.post('/multiple', authenticateToken, upload.array('files', 10), (req, res) => {
  try {
    if (!req.files || !Array.isArray(req.files)) {
      return errorResponse(res, 'No files uploaded', 'VALIDATION_ERROR', 400);
    }
    const files = (req.files as Express.Multer.File[]).map((f) => ({
      originalName: f.originalname,
      filename: f.filename,
      url: `${process.env.API_URL || ''}/uploads/${f.filename}`,
      size: f.size,
      mimetype: f.mimetype,
    }));
    successResponse(res, { files }, 201);
  } catch (err) {
    errorResponse(res, 'Upload failed', 'INTERNAL_ERROR', 500);
  }
});

export { router as uploadsRouter };
