import { fetchDealsByCategory } from "./amazonScraper.js";
import { processRawDeals } from "./dataCleaner.js";
import Product from "../models/Product.js";
import logger from "../config/logger.js";
import { exportDealsToCsv } from "./csvWriter.js";
import config from "../config/index.js";
import { generateSocialCaption } from "./postGenerator.js";
import { publishDealToPubler } from "./publerPublisher.js";
import { uploadMediaToPubler } from "./publerMediaUpload.js";
import { shouldGenerateImage } from "./imageDecision.js";
import { generatePosterImage } from "./imageGenerator.js";
import pLimit from "p-limit";

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

export const fetchAndSaveDeals = async (
  categories = config.AMAZON.CATEGORIES
) => {
  logger.info("🚀 --- DEAL FETCHING PIPELINE STARTED ---");
  let totalDealsProcessed = 0;
  let totalDealsSaved = 0;

  const CONCURRENCY_LIMIT = config.AMAZON.PAAPI_CONCURRENCY || 2;
  const limit = pLimit(CONCURRENCY_LIMIT);

  const throttledTasks = categories.map((category) =>
    limit(async () => {
      try {
        logger.info(`📦 Fetching deals for category: ${category}`);

        const rawProducts = await fetchDealsByCategory(
          category,
          config.AMAZON.ITEM_COUNT
        );

        totalDealsProcessed += rawProducts.length;

        const cleanedDeals = processRawDeals(rawProducts, category);
        if (cleanedDeals.length === 0) {
          logger.warn(`⚠️ No valid deals found in category: ${category}`);
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

        const savedCount =
          (result.upsertedCount || 0) + (result.modifiedCount || 0);
        logger.info(
          `[${category}] ✅ Bulk Upsert: Saved/Updated ${savedCount} deals.`
        );

        return savedCount;
      } catch (error) {
        logger.error(`❌ Pipeline error for ${category}: ${error.message}`);
        return 0;
      }
    })
  );

  const results = await Promise.all(throttledTasks);

  totalDealsSaved = results.reduce((sum, count) => sum + count, 0);

  logger.info(
    `🏁 --- PIPELINE FINISHED: Processed ${totalDealsProcessed} raw items. Saved/Updated ${totalDealsSaved} deals. ---`
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

export const scheduleSocialPosts = async (dealsToPublish) => {
  logger.info(
    `Starting social media scheduling for ${dealsToPublish.length} deals.`
  );

  let scheduledCount = 0;
  const postIntervalMs =
    (config.PUBLISHING.POST_INTERVAL_MINUTES || 5) * 60 * 1000;
  const baseTime = new Date(Date.now() + postIntervalMs);
  let generationCount = 0;

  for (let i = 0; i < dealsToPublish.length; i++) {
    const deal = dealsToPublish[i];
    const imageUrl = deal.ImageURL;

    if (!imageUrl && !deal.LocalImagePath) {
      logger.warn(
        `Deal ASIN ${deal.ASIN} is missing a product image URL. Skipping.`
      );
      continue;
    }

    let publerMediaId = null;

    try {
      const doGenerate = shouldGenerateImage(deal, generationCount);

      if (doGenerate) {
        logger.info(`Decision: Generate custom image for ASIN ${deal.ASIN}`);
        const localImagePath = await generatePosterImage(deal);

        if (localImagePath) {
          generationCount++;
          publerMediaId = await uploadMediaToPubler(
            null,
            deal.ASIN,
            localImagePath
          );
        } else {
          logger.warn(
            `Image generation failed for ASIN ${deal.ASIN}; falling back to Amazon image.`
          );
          publerMediaId = await uploadMediaToPubler(imageUrl, deal.ASIN);
        }
      } else {
        publerMediaId = await uploadMediaToPubler(imageUrl, deal.ASIN);
      }

      if (config.TEST_MODE && generationCount >= 3) {
        logger.warn(
          "🧪 TEST_MODE: Gemini image generation capped at 3 calls for safety."
        );
        break;
      }
    } catch (uploadError) {
      logger.error(
        `Failed to upload media for ASIN ${deal.ASIN}: ${uploadError.message}`
      );
      continue;
    }

    if (!publerMediaId) {
      logger.warn(
        `Could not retrieve Publer Media ID for ASIN ${deal.ASIN}. Skipping.`
      );
      continue;
    }

    const scheduleTime = new Date(baseTime.getTime() + i * postIntervalMs);
    const caption = generateSocialCaption(deal);

    const publerResponse = await publishDealToPubler(
      deal,
      caption,
      scheduleTime,
      publerMediaId
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
    dealsToProcess = dealsToProcess.slice(4, 7);
  }
  const curatedDeals = curateDealsForPosting(
    dealsToProcess,
    config.PUBLISHING.MAX_POSTS_PER_DAY || 50,
    config.PUBLISHING.MIN_PRICE || 10.0,
    config.PUBLISHING.MAX_POSTS_PER_CATEGORY || 5
  );

  if (curatedDeals.length === 0) {
    logger.warn(
      "Publishing Pipeline stopped: No deals passed curation filters."
    );
    const csvPath = await exportDealsToCsv(dealsToProcess);
    return {
      csvPath: csvPath,
      dealsExported: dealsToProcess.length,
      dealsScheduled: 0,
    };
  }
  if (dealsToProcess.length === 0) {
    logger.warn("Publishing Pipeline stopped: No new deals to process.");
    return { csvPath: null, dealsExported: 0, dealsScheduled: 0 };
  }

  const filePath = await exportDealsToCsv(dealsToProcess);

  const dealsScheduled = await scheduleSocialPosts(curatedDeals);

  logger.info("--- PUBLISHING & EXPORT PIPELINE FINISHED ---");

  return {
    csvPath: filePath,
    dealsExported: dealsToProcess.length,
    dealsScheduled: dealsScheduled,
  };
};

const curateDealsForPosting = (
  allDeals,
  maxPostsPerDay,
  minPrice,
  maxPerCategory
) => {
  logger.info(`Curating ${allDeals.length} deals for posting...`);
  const curatedDeals = [];
  const categoryCount = {};

  for (const deal of allDeals) {
    if (curatedDeals.length >= maxPostsPerDay) {
      break;
    }

    if (deal.Price < minPrice) {
      continue;
    }

    const category = deal.Category || "EverythingElse";
    const currentCategoryCount = categoryCount[category] || 0;

    if (currentCategoryCount < maxPerCategory) {
      curatedDeals.push(deal);
      categoryCount[category] = currentCategoryCount + 1;
    }
  }

  logger.info(
    `Curation complete: ${curatedDeals.length} deals selected for posting.`
  );
  return curatedDeals;
};
