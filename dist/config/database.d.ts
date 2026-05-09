import { Pool } from 'pg';
export declare const pool: Pool;
export declare function query(text: string, params?: any[]): Promise<import("pg").QueryResult<any>>;
export declare function transaction<T>(callback: (client: any) => Promise<T>): Promise<T>;
export declare function initDatabase(): Promise<void>;
export declare function seedDatabase(): Promise<void>;
//# sourceMappingURL=database.d.ts.map