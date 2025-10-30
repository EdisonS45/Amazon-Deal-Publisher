import amazonPaapi from 'amazon-paapi';
import config from '../config/index.js';
import logger from '../config/logger.js';
import { getFromCache, setToCache } from './redisClient.js';

const commonParameters = {
    AccessKey: config.AMAZON.ACCESS_KEY,
    SecretKey: config.AMAZON.SECRET_KEY,
    PartnerTag: config.AMAZON.PARTNER_TAG,
    Marketplace: config.AMAZON.MARKETPLACE,
    PartnerType: 'Associates',
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));


export const fetchDealsByCategory = async (category, itemCount = 10, retries = 3) => {
    if (!category) throw new Error('Category is required for fetching deals.');
    if (itemCount < 1 || itemCount > 10) itemCount = 10;
    const cacheKey = `paapi:${category}:${itemCount}:${config.AMAZON.MARKETPLACE}`;
    const cachedItems = await getFromCache(cacheKey);
    if (cachedItems) {
        logger.info(`Serving ${category} from cache. Skipping PA-API call.`);
        return cachedItems;
    }
    const requestParameters = {
        SearchIndex: category,
        ItemCount: itemCount,
        Resources: config.AMAZON.RESOURCES,
        SortBy: config.AMAZON.SORT_BY || 'Featured', 
    };

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            logger.info(`Fetching deals for category: ${category} (attempt ${attempt}) - PA-API call`);
            const response = await amazonPaapi.SearchItems(commonParameters, requestParameters);
            const items = response?.SearchResult?.Items || [];
            
            logger.info(`Successfully fetched ${items.length} raw items for ${category}.`);

            await setToCache(cacheKey, items,24 * 60 * 60);

            return items; 
        } catch (error) {
            
            logger.error(`PA-API Error for ${category} (attempt ${attempt}): ${error.message}`);
            if (error.statusCode === 429 && attempt < retries) {
                const waitTime = 2000 * attempt;
                logger.warn(`Rate limit hit, waiting ${waitTime / 1000}s before retry...`);
                await sleep(waitTime);
                continue; 
            }
            break; 
        }
    }

    logger.error(`Failed to fetch deals for ${category} after ${retries} attempts.`);
    return [];
};