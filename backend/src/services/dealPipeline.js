import { fetchDealsByCategory } from "./amazonScraper.js";
import { processRawDeals } from "./dataCleaner.js";
import Product from "../models/Product.js";
import logger from "../config/logger.js";
import config from "../config/index.js";
import pLimit from "p-limit";

export const fetchAndSaveDeals = async (
  categories = config.AMAZON.CATEGORIES
) => {
  logger.info("🚀 --- (PHASE 1) DEAL FETCHING PIPELINE STARTED ---");
  let totalDealsProcessed = 0;
  let totalDealsSaved = 0;

  const CONCURRENCY_LIMIT = config.AMAZON.PAAPI_CONCURRENCY || 2;
  const limit = pLimit(CONCURRENCY_LIMIT);

  try {
    const res = await Product.deleteMany({ status: "PENDING_ENRICHMENT" });
    logger.info(`Cleaned up ${res.deletedCount} old pending products.`);
  } catch (err) {
    logger.warn(`Failed to clean up old pending products: ${err.message}`);
  }

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
            update: { $set: deal },
            upsert: true,
          },
        }));

        const result = await Product.bulkWrite(bulkOperations, {
          ordered: false,
        });

        const savedCount = result.upsertedCount || 0;
        const updatedCount = result.modifiedCount || 0;
        logger.info(
          `[${category}] ✅ Bulk Write: Inserted ${savedCount} new deals, Updated ${updatedCount} existing deals.`
        );
        return savedCount + updatedCount;
      } catch (error) {
        logger.error(`❌ Pipeline error for ${category}: ${error.message}`);
        return 0;
      }
    })
  );

  const results = await Promise.all(throttledTasks);
  totalDealsSaved = results.reduce((sum, count) => sum + count, 0);

  logger.info(
    `🏁 --- (PHASE 1) PIPELINE FINISHED: Processed ${totalDealsProcessed} raw items. Inserted ${totalDealsSaved} new deals. ---`
  );

  return { totalDealsProcessed, totalDealsSaved };
};
