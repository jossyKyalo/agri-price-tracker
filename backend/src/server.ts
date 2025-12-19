import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import { createServer } from 'http';

import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { rateLimiter } from './middleware/rateLimiter';
import { requestLogger } from './middleware/requestLogger';
import { connectDatabase } from './database/connection';
import { startCronJobs } from './services/cronService';
 
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import cropRoutes from './routes/crops';
import priceRoutes from './routes/prices';
import adminRoutes from './routes/admin';
import smsRoutes from './routes/sms.js';
import chatbotRoutes from './routes/chatbot';
import kamisRoutes from './routes/kamis';
import mlRoutes from './routes/ml.js';
import analyticsRoutes from './routes/analytics';
import regionRoutes from './routes/region';
import alertsRoutes from './routes/alerts';
import statsRoutes from './routes/stats';
 
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const API_VERSION = process.env.API_VERSION || 'v1';
 
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
 
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:4200'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
 
app.use(compression());
 
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
 
app.use(requestLogger);
 
app.use(rateLimiter);
 
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    version: process.env.npm_package_version || '1.0.0'
  });
});
 
app.use(`/api/${API_VERSION}/auth`, authRoutes);
app.use(`/api/${API_VERSION}/users`, userRoutes);
app.use(`/api/${API_VERSION}/crops`, cropRoutes);
app.use(`/api/${API_VERSION}/prices`, priceRoutes);
app.use(`/api/${API_VERSION}/admin`, adminRoutes);
app.use(`/api/${API_VERSION}/sms`, smsRoutes);
app.use(`/api/${API_VERSION}/chatbot`, chatbotRoutes);
app.use(`/api/${API_VERSION}/kamis`, kamisRoutes);
app.use(`/api/${API_VERSION}/ml`, mlRoutes);
app.use(`/api/${API_VERSION}/analytics`, analyticsRoutes);
app.use(`/api/${API_VERSION}/regions`, regionRoutes);
app.use(`/api/${API_VERSION}/admin/alerts`, alertsRoutes)
app.use(`/api/${API_VERSION}/stats`, statsRoutes)

 
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found',
    path: req.originalUrl
  });
});
 
app.use(errorHandler);
 
const server = createServer(app);
 
const gracefulShutdown = (signal: string) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);
  
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
 
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 30000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
 
const startServer = async () => {
  try { 
    await connectDatabase();
    logger.info('Database connected successfully');
 
    startCronJobs();
    logger.info('Cron jobs started');

     
    server.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT}`);
      logger.info(`📚 API Documentation: http://localhost:${PORT}/api/${API_VERSION}`);
      logger.info(`🏥 Health Check: http://localhost:${PORT}/health`);
      logger.info(`🌍 Environment: ${process.env.NODE_ENV}`);
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

export default app;