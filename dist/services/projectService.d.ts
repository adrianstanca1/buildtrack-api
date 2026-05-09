export interface ProjectFilters {
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
}
export declare function listProjects(userId: string, filters?: ProjectFilters): Promise<{
    data: any[];
    total: number;
    page: number;
    limit: number;
}>;
export declare function getProjectWithRelations(projectId: string, userId: string): Promise<any>;
export declare function getProjectStats(projectId: string, userId: string): Promise<any>;
//# sourceMappingURL=projectService.d.ts.map