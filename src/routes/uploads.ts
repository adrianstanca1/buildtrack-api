import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { authenticateToken } from '../middleware/auth.js';
import { successResponse, errorResponse } from '../utils/response.js';
import { uploadFile } from '../config/minio.js';

const router = Router();

const storage = multer.memoryStorage();

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
router.post('/', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return errorResponse(res, 'No file uploaded', 'VALIDATION_ERROR', 400);
    }
    const ext = path.extname(req.file.originalname);
    const key = `uploads/${uuidv4()}${ext}`;
    const url = await uploadFile(key, req.file.buffer, req.file.mimetype);
    successResponse(res, {
      originalName: req.file.originalname,
      filename: key,
      url,
      size: req.file.size,
      mimetype: req.file.mimetype,
    }, 201);
  } catch (err: any) {
    errorResponse(res, err.message || 'Upload failed', 'INTERNAL_ERROR', 500);
  }
});

// ─── Multiple File Upload ────────────────────────────────────────────────
router.post('/multiple', authenticateToken, upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || !Array.isArray(req.files)) {
      return errorResponse(res, 'No files uploaded', 'VALIDATION_ERROR', 400);
    }
    const files = await Promise.all(
      (req.files as Express.Multer.File[]).map(async (f) => {
        const ext = path.extname(f.originalname);
        const key = `uploads/${uuidv4()}${ext}`;
        const url = await uploadFile(key, f.buffer, f.mimetype);
        return {
          originalName: f.originalname,
          filename: key,
          url,
          size: f.size,
          mimetype: f.mimetype,
        };
      })
    );
    successResponse(res, { files }, 201);
  } catch (err: any) {
    errorResponse(res, err.message || 'Upload failed', 'INTERNAL_ERROR', 500);
  }
});

export { router as uploadsRouter };
