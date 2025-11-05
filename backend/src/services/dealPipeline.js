// src/services/dealPipeline.js
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

/**
 * Fetch and upsert deals (sequential per-category, careful with PA-API limits)
 */
export const fetchAndSaveDeals = async (
  categories = config.AMAZON?.CATEGORIES
) => {
  logger.info("🚀 --- DEAL FETCHING PIPELINE STARTED ---");
  let totalDealsProcessed = 0;
  let totalDealsSaved = 0;

  const CATEGORY_DELAY_MS = config.AMAZON?.CATEGORY_FETCH_DELAY_MS ?? 1800;
  const MAX_DISABLED_RATIO = config.AMAZON?.MAX_DISABLED_CATEGORY_RATIO ?? 0.6;

  const categoryList = Array.isArray(categories) ? categories : [];
  if (categoryList.length === 0) {
    logger.warn("No categories provided to fetchAndSaveDeals. Exiting early.");
    return { totalDealsProcessed, totalDealsSaved };
  }

  logger.info(
    `Starting sequential fetch for ${categoryList.length} categories (delay ${CATEGORY_DELAY_MS}ms).`
  );

  let disabledCount = 0;
  const perCategoryResults = [];

  for (const category of categoryList) {
    try {
      logger.info(`📦 Fetching deals for category: ${category}`);

      const rawProducts = await fetchDealsByCategory(
        category,
        config.AMAZON?.ITEM_COUNT ?? 10
      );

      const rawLen = Array.isArray(rawProducts) ? rawProducts.length : 0;
      totalDealsProcessed += rawLen;
      logger.info(`🔍 Raw items returned for ${category}: ${rawLen}`);

      if (rawLen === 0) {
        logger.warn(
          `⚠️ No raw items returned for category: ${category}. Skipping processing.`
        );
        perCategoryResults.push(0);
        disabledCount++;
      } else {
        const cleanedDeals = processRawDeals(rawProducts, category) || [];

        if (cleanedDeals.length === 0) {
          logger.warn(`⚠️ No valid deals found in category: ${category}`);
          perCategoryResults.push(0);
        } else {
          // Build bulk ops using $set (safer)
          const bulkOperations = cleanedDeals.map((deal) => ({
            updateOne: {
              filter: { ASIN: deal.ASIN },
              update: { $set: deal },
              upsert: true,
            },
          }));

          try {
            const result = await Product.bulkWrite(bulkOperations, {
              ordered: false,
            });

            // Different mongoose versions report different fields; defensively compute success
            const upserted = result?.upsertedCount ?? result?.nUpserted ?? 0;
            const modified = result?.modifiedCount ?? result?.nModified ?? 0;
            const savedCount = upserted + modified;
            logger.info(
              `[${category}] ✅ Bulk Upsert: Saved/Updated ${savedCount} deals.`
            );
            perCategoryResults.push(savedCount);
          } catch (bulkErr) {
            logger.error(
              `[${category}] Bulk upsert failed: ${
                bulkErr?.message || bulkErr
              }. Attempting per-item upsert fallback.`
            );
            // fallback: upsert one-by-one
            let fallbackSaved = 0;
            for (const deal of cleanedDeals) {
              try {
                await Product.updateOne(
                  { ASIN: deal.ASIN },
                  { $set: deal },
                  { upsert: true }
                );
                fallbackSaved += 1;
              } catch (singleErr) {
                logger.debug(
                  `Failed to upsert ASIN ${deal.ASIN}: ${
                    singleErr?.message || singleErr
                  }`
                );
              }
              // tiny delay so DB is not hammered
              await sleep(15);
            }
            logger.info(
              `[${category}] Fallback upsert saved ${fallbackSaved} items.`
            );
            perCategoryResults.push(fallbackSaved);
          }
        }
      }
    } catch (error) {
      logger.error(
        `❌ Pipeline error for ${category}: ${error?.message || error}`
      );
      perCategoryResults.push(0);
    }

    totalDealsSaved = perCategoryResults.reduce(
      (sum, v) => sum + (Number(v) || 0),
      0
    );

    // early abort if many categories disabled
    if (disabledCount / Math.max(1, categoryList.length) >= MAX_DISABLED_RATIO) {
      logger.error(
        `Aborting fetch: ${disabledCount} of ${categoryList.length} categories returned no items (ratio >= ${MAX_DISABLED_RATIO}).`
      );
      break;
    }

    const jitter = Math.floor(Math.random() * 300);
    await sleep(CATEGORY_DELAY_MS + jitter);
  } // end categories loop

  totalDealsSaved = perCategoryResults.reduce(
    (sum, v) => sum + (Number(v) || 0),
    0
  );

  logger.info(
    `🏁 --- PIPELINE FINISHED: Processed ${totalDealsProcessed} raw items. Saved/Updated ${totalDealsSaved} deals. ---`
  );

  return { totalDealsProcessed, totalDealsSaved };
};

/**
 * Read up to `limit` unposted deals ready for publishing
 */
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
    logger.error(`DB Error during deal retrieval: ${error?.message || error}`);
    return [];
  }
};

/**
 * Grouping & scheduling helpers
 */

const makePriceBand = (price) => {
  if (!price && price !== 0) return "0-499";
  if (price < 500) return "0-499";
  if (price < 2000) return "500-1999";
  if (price < 5000) return "2000-4999";
  return "5000+";
};

export const createGroupsFromDeals = (deals, maxGroups = 50, groupSize = 4) => {
  const buckets = {};
  for (const d of deals || []) {
    const cat = d.Category || "Misc";
    const band = makePriceBand(d.Price || 0);
    const key = `${cat}::${band}`;
    buckets[key] = buckets[key] || [];
    buckets[key].push(d);
  }

  const groups = [];
  for (const [key, items] of Object.entries(buckets)) {
    items.sort((a, b) => {
      const scoreA =
        (a.DiscountPercentage || 0) * 3 -
        (a.SalesRank || 1e8) / 1000 +
        (a.StarRating || 0) * 2;
      const scoreB =
        (b.DiscountPercentage || 0) * 3 -
        (b.SalesRank || 1e8) / 1000 +
        (b.StarRating || 0) * 2;
      return scoreB - scoreA;
    });

    for (let i = 0; i < items.length; i += groupSize) {
      const chunk = items.slice(i, i + groupSize);
      if (chunk.length === 0) continue;

      const maxPrice = Math.max(...chunk.map((x) => x.Price || 0));
      const category = chunk[0].Category || "Deals";
      const title = `Top ${chunk.length} ${category} Deals under ${maxPrice}${chunk[0].Currency ? ` ${chunk[0].Currency}` : ""}`;
      const score = chunk.reduce((s, x) => s + ((x.DiscountPercentage || 0) * (x.Price || 0)), 0);
      groups.push({
        id: `group_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        title,
        items: chunk,
        category,
        score,
        createdAt: new Date(),
      });
    }
  }

  groups.sort((a, b) => b.score - a.score);
  return groups.slice(0, maxGroups);
};

/**
 * Build a caption for a group that includes links for every product.
 * If generateSocialCaption supports group objects it will be used; otherwise this helper returns a robust fallback.
 */
const buildCaptionForGroup = (group) => {
  try {
    // Try user-provided generator first (in case you've implemented group support)
    const gen = generateSocialCaption(group);
    if (typeof gen === "string" && gen.trim().length > 0) return gen;
  } catch (e) {
    // fall through to fallback builder
  }

  // Fallback: human-readable enumerated caption listing all items + combined Shop list
  const header = `🔥 ${group.title.toUpperCase()} 🔥\n\n`;
  const itemsText = group.items
    .map((it, idx) => {
      const price = it.Currency ? `${it.Currency}${it.Price}` : `${it.Price}`;
      return `${idx + 1}. ${it.Title} — ${it.DiscountPercentage || 0}% off — ${price}`;
    })
    .join("\n");

  // Include all product links so users can click any of the 4
  const allLinks = group.items
    .map((it) => `${it.ProductURL || ""}`)
    .filter(Boolean)
    .join("\n");

  const tags = `\n\n#AmazonDeals #TopPicks #${(group.category || "Deals").replace(/\s+/g, "")}`;

  const shopBlock = `\n\nShop links:\n${allLinks}`;

  return `${header}${itemsText}${shopBlock}${tags}`;
};

/**
 * scheduleSocialPosts now accepts an array of groups (each group can contain N items).
 */
export const scheduleSocialPosts = async (groupsToPublish) => {
  logger.info(`Starting social media scheduling for ${groupsToPublish.length} groups.`);

  let scheduledCount = 0;
  const postIntervalMs = (config.PUBLISHING?.POST_INTERVAL_MINUTES || 5) * 60 * 1000;
  const baseTime = new Date(Date.now() + postIntervalMs);
  let generationCount = 0;

  // Respect daily Gemini generation cap (env var or config)
  const GEMINI_DAILY_CAP = config.GEMINI?.DAILY_IMAGE_CAP ?? config.GEMINI?.MAX_GENERATIONS_PER_RUN ?? 10;

  for (let i = 0; i < groupsToPublish.length; i++) {
    const group = groupsToPublish[i];
    if (!group || !Array.isArray(group.items) || group.items.length === 0) {
      logger.warn(`Empty group at index ${i}, skipping.`);
      continue;
    }

    const repImageUrl = group.items.find((it) => it.ImageURL)?.ImageURL || group.items[0].LocalImagePath || null;
    if (!repImageUrl && !group.items.some((it) => it.LocalImagePath)) {
      logger.warn(`Group ${group.id} has no image available. Skipping group.`);
      continue;
    }

    let publerMediaId = null;
    try {
      const doGenerate = shouldGenerateImage(group, generationCount);
      if (doGenerate && generationCount < GEMINI_DAILY_CAP) {
        logger.info(`Decision: Generate custom image for group ${group.id}`);
        const localImagePath = await generatePosterImage(group);
        if (localImagePath) {
          generationCount++;
          publerMediaId = await uploadMediaToPubler(null, group.id, localImagePath);
        } else {
          logger.warn(`Image generation failed for group ${group.id}; falling back to Amazon images.`);
          publerMediaId = await uploadMediaToPubler(repImageUrl, group.id);
        }
      } else {
        // generate disabled or cap reached -> upload rep image
        publerMediaId = await uploadMediaToPubler(repImageUrl, group.id);
      }

      if (config.TEST_MODE && generationCount >= 3) {
        logger.warn("🧪 TEST_MODE: Gemini image generation capped at 3 calls for safety.");
      }
    } catch (uploadError) {
      logger.error(`Failed to upload media for group ${group.id}: ${uploadError?.message || uploadError}`);
      continue;
    }

    if (!publerMediaId) {
      logger.warn(`Could not retrieve Publer Media ID for group ${group.id}. Skipping.`);
      continue;
    }

    const scheduleTime = new Date(baseTime.getTime() + i * postIntervalMs);

    const caption = buildCaptionForGroup(group);

    // publish group post
    let publerResponse = null;
    try {
      publerResponse = await publishDealToPubler(group, caption, scheduleTime, publerMediaId);
    } catch (err) {
      logger.error(`Failed to publish group ${group.id} to Publer: ${err?.message || err}`);
      publerResponse = null;
    }

    if (publerResponse) {
      scheduledCount++;

      // determine stored job id from response (defensive)
      const publerJobId =
        (publerResponse && (publerResponse.job_id || publerResponse.id || (publerResponse.data && publerResponse.data.job_id))) ||
        null;

      // mark each item in group as posted
      try {
        const bulkUpdates = group.items.map((it) => ({
          updateOne: {
            filter: { ASIN: it.ASIN },
            update: {
              $set: {
                IsPosted: true,
                PostScheduleTime: scheduleTime,
                PublerJobID: publerJobId,
                TimesPosted: (it.TimesPosted || 0) + 1,
                LastPostedAt: scheduleTime,
              },
            },
          },
        }));
        if (bulkUpdates.length > 0) {
          await Product.bulkWrite(bulkUpdates, { ordered: false });
        }
      } catch (dbErr) {
        logger.warn(
          `Failed to update DB posting state for group ${group.id}: ${dbErr?.message || dbErr}`
        );
      }

      logger.info(
        `Group scheduled and deals marked as posted: ${group.id}. Scheduled for: ${scheduleTime.toLocaleString()}`
      );
    } else {
      logger.warn(`Failed to schedule group ${group.id}. Skipping DB update.`);
    }
  }

  logger.info(`Social Media Scheduling Complete. Total groups scheduled: ${scheduledCount}.`);
  return scheduledCount;
};

/**
 * runPublishingPipeline:
 *  - fetch up to X unposted deals
 *  - create groups
 *  - export csv
 *  - schedule social posts
 */
export const runPublishingPipeline = async () => {
  logger.info("--- PUBLISHING & EXPORT PIPELINE STARTED ---");

  let dealsToProcess = await getDealsForExport(400);

  if (config.TEST_MODE) {
    logger.info("🧪 Running in TEST MODE: Only a few posts will be scheduled.");
    dealsToProcess = dealsToProcess.slice(0, 10);
  }

  if (!dealsToProcess || dealsToProcess.length === 0) {
    logger.warn("Publishing Pipeline stopped: No new deals to process.");
    return { csvPath: null, dealsExported: 0, dealsScheduled: 0 };
  }

  const maxPostsPerDay = config.PUBLISHING?.MAX_POSTS_PER_DAY || 50;
  const groupSize = config.PUBLISHING?.GROUP_SIZE || 4;
  const maxGroups = Math.min(maxPostsPerDay, Math.ceil(dealsToProcess.length / Math.max(1, groupSize)));

  const candidateGroups = createGroupsFromDeals(dealsToProcess, maxGroups, groupSize);

  const maxPerCategory = config.PUBLISHING?.MAX_POSTS_PER_CATEGORY || 5;
  const curated = [];
  const catCount = {};
  for (const g of candidateGroups) {
    if (curated.length >= maxPostsPerDay) break;
    const cat = g.category || "EverythingElse";
    const current = catCount[cat] || 0;
    if (current < maxPerCategory) {
      curated.push(g);
      catCount[cat] = current + 1;
    }
  }

  if (curated.length === 0) {
    logger.warn("Publishing Pipeline stopped: No groups passed curation filters.");
    const csvPath = await exportDealsToCsv(dealsToProcess);
    return { csvPath, dealsExported: dealsToProcess.length, dealsScheduled: 0 };
  }

  const filePath = await exportDealsToCsv(dealsToProcess);

  const groupsScheduled = await scheduleSocialPosts(curated);

  logger.info("--- PUBLISHING & EXPORT PIPELINE FINISHED ---");

  return {
    csvPath: filePath,
    dealsExported: dealsToProcess.length,
    dealsScheduled: groupsScheduled,
  };
};
