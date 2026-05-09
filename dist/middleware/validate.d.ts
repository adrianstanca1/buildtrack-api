import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
export declare function validate(schema: ZodSchema): (req: Request, res: Response, next: NextFunction) => void;
export declare function validateParams(schema: ZodSchema): (req: Request, res: Response, next: NextFunction) => void;
export declare function validateQuery(schema: ZodSchema): (req: Request, res: Response, next: NextFunction) => void;
//# sourceMappingURL=validate.d.ts.map