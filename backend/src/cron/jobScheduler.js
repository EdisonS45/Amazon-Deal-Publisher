import cron from 'node-cron';
import config from '../config/index.js';
import logger from '../config/logger.js';
import { fetchAndSaveDeals } from '../services/dealPipeline.js';
import { sendEmail } from '../utils/emailService.js'; 
let isJobRunning = false;

export const startCronJob = () => {
    const categoriesToFetch = config.AMAZON.CATEGORIES;

    if (!categoriesToFetch || categoriesToFetch.length === 0) {
        logger.error('CRON Scheduler failed: No categories found in config.AMAZON.CATEGORIES. Aborting schedule setup.');
        return;
    }

    logger.info(`Scheduling deal fetching job with cron expression: ${config.CRON_SCHEDULE}`);
    logger.info(`Categories to be processed: ${categoriesToFetch.join(', ')}`);

    cron.schedule(
        config.CRON_SCHEDULE,
        async () => {
            if (isJobRunning) {
                logger.warn('CRON job skipped: Previous job is still running (overlap prevention active).');
                return;
            }

            logger.info('*** CRON JOB EXECUTION STARTED ***');
            isJobRunning = true;

            const startTime = Date.now(); 

            try {
                await sendEmail({
                    subject: 'CRON Job Started 🚀',
                    text: `Deal fetching job started at ${new Date().toLocaleString()} for categories: ${categoriesToFetch.join(', ')}`
                });

                const summary = await fetchAndSaveDeals(categoriesToFetch);
                const duration = ((Date.now() - startTime) / 1000).toFixed(2);

                logger.info(`CRON Job finished successfully in ${duration}s. Summary: ${summary.totalDealsSaved} deals saved/updated.`);

                await sendEmail({
                    subject: 'CRON Job Completed ✅',
                    text: `The CRON job completed successfully.\n\n⏱️ Duration: ${duration}s\n💾 Saved/Updated Deals: ${summary.totalDealsSaved}\n📦 Categories: ${categoriesToFetch.join(', ')}\n🕒 Completed at: ${new Date().toLocaleString()}`
                });

            } catch (error) {
                const duration = ((Date.now() - startTime) / 1000).toFixed(2);
                logger.error(`CRON Job critical failure after ${duration}s: ${error.message}`);

                await sendEmail({
                    subject: 'CRON Job Failed ❌',
                    text: `The CRON job failed after ${duration}s.\nError: ${error.message}\nTime: ${new Date().toLocaleString()}`
                });
            } finally {
                isJobRunning = false;
                logger.info('*** CRON JOB EXECUTION FINISHED ***');
            }
        },
        {
            scheduled: true,
            timezone: config.TIMEZONE || 'UTC',
        }
    );
};
