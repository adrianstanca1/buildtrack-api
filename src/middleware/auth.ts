import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../config/database.js';
import { getCachedUser, setCachedUser } from '../config/redis.js';

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

    const decoded = jwt.verify(token, secret) as any;
    const userId = decoded.userId;

    // Try Redis cache first (5-minute TTL)
    let user = await getCachedUser(userId);

    if (!user) {
      // Cache miss — query database
      const result = await pool.query(
        'SELECT id, email, role, first_name, last_name FROM users WHERE id = $1',
        [userId]
      );

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
      await setCachedUser(userId, user, 300);
    }

    req.user = user;
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

export function optionalAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  // Try to authenticate but don't fail if no token
  authenticateToken(req, res, (err?: any) => {
    if (err) {
      // Auth failed — clear user and continue as anonymous
      delete req.user;
    }
    next();
  });
}
