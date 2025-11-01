import amazonPaapi from "amazon-paapi";
import config from "../config/index.js";
import logger from "../config/logger.js";
import Product from "../models/Product.js";
import { CATEGORY_TO_NICHE_MAP } from "../config/publishingConfig.js";
import pLimit from "p-limit";

const commonParameters = {
  AccessKey: config.AMAZON.ACCESS_KEY,
  SecretKey: config.AMAZON.SECRET_KEY,
  PartnerTag: config.AMAZON.PARTNER_TAG,
  Marketplace: config.AMAZON.MARKETPLACE,
  PartnerType: "Associates",
};


function getHighResAmazonUrl(lowResUrl) {
  if (!lowResUrl) return null;
  const lowResPattern = /\._SL[0-9]+_\./;
  return lowResUrl.replace(lowResPattern, ".");
}


async function getAmazonItemDetails(asins) {
  const requestParameters = {
    ItemIds: asins,
    Resources: [
      "ItemInfo.Features",
      "Images.Primary.Large",
      "BrowseNodeInfo.BrowseNodes.SalesRank",
      "Offers.Listings.DeliveryInfo.IsPrimeEligible",
    ],
  };

  try {
    const response = await amazonPaapi.GetItems(
      commonParameters,
      requestParameters
    );
    return response.ItemsResult?.Items || [];
  } catch (error) {
    logger.error(`GetItems API Error: ${error.message}`);
    return [];
  }
}


export const runEnrichmentPipeline = async () => {
  logger.info("🚀 --- ENRICHMENT PIPELINE STARTED ---");
  const productsToEnrich = await Product.find({
    status: "PENDING_ENRICHMENT",
  }).limit(500); 
  if (productsToEnrich.length === 0) {
    logger.info("🏁 --- ENRICHMENT FINISHED: No products to enrich. ---");
    return { enrichedCount: 0 };
  }

  logger.info(`Found ${productsToEnrich.length} products to enrich.`);
  
  const asinBatches = [];
  for (let i = 0; i < productsToEnrich.length; i += 10) {
    asinBatches.push(productsToEnrich.slice(i, i + 10).map(p => p.ASIN));
  }

  const limit = pLimit(config.AMAZON.PAAPI_CONCURRENCY || 2);
  let updatedCount = 0;

  for (const asinBatch of asinBatches) {
    await limit(async () => {
      const detailedItems = await getAmazonItemDetails(asinBatch);

      for (const item of detailedItems) {
        try {
          const originalProduct = productsToEnrich.find(p => p.ASIN === item.ASIN);
          if (!originalProduct) continue;

          const niche_id = CATEGORY_TO_NICHE_MAP[originalProduct.Category] || null;

          const features = item.ItemInfo?.Features?.DisplayValues || null;

          const sales_rank = item.BrowseNodeInfo?.BrowseNodes?.[0]?.SalesRank || null;

          const lowResUrl = item.Images?.Primary?.Large?.URL || originalProduct.LowResImageURL;
          const high_res_image_url = getHighResAmazonUrl(lowResUrl);

          await Product.updateOne(
            { ASIN: item.ASIN },
            {
              $set: {
                features: features,
                sales_rank: sales_rank ? parseInt(sales_rank) : null,
                ImageURL: high_res_image_url,
                IsPrimeEligible: item.Offers?.Listings?.[0]?.DeliveryInfo?.IsPrimeEligible || originalProduct.IsPrimeEligible,
                niche_id: niche_id,
                status: 'ENRICHED',
                LastUpdated: new Date()
              }
            }
          );
          updatedCount++;
        } catch (err) {
          logger.error(`Failed to enrich ASIN ${item.ASIN}: ${err.message}`);
        }
      }
    });
  }

  logger.info(`🏁 --- ENRICHMENT FINISHED: Enriched ${updatedCount} products. ---`);
  return { enrichedCount: updatedCount };
};