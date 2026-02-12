import pg from 'pg';
import { logger } from '../utils/logger'
import dotenv from "dotenv";
dotenv.config();

const { Pool } = pg;

 
const isProduction = process.env.NODE_ENV === 'production';
const isRemoteDB = process.env.DB_HOST && process.env.DB_HOST !== 'localhost';

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'agri_price_tracker',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  max: 10,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000, 
  ssl: (isProduction || isRemoteDB) ? { rejectUnauthorized: false } : false
};

 
export const pool = new Pool(dbConfig);
 
export const connectDatabase = async (): Promise<void> => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    logger.info(`Database connected at: ${result.rows[0].now}`);
    client.release();
  } catch (error) {
    logger.error('Database connection failed:', error);
    throw error;
  }
};
 
export const query = async (text: string, params?: any[]): Promise<pg.QueryResult> => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    logger.debug(`Query executed in ${duration}ms: ${text}`);
    return result;
  } catch (error) {
    logger.error(`Query failed: ${text}`, error);
    throw error;
  }
};
 
export const transaction = async <T>(
  callback: (client: pg.PoolClient) => Promise<T>
): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
 
export const closeDatabase = async (): Promise<void> => {
  try {
    await pool.end();
    logger.info('Database connection pool closed');
  } catch (error) {
    logger.error('Error closing database connection:', error);
  }
};
 
pool.on('error', (err) => {
  logger.error('Unexpected error on idle client', err);
});

export default pool;