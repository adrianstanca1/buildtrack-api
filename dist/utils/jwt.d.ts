export interface TokenPayload {
    userId: string;
    email: string;
    role: string;
}
export declare function generateAccessToken(payload: TokenPayload): string;
export declare function generateRefreshToken(payload: TokenPayload): string;
export declare function verifyAccessToken(token: string): TokenPayload;
export declare function verifyRefreshToken(token: string): TokenPayload;
export declare function decodeToken(token: string): TokenPayload | null;
/** Hash a refresh token for secure storage (SHA-256). */
export declare function hashRefreshToken(token: string): string;
//# sourceMappingURL=jwt.d.ts.map