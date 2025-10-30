import { fetchDealsByCategory } from "./amazonScraper.js";
import { processRawDeals } from "./dataCleaner.js";
import Product from "../models/Product.js";
import logger from "../config/logger.js";
import { exportDealsToCsv } from "./csvWriter.js";
import config from "../config/index.js";
import { generateSocialCaption } from "./postGenerator.js";
import { publishDealToPubler } from "./publerPublisher.js";

export const fetchAndSaveDeals = async (
  categories = config.AMAZON.CATEGORIES
) => {
  logger.info("--- DEAL FETCHING PIPELINE STARTED ---");
  let totalDealsProcessed = 0;
  let totalDealsSaved = 0;

  const fetchPromises = categories.map(async (category) => {
    try {
      const rawProducts = await fetchDealsByCategory(
        category,
        config.AMAZON.ITEM_COUNT
      );
      totalDealsProcessed += rawProducts.length;

      const cleanedDeals = processRawDeals(rawProducts, category);

      if (cleanedDeals.length === 0) {
        logger.warn(`No valid deals found in category: ${category}`);
        return 0;
      }

      const bulkOperations = cleanedDeals.map((deal) => ({
        updateOne: {
          filter: { ASIN: deal.ASIN },
          update: deal,
          upsert: true,
        },
      }));

      const result = await Product.bulkWrite(bulkOperations, {
        ordered: false,
      });

      const savedCount = result.upsertedCount + result.modifiedCount;
      logger.info(
        `[${category}] Bulk Upsert: Saved ${savedCount} new/updated deals.`
      );

      return savedCount;
    } catch (error) {
      logger.error(
        `FATAL Pipeline error for category ${category}: ${error.message}`
      );
      return 0;
    }
  });

  const results = await Promise.all(fetchPromises);

  totalDealsSaved = results.reduce((sum, count) => sum + count, 0);

  logger.info(
    `--- PIPELINE FINISHED: Processed ${totalDealsProcessed} raw items. Saved/Updated ${totalDealsSaved} deals. ---`
  );
  return { totalDealsProcessed, totalDealsSaved };
};

export const getDealsForExport = async (limit = 400) => {
  logger.info(`Fetching up to ${limit} unposted deals from the database.`);
  try {
    const deals = await Product.find({ IsPosted: false })
      .sort({ DiscountPercentage: -1, LastUpdated: -1 })
      .limit(limit)
      .lean();

    logger.info(`Retrieved ${deals.length} deals for processing.`);
    return deals;
  } catch (error) {
    logger.error(`DB Error during deal retrieval: ${error.message}`);
    return [];
  }
};

const scheduleSocialPosts = async (dealsToPublish) => {
  logger.info(
    `Starting social media scheduling for ${dealsToPublish.length} deals.`
  );

  let scheduledCount = 0;
  const postIntervalMs = 5 * 60 * 1000; 
  let baseTime = new Date(Date.now() + postIntervalMs);

  for (let i = 0; i < dealsToPublish.length; i++) {
    const deal = dealsToPublish[i];
    
    const scheduleTime = new Date(baseTime.getTime() + i * postIntervalMs);

    const caption = generateSocialCaption(deal);

    const publerResponse = await publishDealToPubler(
      deal,
      caption,
      scheduleTime
    );

    if (publerResponse) {
      scheduledCount++;

      await Product.updateOne(
        { ASIN: deal.ASIN },
        {
          $set: {
            IsPosted: true,
            PostScheduleTime: scheduleTime,
            PublerPostID: publerResponse.id || "N/A",
          },
        }
      );
      logger.info(
        `Post scheduled and deal marked as posted: ${
          deal.ASIN
        }. Scheduled for: ${scheduleTime.toLocaleString()}`
      );
    } else {
      logger.warn(
        `Failed to schedule post for ASIN ${deal.ASIN}. Skipping update.`
      );
    }
  }

  logger.info(
    `Social Media Scheduling Complete. Total posts scheduled: ${scheduledCount}.`
  );
  return scheduledCount;
};

export const runPublishingPipeline = async () => {
  logger.info("--- PUBLISHING & EXPORT PIPELINE STARTED ---");

  let dealsToProcess = await getDealsForExport(400);

  if (config.TEST_MODE) {
    logger.info("🧪 Running in TEST MODE: Only a few posts will be scheduled.");
    logger.warn("⚠ TEST_MODE is ON — limiting to 3 deals for testing.");
    dealsToProcess = dealsToProcess.slice(3, 6);
  }

  if (dealsToProcess.length === 0) {
    logger.warn("Publishing Pipeline stopped: No new deals to process.");
    return { csvPath: null, dealsExported: 0, dealsScheduled: 0 };
  }

  const filePath = await exportDealsToCsv(dealsToProcess);

  const dealsScheduled = await scheduleSocialPosts(dealsToProcess);


  logger.info("--- PUBLISHING & EXPORT PIPELINE FINISHED ---");

  return {
    csvPath: filePath,
    dealsExported: dealsToProcess.length,
    dealsScheduled: dealsScheduled,
  };
};
