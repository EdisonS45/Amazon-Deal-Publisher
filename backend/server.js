import express from "express";
import mongoose from "mongoose";
import connectDB from "./src/config/db.js";
import { startCronJob } from "./src/cron/jobScheduler.js";
import logger from "./src/config/logger.js";

import "./src/services/redisClient.js"; 

import postPreviewRouter from "./src/services/postPreview.js";

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || "development";

async function main() {
  try {
    await connectDB();

    const app = express();

    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    app.get("/health", (req, res) => {
      const dbStates = ["disconnected", "connected", "connecting", "disconnecting"];
      const dbState = dbStates[mongoose.connection.readyState] || "unknown";
      res.status(200).json({
        status: "ok",
        message: "Deal publisher operational.",
        environment: NODE_ENV,
        services: {
          database: dbState === "connected" ? "OK" : dbState.toUpperCase(),
          pipeline: "Scheduled",
        },
      });
    });

    app.use("/api/preview", postPreviewRouter);

    startCronJob();

    app.listen(PORT, () => {
      logger.info("----------------------------------------------------");
      logger.info(`🚀 Server running in ${NODE_ENV} mode on port ${PORT}`);
      logger.info(`🕰️  CRON Job scheduled to run.`);
      logger.info("----------------------------------------------------");
    });
  } catch (err) {
    logger.error("Failed to start server: " + (err?.message || err));
    process.exit(1);
  }
}

main();
