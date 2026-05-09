import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../config/database.js';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    firstName?: string;
    lastName?: string;
  };
}

export async function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
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

    const decoded = jwt.verify(token || req.cookies?.accessToken, secret) as any;

    // Verify user still exists in database
    const result = await pool.query(
      'SELECT id, email, role, first_name, last_name FROM users WHERE id = $1',
      [decoded.userId]
    );

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
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
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

export function requireRole(...roles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
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

export function optionalAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
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
    const decoded = jwt.verify(token || cookieToken, secret) as any;
    req.user = {
      id: decoded.userId,
      email: decoded.email,
      role: decoded.role,
    };
  } catch {
    // Invalid token, proceed without user
  }
  next();
}
