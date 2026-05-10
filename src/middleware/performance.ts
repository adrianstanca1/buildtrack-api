import { Request, Response, NextFunction } from 'express';

export function performanceMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = process.hrtime();

  // Set X-Response-Time header before the response is sent
  const originalSend = res.send.bind(res);
  (res as any).send = function (this: Response, body?: any) {
    const diff = process.hrtime(start);
    const duration = (diff[0] * 1000 + diff[1] / 1e6).toFixed(2);

    if (!res.headersSent) {
      res.setHeader('X-Response-Time', `${duration}ms`);
    }

    if (Number(duration) > 1000) {
      console.warn(`Slow request: ${req.method} ${req.path} took ${duration}ms`);
    }

    return originalSend.call(this, body);
  };

  // Also intercept json() since that's what we use
  const originalJson = res.json.bind(res);
  (res as any).json = function (this: Response, body?: any) {
    const diff = process.hrtime(start);
    const duration = (diff[0] * 1000 + diff[1] / 1e6).toFixed(2);

    if (!res.headersSent) {
      res.setHeader('X-Response-Time', `${duration}ms`);
    }

    if (Number(duration) > 1000) {
      console.warn(`Slow request: ${req.method} ${req.path} took ${duration}ms`);
    }

    return originalJson.call(this, body);
  };

  next();
}
