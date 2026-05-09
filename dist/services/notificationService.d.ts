export declare function createNotification(data: {
    userId: string;
    title: string;
    body?: string;
    type?: string;
    relatedId?: string;
}): Promise<any>;
export declare function getUnreadCount(userId: string): Promise<number>;
export declare function getRecentNotifications(userId: string, limit?: number, unreadOnly?: boolean): Promise<any[]>;
export declare function broadcastToProject(projectId: string, event: string, data: any): Promise<void>;
export declare function emitToUser(userId: string, event: string, data: any): Promise<void>;
//# sourceMappingURL=notificationService.d.ts.map