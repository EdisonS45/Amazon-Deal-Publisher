// D:\amazon-deal-publisher\backend\src\cron\jobScheduler.js (Modified for FANCY Start Email)

import cron from 'node-cron';
import config from '../config/index.js';
import logger from '../config/logger.js';
import { fetchAndSaveDeals, runPublishingPipeline } from '../services/dealPipeline.js';
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
            let summary = { totalDealsSaved: 0 };
            let exportSummary = { csvPath: 'N/A', dealsExported: 0, dealsScheduled: 0 };
            const startTimestamp = new Date().toLocaleString();

            try {
                // 1. START Notification (FANCY HTML Report)
                const startHtmlContent = `
                    <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
                        <h2 style="color: #007bff;">🚀 CRON Job Execution Started</h2>
                        <p style="color: #555;">The deal fetching pipeline has commenced. Expect a completion report soon.</p>
                        
                        <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
                            <tr>
                                <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; width: 30%; background-color: #f9f9f9;">Start Time</td>
                                <td style="padding: 10px; border: 1px solid #ddd;">${startTimestamp}</td>
                            </tr>
                            <tr>
                                <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; background-color: #f9f9f9;">Categories Targeted</td>
                                <td style="padding: 10px; border: 1px solid #ddd;">${categoriesToFetch.join(', ')}</td>
                            </tr>
                        </table>
                    </div>
                `;

                await sendEmail({
                    subject: 'CRON Job Started 🚀',
                    text: `Deal fetching job started at ${startTimestamp} for categories: ${categoriesToFetch.join(', ')}`,
                    html: startHtmlContent
                });

                summary = await fetchAndSaveDeals(categoriesToFetch);
                exportSummary = await runPublishingPipeline(); 
                
                const duration = ((Date.now() - startTime) / 1000).toFixed(2);
                logger.info(`CRON Job finished successfully in ${duration}s. Summary: ${summary.totalDealsSaved} deals saved/updated.`);
                
                const shortPath = exportSummary.csvPath ? exportSummary.csvPath.split('/').pop() : 'N/A';
                
                const htmlContent = `
                    <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
                        <h2 style="color: #4CAF50;">✅ CRON Job Completed Successfully</h2>
                        <p style="color: #555;">The scheduled deal processing and export pipeline has finished.</p>
                        
                        <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
                            <tr>
                                <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; width: 30%; background-color: #f9f9f9;">Completion Time</td>
                                <td style="padding: 10px; border: 1px solid #ddd;">${new Date().toLocaleString()}</td>
                            </tr>
                            <tr>
                                <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; background-color: #f9f9f9;">Duration</td>
                                <td style="padding: 10px; border: 1px solid #ddd;">${duration} seconds</td>
                            </tr>
                            <tr>
                                <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; background-color: #f9f9f9;">Deals Saved/Updated</td>
                                <td style="padding: 10px; border: 1px solid #ddd;">${summary.totalDealsSaved}</td>
                            </tr>
                            <tr>
                                <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; background-color: #f9f9f9;">Deals Exported to CSV</td>
                                <td style="padding: 10px; border: 1px solid #ddd;">${exportSummary.dealsExported}</td>
                            </tr>
                            <tr>
                                <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; background-color: #f9f9f9;">Deals Exported to CSV</td>
                                <td style="padding: 10px; border: 1px solid #ddd;">${exportSummary.dealsExported}</td>
                            </tr>
                            <tr>
                                <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; background-color: #f9f9f9;">Posts Scheduled (Publer)</td>
                                <td style="padding: 10px; border: 1px solid #ddd;">${exportSummary.dealsScheduled}</td>
                            </tr>
                            <tr>
                                <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; background-color: #f9f9f9;">CSV Filename</td>
                                <td style="padding: 10px; border: 1px solid #ddd;">${shortPath}</td>
                            </tr>
                            <tr>
                                <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; background-color: #f9f9f9;">CSV Filename</td>
                                <td style="padding: 10px; border: 1px solid #ddd;">${shortPath}</td>
                            </tr>
                            <tr>
                                <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; background-color: #f9f9f9;">Categories Processed</td>
                                <td style="padding: 10px; border: 1px solid #ddd;">${categoriesToFetch.join(', ')}</td>
                            </tr>
                        </table>
                    </div>
                `;

                await sendEmail({
                    subject: 'CRON Job Completed ✅',
                    text: `The CRON job completed successfully. Duration: ${duration}s. Saved/Updated Deals: ${summary.totalDealsSaved}.`,
                    html: htmlContent
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