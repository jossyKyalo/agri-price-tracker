import pg from 'pg';
import { logger } from '../utils/logger'
import dotenv from "dotenv";
dotenv.config();

const { Pool } = pg;

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'agri_price_tracker',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD ,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
};

// Create connection pool
export const pool = new Pool(dbConfig);

// Database connection function
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

// Query helper function
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

// Transaction helper
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

// Graceful shutdown
export const closeDatabase = async (): Promise<void> => {
  try {
    await pool.end();
    logger.info('Database connection pool closed');
  } catch (error) {
    logger.error('Error closing database connection:', error);
  }
};

// Handle pool errors
pool.on('error', (err) => {
  logger.error('Unexpected error on idle client', err);
});

export default pool;