import { fetchDealsByCategory } from './amazonScraper.js';
import { processRawDeals } from './dataCleaner.js'; 
import Product from '../models/Product.js'; 
import logger from '../config/logger.js';
import config from '../config/index.js'; 

const fetchAndSaveDeals = async (categories = config.AMAZON.CATEGORIES) => {
    logger.info('--- DEAL FETCHING PIPELINE STARTED ---');
    let totalDealsProcessed = 0;
    let totalDealsSaved = 0;
    
    const fetchPromises = categories.map(async (category) => {
        try {
            // 1. Fetch Raw Data (Handles Retries internally)
            const rawProducts = await fetchDealsByCategory(category, config.AMAZON.ITEM_COUNT);
            totalDealsProcessed += rawProducts.length;

            // 2. Clean, Normalize, and Filter Deals
            const cleanedDeals = processRawDeals(rawProducts, category);
            
            if (cleanedDeals.length === 0) {
                logger.warn(`No valid deals found in category: ${category}`);
                return 0; 
            }

            // 3. Upsert into Database using Bulk Write (Major Optimization)
            const bulkOperations = cleanedDeals.map(deal => ({
                updateOne: {
                    filter: { ASIN: deal.ASIN },
                    update: deal,
                    upsert: true,
                }
            }));

            const result = await Product.bulkWrite(bulkOperations, { ordered: false });
            
            const savedCount = result.upsertedCount + result.modifiedCount;
            logger.info(`[${category}] Bulk Upsert: Saved ${savedCount} new/updated deals.`);
            
            return savedCount;
            
        } catch (error) {
            logger.error(`FATAL Pipeline error for category ${category}: ${error.message}`);
            return 0;
        }
    });

    const results = await Promise.all(fetchPromises);
    
    totalDealsSaved = results.reduce((sum, count) => sum + count, 0);

    logger.info(`--- PIPELINE FINISHED: Processed ${totalDealsProcessed} raw items. Saved/Updated ${totalDealsSaved} deals. ---`);
    return { totalDealsProcessed, totalDealsSaved };
};

export { fetchAndSaveDeals };