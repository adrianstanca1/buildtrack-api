import { Request, Response, NextFunction } from 'express';

export function performanceMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = process.hrtime();
  
  res.on('finish', () => {
    const diff = process.hrtime(start);
    const duration = (diff[0] * 1000 + diff[1] / 1e6).toFixed(2);
    res.setHeader('X-Response-Time', `${duration}ms`);
    
    if (Number(duration) > 1000) {
      console.warn(`Slow request: ${req.method} ${req.path} took ${duration}ms`);
    }
  });
  
  next();
}
