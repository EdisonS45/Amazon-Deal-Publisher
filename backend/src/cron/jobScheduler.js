import cron from "node-cron";
import config from "../config/index.js";
import logger from "../config/logger.js";
import {
  fetchAndSaveDeals,
  runPublishingPipeline,
} from "../services/dealPipeline.js";
import { sendEmail } from "../utils/emailService.js";

let isJobRunning = false;

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
                <h2 style="${STYLES.h2} color: ${COLORS.primary};">🚀 Pipeline Job Started</h2>
            </td>
        </tr>
        <tr>
            <td style="${STYLES.content}">
                <p style="${STYLES.p}">The deal fetching and publishing pipeline has commenced.</p>
                <table style="${STYLES.table}">
                    <tr>
                        <td style="${STYLES.tdKey}">Start Time</td>
                        <td style="${STYLES.tdValue}">${startTimestamp}</td>
                    </tr>
                    <tr>
                        <td style="${STYLES.tdKey}">Categories</td>
                        <td style="${STYLES.tdValue}">${(categories || []).join(", ")}</td>
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
  const shortPath = exportSummary.csvPath ? exportSummary.csvPath.split("/").pop() : "N/A";
  return `
<body style="${STYLES.body}">
    <table cellpadding="0" cellspacing="0" style="${STYLES.wrapper}">
        <tr>
            <td style="${STYLES.header}">
                <h2 style="${STYLES.h2} color: ${COLORS.success};">✅ Pipeline Completed Successfully</h2>
            </td>
        </tr>
        <tr>
            <td style="${STYLES.content}">
                <p style="${STYLES.p}">The scheduled deal processing and export pipeline has finished.</p>
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
                        <td style="${STYLES.tdKey} border-bottom: none;">Categories Processed</td>
                        <td style="${STYLES.tdValue} border-bottom: none;">${(categories || []).join(", ")}</td>
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
                    <pre style="background-color: ${COLORS.bg}; padding: 15px; border-radius: 4px; border: 1px solid ${COLORS.border}; color: ${COLORS.danger}; white-space: pre-wrap; word-wrap: break-word;">${error?.message || "Unknown error"}</pre>
                </div>
                <div style="margin-top: 15px;">
                    <strong style="color: ${COLORS.dark};">Stack Trace:</strong>
                    <pre style="background-color: ${COLORS.bg}; padding: 15px; border-radius: 4px; border: 1px solid ${COLORS.border}; color: ${COLORS.text}; white-space: pre-wrap; word-wrap: break-word; font-size: 12px;">${error?.stack || "No stack available"}</pre>
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

// --- CRON JOB ---
export const startCronJob = () => {
  const categoriesToFetch = config.AMAZON?.CATEGORIES || [];

  if (!categoriesToFetch || categoriesToFetch.length === 0) {
    logger.error("CRON Scheduler failed: No categories found in config.AMAZON.CATEGORIES. Aborting schedule setup.");
    return;
  }

  if (!config.CRON_SCHEDULE) {
    logger.error("CRON Scheduler failed: No cron expression configured in config.CRON_SCHEDULE. Aborting schedule setup.");
    return;
  }

  logger.info(`Scheduling deal fetching job with cron expression: ${config.CRON_SCHEDULE}`);
  logger.info(`Categories to be processed: ${(categoriesToFetch || []).join(", ")}`);

  cron.schedule(
    config.CRON_SCHEDULE,
    async () => {
      if (isJobRunning) {
        logger.warn("CRON job skipped: Previous job is still running (overlap prevention active).");
        return;
      }

      logger.info("*** CRON JOB EXECUTION STARTED ***");
      isJobRunning = true;

      const startTime = Date.now();
      const startTimestamp = new Date().toLocaleString();
      let summary = { totalDealsSaved: 0 };
      let exportSummary = {
        csvPath: "N/A",
        dealsExported: 0,
        dealsScheduled: 0,
      };

      try {
        // 1. Send Start Email
        const startHtmlContent = getStartEmailHtml(startTimestamp, categoriesToFetch);
        await sendEmail({
          subject: "🚀 CRON Job Started: Deal Pipeline",
          text: `Deal fetching job started at ${startTimestamp} for categories: ${(categoriesToFetch || []).join(", ")}`,
          html: startHtmlContent,
        });

        // 2. Run Pipeline
        summary = await fetchAndSaveDeals(categoriesToFetch);
        exportSummary = await runPublishingPipeline();

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        logger.info(`CRON Job finished successfully in ${duration}s. Summary: ${summary.totalDealsSaved} deals saved/updated.`);

        // 3. Send Success Email
        const htmlContent = getSuccessEmailHtml(summary, exportSummary, duration, categoriesToFetch);
        await sendEmail({
          subject: "✅ CRON Job Completed: Deal Pipeline",
          text: `The CRON job completed successfully. Duration: ${duration}s. Saved/Updated Deals: ${summary.totalDealsSaved}.`,
          html: htmlContent,
        });
      } catch (error) {
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        logger.error(`CRON Job critical failure after ${duration}s: ${error?.message || error}`);

        // 4. Send Failure Email
        const errorHtmlContent = getErrorEmailHtml(error || { message: "Unknown error", stack: "" }, duration, startTimestamp);
        await sendEmail({
          subject: "❌ CRON Job Failed: Deal Pipeline",
          text: `The CRON job failed after ${duration}s.\nError: ${error?.message || "Unknown error"}\nTime: ${new Date().toLocaleString()}`,
          html: errorHtmlContent,
        });
      } finally {
        isJobRunning = false;
        logger.info("*** CRON JOB EXECUTION FINISHED ***");
      }
    },
    {
      scheduled: true,
      timezone: config.TIMEZONE || "UTC",
    }
  );
};
