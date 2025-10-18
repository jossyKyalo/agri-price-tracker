import pg from 'pg';
export declare const pool: pg.Pool;
export declare const connectDatabase: () => Promise<void>;
export declare const query: (text: string, params?: any[]) => Promise<pg.QueryResult>;
export declare const transaction: <T>(callback: (client: pg.PoolClient) => Promise<T>) => Promise<T>;
export declare const closeDatabase: () => Promise<void>;
export default pool;
//# sourceMappingURL=connection.d.ts.map