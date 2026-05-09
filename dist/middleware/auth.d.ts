import { Request, Response, NextFunction } from 'express';
export interface AuthenticatedRequest extends Request {
    user?: {
        id: string;
        email: string;
        role: string;
        firstName?: string;
        lastName?: string;
    };
}
export declare function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void>;
export declare function requireRole(...roles: string[]): (req: AuthenticatedRequest, res: Response, next: NextFunction) => void;
export declare function optionalAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void;
//# sourceMappingURL=auth.d.ts.map