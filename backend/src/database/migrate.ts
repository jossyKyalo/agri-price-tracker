import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { query } from './connection';
import { logger } from '../utils/logger';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Helper function to split SQL statements safely (handles dollar-quoted strings)
const splitSqlStatements = (sql: string): string[] => {
  const statements: string[] = [];
  let current = '';
  let inDollarQuote = false;
  let dollarQuoteTag = '';
  
  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    
    // Check for dollar quote start/end
    if (char === '$') {
      let tag = '$';
      let j = i + 1;
      
      // Extract the tag (e.g., $$ or $body$)
      while (j < sql.length && sql[j] !== '$') {
        tag += sql[j];
        j++;
      }
      if (j < sql.length) {
        tag += '$';
        
        if (inDollarQuote && tag === dollarQuoteTag) {
          // End of dollar quote
          inDollarQuote = false;
          current += tag;
          i = j;
          continue;
        } else if (!inDollarQuote) {
          // Start of dollar quote
          inDollarQuote = true;
          dollarQuoteTag = tag;
          current += tag;
          i = j;
          continue;
        }
      }
    }
    
    // If we hit a semicolon outside of dollar quotes, split
    if (char === ';' && !inDollarQuote) {
      const stmt = current.trim();
      if (stmt.length > 0) {
        statements.push(stmt);
      }
      current = '';
    } else {
      current += char;
    }
  }
  
  // Add the last statement if there is one
  const lastStmt = current.trim();
  if (lastStmt.length > 0) {
    statements.push(lastStmt);
  }
  
  return statements;
};

export const runMigrations = async (): Promise<void> => {
  try {
    logger.info('Starting database migrations...');
    
    const schemaPath = join(__dirname, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf8');
    
    const statements = splitSqlStatements(schema);
    
    for (const statement of statements) {
      try {
        await query(statement);
      } catch (error: any) {
        // Ignore "already exists" errors
        if (!error.message.includes('already exists')) {
          throw error;
        }
      }
    }
    
    logger.info('Database migrations completed successfully');
  } catch (error) {
    logger.error('Migration failed:', error);
    throw error;
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations()
    .then(() => {
      logger.info('Migrations completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Migration failed:', error);
      process.exit(1);
    });
}