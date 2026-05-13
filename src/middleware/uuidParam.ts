import { Request, Response, NextFunction, Router } from 'express';

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * Returns true for valid v1/v4 UUID strings.
 */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/**
 * Express `router.param()` validator: rejects non-UUID path params with
 * a 400 before the route handler runs. Without this, malformed UUIDs
 * pass through to Postgres which returns a 22P02 error caught by the
 * route's generic `try/catch` and surfaced as a 500 — leaking DB shape
 * and breaking the contract for clients sending bad data.
 *
 * Usage:
 *   applyUuidValidation(router, ['id', 'projectId']);
 */
export function applyUuidValidation(router: Router, paramNames: string[]): void {
  for (const name of paramNames) {
    router.param(name, (req: Request, res: Response, next: NextFunction, value: string) => {
      if (!isUuid(value)) {
        res.status(400).json({
          success: false,
          error: { message: `Invalid ${name}: must be a UUID`, code: 'VALIDATION_ERROR' },
        });
        return;
      }
      next();
    });
  }
}
