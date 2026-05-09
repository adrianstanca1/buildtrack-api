import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const userId = (req as any).user?.id || 'anonymous';
    
    logger.info('API Request', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`,
      userId,
      ip: req.ip || req.socket.remoteAddress,
      userAgent: req.get('user-agent'),
    });
    
    if (duration > 1000) {
      logger.warn('Slow request', {
        method: req.method,
        path: req.path,
        duration: `${duration}ms`,
        userId,
      });
    }
  });
  
  next();
}
