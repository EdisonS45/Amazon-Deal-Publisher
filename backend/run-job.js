import "dotenv/config";
import connectDB from "./src/config/db.js";
import logger from "./src/config/logger.js";
import {
  fetchAndSaveDeals,
  runPublishingPipeline,
} from "./src/services/dealPipeline.js";
import { sendEmail } from "./src/utils/emailService.js";
import mongoose from "mongoose";
import client from "./src/services/redisClient.js";
import config from "./src/config/index.js";

const COLORS = {
  primary: "#007bff",
  success: "#28a745",
  danger: "#dc3545",
  light: "#f8f9fa",
  dark: "#343a40",
  text: "#555555",
  textLight: "#aaaaaa",
  border: "#eeeeee",
  bg: "#f9f9f9",
};

const STYLES = {
  body: `font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: ${COLORS.light};`,
  wrapper: `width: 100%; max-width: 600px; margin: 20px auto; background-color: #ffffff; border: 1px solid ${COLORS.border}; border-radius: 8px; box-shadow: 0 4px 10px rgba(0,0,0,0.05);`,
  header: `padding: 25px 30px; border-bottom: 1px solid ${COLORS.border};`,
  content: `padding: 30px;`,
  footer: `padding: 20px 30px; border-top: 1px solid ${COLORS.border}; text-align: center; font-size: 12px; color: ${COLORS.textLight};`,
  h2: `margin: 0; font-size: 24px;`,
  p: `margin: 15px 0 0; color: ${COLORS.text}; line-height: 1.6;`,
  table: `width: 100%; border-collapse: collapse; margin-top: 25px;`,
  tdKey: `padding: 12px 0; font-weight: bold; color: ${COLORS.dark}; border-bottom: 1px solid ${COLORS.border};`,
  tdValue: `padding: 12px 0; color: ${COLORS.text}; border-bottom: 1px solid ${COLORS.border}; text-align: right;`,
};

const getStartEmailHtml = (startTimestamp, categories) => {
  return `
<body style="${STYLES.body}">
  <table cellpadding="0" cellspacing="0" style="${STYLES.wrapper}">
    <tr>
      <td style="${STYLES.header}">
        <h2 style="${STYLES.h2} color: ${
    COLORS.primary
  };">🚀 Pipeline Job Started</h2>
      </td>
    </tr>
    <tr>
      <td style="${STYLES.content}">
        <p style="${
          STYLES.p
        }">The deal fetching and publishing pipeline has commenced.</p>
        <table style="${STYLES.table}">
          <tr>
            <td style="${STYLES.tdKey}">Start Time</td>
            <td style="${STYLES.tdValue}">${startTimestamp}</td>
          </tr>
          <tr>
            <td style="${STYLES.tdKey}">Categories</td>
            <td style="${STYLES.tdValue}">${categories.join(", ")}</td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="${STYLES.footer}">Automated Notification</td>
    </tr>
  </table>
</body>
  `;
};

const getSuccessEmailHtml = (summary, exportSummary, duration, categories) => {
  const shortPath = exportSummary.csvPath
    ? exportSummary.csvPath.split("/").pop()
    : "N/A";
  return `
<body style="${STYLES.body}">
  <table cellpadding="0" cellspacing="0" style="${STYLES.wrapper}">
    <tr>
      <td style="${STYLES.header}">
        <h2 style="${STYLES.h2} color: ${
    COLORS.success
  };">✅ Pipeline Completed Successfully</h2>
      </td>
    </tr>
    <tr>
      <td style="${STYLES.content}">
        <p style="${
          STYLES.p
        }">The scheduled deal processing and export pipeline has finished.</p>
        <table style="${STYLES.table}">
          <tr>
            <td style="${STYLES.tdKey}">Duration</td>
            <td style="${STYLES.tdValue}">${duration} seconds</td>
          </tr>
          <tr>
            <td style="${STYLES.tdKey}">Deals Saved/Updated</td>
            <td style="${STYLES.tdValue}">${summary.totalDealsSaved}</td>
          </tr>
          <tr>
            <td style="${STYLES.tdKey}">Deals Exported to CSV</td>
            <td style="${STYLES.tdValue}">${exportSummary.dealsExported}</td>
          </tr>
          <tr>
            <td style="${STYLES.tdKey}">Posts Scheduled (Publer)</td>
            <td style="${STYLES.tdValue}">${exportSummary.dealsScheduled}</td>
          </tr>
          <tr>
            <td style="${STYLES.tdKey}">CSV Filename</td>
            <td style="${STYLES.tdValue}">${shortPath}</td>
          </tr>
          <tr>
            <td style="${STYLES.tdKey}">Categories Processed</td>
            <td style="${STYLES.tdValue}">${categories.join(", ")}</td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="${STYLES.footer}">Automated Notification</td>
    </tr>
  </table>
</body>
  `;
};

const getErrorEmailHtml = (error, duration, startTimestamp) => {
  return `
<body style="${STYLES.body}">
  <table cellpadding="0" cellspacing="0" style="${STYLES.wrapper}">
    <tr>
      <td style="${STYLES.header}">
        <h2 style="${STYLES.h2} color: ${COLORS.danger};">❌ Pipeline Job Failed</h2>
      </td>
    </tr>
    <tr>
      <td style="${STYLES.content}">
        <p style="${STYLES.p}">A critical error occurred during the pipeline execution.</p>
        <table style="${STYLES.table}">
          <tr>
            <td style="${STYLES.tdKey}">Start Time</td>
            <td style="${STYLES.tdValue}">${startTimestamp}</td>
          </tr>
          <tr>
            <td style="${STYLES.tdKey}">Failed After</td>
            <td style="${STYLES.tdValue}">${duration} seconds</td>
          </tr>
        </table>
        <div style="margin-top: 25px;">
          <strong style="color: ${COLORS.dark};">Error Message:</strong>
          <pre style="background-color: ${COLORS.bg}; padding: 15px; border-radius: 4px; border: 1px solid ${COLORS.border}; color: ${COLORS.danger}; white-space: pre-wrap; word-wrap: break-word;">${error.message}</pre>
        </div>
        <div style="margin-top: 15px;">
          <strong style="color: ${COLORS.dark};">Stack Trace:</strong>
          <pre style="background-color: ${COLORS.bg}; padding: 15px; border-radius: 4px; border: 1px solid ${COLORS.border}; color: ${COLORS.text}; white-space: pre-wrap; word-wrap: break-word; font-size: 12px;">${error.stack}</pre>
        </div>
      </td>
    </tr>
    <tr>
      <td style="${STYLES.footer}">Automated Notification</td>
    </tr>
  </table>
</body>
  `;
};

const runJob = async () => {
  const categoriesToFetch = config.AMAZON.CATEGORIES;
  if (!categoriesToFetch || categoriesToFetch.length === 0) {
    logger.error(
      "CRON Job failed: No categories found in config.AMAZON.CATEGORIES."
    );
    return;
  }

  logger.info("*** RENDER CRON JOB EXECUTION STARTED ***");
  logger.info(`Categories to be processed: ${categoriesToFetch.join(", ")}`);

  const startTime = Date.now();
  const startTimestamp = new Date().toLocaleString();
  let summary = { totalDealsSaved: 0 };
  let exportSummary = {
    csvPath: "N/A",
    dealsExported: 0,
    dealsScheduled: 0,
  };

  try {
    await connectDB();
    logger.info("Connected to MongoDB and Redis.");

    const startHtmlContent = getStartEmailHtml(
      startTimestamp,
      categoriesToFetch
    );
    await sendEmail({
      subject: "🚀 CRON Job Started: Deal Pipeline",
      text: `Deal fetching job started at ${startTimestamp} for categories: ${categoriesToFetch.join(
        ", "
      )}`,
      html: startHtmlContent,
    });

    summary = await fetchAndSaveDeals(categoriesToFetch);
    exportSummary = await runPublishingPipeline();

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    logger.info(
      `CRON Job finished successfully in ${duration}s. Summary: ${summary.totalDealsSaved} deals saved/updated.`
    );

    const htmlContent = getSuccessEmailHtml(
      summary,
      exportSummary,
      duration,
      categoriesToFetch
    );
    await sendEmail({
      subject: "✅ CRON Job Completed: Deal Pipeline",
      text: `The CRON job completed successfully. Duration: ${duration}s. Saved/Updated Deals: ${summary.totalDealsSaved}.`,
      html: htmlContent,
    });
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    logger.error(
      `CRON Job critical failure after ${duration}s: ${error.message}`
    );

    const errorHtmlContent = getErrorEmailHtml(error, duration, startTimestamp);
    await sendEmail({
      subject: "❌ CRON Job Failed: Deal Pipeline",
      text: `The CRON job failed after ${duration}s.\nError: ${
        error.message
      }\nTime: ${new Date().toLocaleString()}`,
      html: errorHtmlContent,
    });
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    await client.quit();
    logger.info("Disconnected from DB/Redis. Job finished.");
    process.exit(0);
  }
};

runJob();
