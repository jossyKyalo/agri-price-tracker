// middleware/rawBody.ts
import { Request, Response, NextFunction } from 'express';

/**
 * Middleware to capture raw request body for SMS webhook signature verification
 * This is needed BEFORE body-parser processes the request
 */
export const rawBodyMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Only process for SMS webhook endpoint
  if (req.originalUrl === '/api/v1/sms/webhook' || req.originalUrl.includes('/sms/webhook')) {
    let data = '';
    
    // Set encoding to utf8 to handle text properly
    req.setEncoding('utf8');
    
    // Capture raw body data
    req.on('data', (chunk: string) => {
      data += chunk;
    });
    
    // When all data is received
    req.on('end', () => {
      // Store raw body for signature verification
      (req as any).rawBody = data;
      
      // Parse JSON if data exists
      if (data && data.trim()) {
        try {
          req.body = JSON.parse(data);
        } catch (e) {
          // If JSON parsing fails, set body to empty object
          // The validation middleware will catch this
          req.body = {};
        }
      }
      
      next();
    });
  } else {
    // For non-webhook routes, proceed normally
    next();
  }
};

/**
 * Alternative: Simple version for all routes (less efficient)
 */
export const rawBodySimpleMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const chunks: Buffer[] = [];
  
  req.on('data', (chunk: Buffer) => {
    chunks.push(chunk);
  });
  
  req.on('end', () => {
    const buffer = Buffer.concat(chunks);
    (req as any).rawBody = buffer.toString('utf8');
    
    // Only parse JSON if it looks like JSON
    const raw = (req as any).rawBody;
    if (raw && raw.trim().startsWith('{')) {
      try {
        req.body = JSON.parse(raw);
      } catch (e) {
        // Leave body parsing to express.json()
      }
    }
    
    next();
  });
};