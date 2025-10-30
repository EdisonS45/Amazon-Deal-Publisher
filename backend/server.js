import express from 'express';
import mongoose from 'mongoose';
import connectDB from './src/config/db.js';
import { startCronJob } from './src/cron/jobScheduler.js';
import logger from './src/config/logger.js';

connectDB(); 

import './src/services/redisClient.js'; 

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

app.use(express.json()); 

app.get('/health', (req, res) => {
  const dbStates = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  const dbState = dbStates[mongoose.connection.readyState];

  res.status(200).json({
    status: 'ok',
    message: 'Deal publisher operational.',
    environment: NODE_ENV,
    services: {
      database: dbState === 'connected' ? 'OK' : dbState.toUpperCase(),
      pipeline: 'Scheduled',
    }
  });
});

startCronJob();

app.listen(PORT, () => {
    logger.info('----------------------------------------------------');
    logger.info(`🚀 Server running in ${NODE_ENV} mode on port ${PORT}`);
    logger.info(`🕰️  CRON Job scheduled to run.`);
    logger.info('----------------------------------------------------');
});