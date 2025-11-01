import cron from "node-cron";
import config from "../config/index.js";
import logger from "../config/logger.js";
import { sendEmail } from "../utils/emailService.js";

import { fetchAndSaveDeals } from "../services/dealPipeline.js"; // Phase 1
import { runEnrichmentPipeline } from "../services/enrichmentService.js"; // Phase 2
import { runContentFactory } from "../services/contentFactory.js"; // Phase 3
import { runScheduler } from "../services/schedulerService.js"; // Phase 4

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
                <h2 style="${STYLES.h2} color: ${COLORS.primary};">🚀 V2 Pipeline Job Started</h2>
            </td>
        </tr>
        <tr>
            <td style="${STYLES.content}">
                <p style="${STYLES.p}">The 4-Phase deal pipeline has commenced.</p>
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

const getSuccessEmailHtml = (summary, duration) => {
  return `
<body style="${STYLES.body}">
    <table cellpadding="0" cellspacing="0" style="${STYLES.wrapper}">
        <tr>
            <td style="${STYLES.header}">
                <h2 style="${STYLES.h2} color: ${
    COLORS.success
  };">✅ V2 Pipeline Completed Successfully</h2>
            </td>
        </tr>
        <tr>
            <td style="${STYLES.content}">
                <p style="${STYLES.p}">The automated 4-phase pipeline has finished.</p>
                
                <h3 style="color: ${
                  COLORS.dark
                }; margin-top: 25px; margin-bottom: 10px;">📊 Final Summary</h3>
                <table style="${STYLES.table}">
                    <tr>
                        <td style="${STYLES.tdKey}">Total Duration</td>
                        <td style="${STYLES.tdValue}">${duration} seconds</td>
                    </tr>
                    <tr>
                        <td style="${STYLES.tdKey}">Phase 1: Deals Fetched</td>
                        <td style="${STYLES.tdValue}">${
    summary.dealsFetched
  }</td>
                    </tr>
                    <tr>
                        <td style="${STYLES.tdKey}">Phase 2: Deals Enriched</td>
                        <td style="${STYLES.tdValue}">${
    summary.dealsEnriched
  }</td>
                    </tr>
                    <tr>
                        <td style="${STYLES.tdKey}">Phase 3: Posts Generated</td>
                        <td style="${STYLES.tdValue}">${
    summary.postsGenerated
  }</td>
                    </tr>
                    <tr>
                        <td style="${
                          STYLES.tdKey
                        } border-bottom: none;">Phase 4: Posts Scheduled</td>
                        <td style="${
                          STYLES.tdValue
                        } border-bottom: none;">${summary.postsScheduled}</td>
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
                <h2 style="${STYLES.h2} color: ${
    COLORS.danger
  };">❌ V2 Pipeline Job Failed</h2>
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
                    <strong style="color: ${
                      COLORS.dark
                    };">Error Message:</strong>
                    <pre style="background-color: ${COLORS.bg}; padding: 15px; border-radius: 4px; border: 1px solid ${
    COLORS.border
  }; color: ${
    COLORS.danger
  }; white-space: pre-wrap; word-wrap: break-word;">${error.message}</pre>
                </div>
                <div style="margin-top: 15px;">
                    <strong style="color: ${COLORS.dark};">Stack Trace:</strong>
                    <pre style="background-color: ${COLORS.bg}; padding: 15px; border-radius: 4px; border: 1px solid ${
    COLORS.border
  }; color: ${
    COLORS.text
  }; white-space: pre-wrap; word-wrap: break-word; font-size: 12px;">${
    error.stack
  }</pre>
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

export const runFullPipeline = async () => {
  if (isJobRunning) {
    logger.warn(
      "CRON job skipped: Previous job is still running (overlap prevention active)."
    );
    return;
  }
  
  logger.info("*** (V2) CRON JOB EXECUTION STARTED ***");
  isJobRunning = true;

  const startTime = Date.now();
  const startTimestamp = new Date().toLocaleString();
  const categoriesToFetch = config.AMAZON.CATEGORIES;

  const finalSummary = {
    dealsFetched: 0,
    dealsEnriched: 0,
    postsGenerated: 0,
    postsScheduled: 0,
  };

  try {
    const startHtmlContent = getStartEmailHtml(
      startTimestamp,
      categoriesToFetch
    );
    await sendEmail({
      subject: "🚀 (V2) CRON Job Started: Deal Pipeline",
      html: startHtmlContent,
    });

    logger.info("--- (PHASE 1) STARTING: fetchAndSaveDeals ---");
    const phase1Summary = await fetchAndSaveDeals(categoriesToFetch);
    finalSummary.dealsFetched = phase1Summary.totalDealsSaved;
    logger.info("--- (PHASE 1) COMPLETE ---");

    logger.info("--- (PHASE 2) STARTING: runEnrichmentPipeline ---");
    const phase2Summary = await runEnrichmentPipeline(); 
    finalSummary.dealsEnriched = phase2Summary.enrichedCount;
    logger.info("--- (PHASE 2) COMPLETE ---");

    logger.info("--- (PHASE 3) STARTING: runContentFactory ---");
    const phase3Summary = await runContentFactory(); 
    finalSummary.postsGenerated = phase3Summary.postsCreated;
    logger.info("--- (PHASE 3) COMPLETE ---");
    
    logger.info("--- (PHASE 4) STARTING: runScheduler ---");
    const phase4Summary = await runScheduler(); 
    finalSummary.postsScheduled = phase4Summary.scheduledCount;
    logger.info("--- (PHASE 4) COMPLETE ---");

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    logger.info(
      `CRON Job finished successfully in ${duration}s. Summary: ${JSON.stringify(
        finalSummary
      )}`
    );

    const htmlContent = getSuccessEmailHtml(finalSummary, duration);
    await sendEmail({
      subject: "✅ (V2) CRON Job Completed: Deal Pipeline",
      html: htmlContent,
    });

  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    logger.error(
      `CRON Job critical failure after ${duration}s: ${error.message}`
    );

    const errorHtmlContent = getErrorEmailHtml(
      error,
      duration,
      startTimestamp
    );
    await sendEmail({
      subject: "❌ (V2) CRON Job Failed: Deal Pipeline",
      html: errorHtmlContent,
    });
  } finally {
    isJobRunning = false;
    logger.info("*** (V2) CRON JOB EXECUTION FINISHED ***");
  }
};


export const startCronJob = () => {
  if (
    !config.AMAZON.CATEGORIES ||
    config.AMAZON.CATEGORIES.length === 0
  ) {
    logger.error(
      "CRON Scheduler failed: No categories found. Aborting schedule."
    );
    return;
  }

  logger.info(
    `Scheduling full V2 pipeline with cron expression: ${config.CRON_SCHEDULE}`
  );

  cron.schedule(
    config.CRON_SCHEDULE,
    async () => {
      await runFullPipeline();
    },
    {
      scheduled: true,
      timezone: config.TIMEZONE || "UTC",
    }
  );

  if (config.NODE_ENV === 'development') {
    logger.info("DEVELOPMENT MODE: Running pipeline once on startup...");
    runFullPipeline();
  }
};