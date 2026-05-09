export interface AuthResult {
    user: any;
    accessToken: string;
    refreshToken: string;
}
export declare function registerUser(data: {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
    companyName?: string;
}): Promise<AuthResult>;
export declare function loginUser(email: string, password: string): Promise<AuthResult>;
export declare function refreshAccessToken(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
}>;
export declare function logoutUser(refreshToken?: string): Promise<void>;
export declare function changeUserPassword(userId: string, currentPassword: string, newPassword: string): Promise<void>;
export declare function getUserById(userId: string): Promise<any>;
//# sourceMappingURL=authService.d.ts.map