import amazonPaapi from "amazon-paapi";
import config from "../config/index.js";
import logger from "../config/logger.js";
import { getFromCache, setToCache } from "./redisClient.js";


const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
export const getRotatingKeyword = (category) => {
  const rotation = config.AMAZON.KEYWORD_ROTATION || {};
  const list = Array.isArray(rotation[category]) ? rotation[category] : [];
  if (list.length === 0) return null;

  const dayIndex = new Date().getDate() % list.length;
  const keyword = list[dayIndex];
  logger.info(`🔁 Using rotating keyword "${keyword}" for ${category} (index ${dayIndex})`);
  return keyword;
};

const DEFAULT_SAFE_RESOURCES = [
  "ItemInfo.Title",
  "Images.Primary.Large",
  "Offers.Listings.Price",
  "Offers.Listings.SavingBasis",
];

const commonParameters = {
  AccessKey: config.AMAZON.ACCESS_KEY,
  SecretKey: config.AMAZON.SECRET_KEY,
  PartnerTag: config.AMAZON.PARTNER_TAG,
  Marketplace: config.AMAZON.MARKETPLACE,
  PartnerType: "Associates",
};

const RPS = config.AMAZON?.PAAPI_RPS || 1;
const MIN_INTERVAL_MS = Math.ceil(1000 / Math.max(1, RPS));
let lastRequestTs = 0;
const ensureRateLimit = async () => {
  const now = Date.now();
  const since = now - lastRequestTs;
  if (since < MIN_INTERVAL_MS) {
    const wait = MIN_INTERVAL_MS - since + Math.floor(Math.random() * 100); // small jitter
    await sleep(wait);
  }
  lastRequestTs = Date.now();
};

const DEFAULT_RETRIES = config.AMAZON?.PAAPI_MAX_RETRIES || 5;

const sanitizeCategoryToKeyword = (category) => {
  if (!category) return "deals";
  const spaced = category.replace(/([A-Z])/g, " $1").replace(/_/g, " ").trim();
  let cleaned = spaced.replace(/\s+/g, " ").toLowerCase();
  cleaned = cleaned.replace(/[^\w\s\-]/g, "");
  if (cleaned.length > 60) cleaned = cleaned.slice(0, 60).trim();
  return cleaned || "deals";
};

const BUILTIN_OVERRIDES = {
  Electronics: "wireless earbuds",
  Fashion: "mens t-shirt",
  Beauty: "face serum",
  HomeAndKitchen: "non-stick cookware",
  ToysAndGames: "lego set",
  Computers: "laptop",
  Books: "bestselling fiction",
};

const buildKeywordCandidates = (category) => {
  const candidates = [];
  const rotating = getRotatingKeyword(category);
  if (rotating) candidates.push(rotating);

  const override = config.AMAZON?.KEYWORDS_OVERRIDE?.[category];
  if (override && !candidates.includes(override)) candidates.push(override);

  const builtin = BUILTIN_OVERRIDES[category];
  if (builtin && !candidates.includes(builtin)) candidates.push(builtin);

  const derived = sanitizeCategoryToKeyword(category);
  if (derived && !candidates.includes(derived)) {
    candidates.push(derived);
    candidates.push(`${derived} deals`);
    candidates.push(`${derived} bestsellers`);
  }

  if (!candidates.includes("deals")) candidates.push("deals");

  return [...new Set(candidates)];
};


const isRetryable429 = (err) => {
  if (!err) return false;
  const code = err?.statusCode || err?.response?.status;
  if (code === 429) return true;
  const msg = String(err?.message || "").toLowerCase();
  if (/429|too many requests|rate limit/i.test(msg)) return true;
  const bodyMsg = String(err?.response?.data || "").toLowerCase();
  if (/too many requests|rate limit|throttl/i.test(bodyMsg)) return true;
  return false;
};

const buildProbeParams = (category, keyword, browseNodeId = null) => {
  const p = {
    SearchIndex: category,
    ItemCount: 1,
    ItemPage: 1,
    Resources: DEFAULT_SAFE_RESOURCES,
    Keywords: keyword,
  };
  if (browseNodeId) p.BrowseNodeId = String(browseNodeId);
  if (config.AMAZON?.RANDOMIZE_ITEM_PAGE) {
    p.ItemPage = 1 + Math.floor(Math.random() * 3); // 1..3
  }
  return p;
};

const buildFullParams = (probeVariant, desiredItemCount, browseNodeId = null) => {
  const cfgRes = Array.isArray(config.AMAZON?.RESOURCES) ? config.AMAZON.RESOURCES : [];
  const effectiveResources = cfgRes.length > 0 && cfgRes.length <= 8 ? cfgRes : DEFAULT_SAFE_RESOURCES;

  const full = {
    ...probeVariant,
    ItemCount: Math.min(Math.max(1, desiredItemCount || 1), 10),
    Resources: effectiveResources,
  };
  if (browseNodeId) full.BrowseNodeId = String(browseNodeId);
  if (config.AMAZON?.RANDOMIZE_ITEM_PAGE) {
    const maxPage = 3; 
    full.ItemPage = 1 + Math.floor(Math.random() * maxPage);
  }
  return full;
};

export const fetchDealsByCategory = async (category, itemCount = 10, retries = DEFAULT_RETRIES) => {
  if (!category) throw new Error("Category is required for fetching deals.");
  if (itemCount < 1 || itemCount > 10) itemCount = 10;

  const cacheKey = `paapi:${category}:${itemCount}:${config.AMAZON.MARKETPLACE}`;
  try {
    const cached = await getFromCache(cacheKey);
    if (cached && Array.isArray(cached) && cached.length > 0) {
      logger.info(`Serving ${category} from cache. Skipping PA-API call.`);
      return cached;
    }
  } catch (err) {
    logger.debug("Cache read error (non-fatal): " + (err?.message || err));
  }

  const candidates = buildKeywordCandidates(category);
  if (candidates.length === 0) candidates.push(sanitizeCategoryToKeyword(category));

  const browseOverrides = config.AMAZON?.BROWSE_NODE_OVERRIDES || {};
  const browseNodeId = browseOverrides && browseOverrides[category] ? browseOverrides[category] : null;

  const probeCacheKey = `paapi:probe:${category}:${config.AMAZON.MARKETPLACE}`;
  try {
    const lastProbe = await getFromCache(probeCacheKey);
    if (lastProbe && lastProbe.Keywords && lastProbe.SearchIndex) {
      if (!candidates.includes(lastProbe.Keywords)) {
        candidates.unshift(lastProbe.Keywords);
      } else {
        const idx = candidates.indexOf(lastProbe.Keywords);
        if (idx > 0) {
          candidates.splice(idx, 1);
          candidates.unshift(lastProbe.Keywords);
        }
      }
      logger.info(`Using cached probe keyword for ${category}: ${String(lastProbe.Keywords).slice(0, 80)}`);
    }
  } catch (err) {
    logger.debug("Probe cache read error (non-fatal): " + (err?.message || err));
  }

  for (let cIndex = 0; cIndex < candidates.length; cIndex++) {
    const keyword = candidates[cIndex];
    const probeVariants = browseNodeId ? [ { keyword, browseNodeId }, { keyword, browseNodeId: null } ] : [ { keyword, browseNodeId: null } ];

    for (const variant of probeVariants) {
      const probeParams = buildProbeParams(category, variant.keyword, variant.browseNodeId);

      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          await ensureRateLimit();

          logger.info(
            `Fetching deals for category: ${category} (probe attempt ${attempt}) - ProbeKeywords=${probeParams.Keywords} ItemCount=${probeParams.ItemCount}` +
              (variant.browseNodeId ? ` BrowseNode=${variant.browseNodeId}` : "")
          );

          const probeResp = await amazonPaapi.SearchItems(commonParameters, probeParams);

          if (probeResp?.Errors && probeResp.Errors.length > 0) {
            logger.error(`PA-API probe returned Errors for ${category}: ${JSON.stringify(probeResp.Errors)}`);
            const isRate = probeResp.Errors.some((e) => /RateLimit|Too Many Requests|429/i.test(JSON.stringify(e)));
            if (isRate && attempt < retries) {
              const wait = 1000 * Math.min(30, 2 ** attempt) + Math.floor(Math.random() * 1000);
              logger.warn(`PA-API indicated rate-limit in probe body; backing off ${wait}ms before retry`);
              await sleep(wait);
              continue;
            } else {
              break;
            }
          }

          const probeItems = probeResp?.SearchResult?.Items || [];
          if (!Array.isArray(probeItems) || probeItems.length === 0) {
            logger.warn(`Probe returned no items for keyword "${keyword}" (browseNode ${variant.browseNodeId}). Trying next candidate/variant.`);
            break; 
          }

          try {
            await setToCache(probeCacheKey, { Keywords: keyword, SearchIndex: category, BrowseNodeId: variant.browseNodeId || null }, config.CACHE_TTL_SECONDS || 6 * 60 * 60);
          } catch (cacheErr) {
            logger.debug("Failed to set probe cache (non-fatal): " + (cacheErr?.message || cacheErr));
          }

          logger.info(`Probe success for category=${category} keyword="${keyword}". Proceeding to full fetch.`);

          const fullParams = buildFullParams(probeParams, itemCount, variant.browseNodeId);

          await sleep(200 + Math.floor(Math.random() * 300));

          await ensureRateLimit();
          logger.info(`Running full fetch for ${category} - ItemCount=${fullParams.ItemCount} Resources=${fullParams.Resources.length}`);

          const fullResp = await amazonPaapi.SearchItems(commonParameters, fullParams);

          if (fullResp?.Errors && fullResp.Errors.length > 0) {
            logger.error(`PA-API full fetch returned Errors for ${category}: ${JSON.stringify(fullResp.Errors)}`);
            if (fullParams.Resources !== DEFAULT_SAFE_RESOURCES) {
              logger.warn("Full fetch returned errors — retrying with DEFAULT_SAFE_RESOURCES and smaller item count.");
              const fallbackParams = {
                ...fullParams,
                Resources: DEFAULT_SAFE_RESOURCES,
                ItemCount: Math.min(4, fullParams.ItemCount),
              };
              await sleep(500);
              await ensureRateLimit();
              const fallbackResp = await amazonPaapi.SearchItems(commonParameters, fallbackParams);
              if (fallbackResp?.SearchResult?.Items) {
                try {
                  await setToCache(cacheKey, fallbackResp.SearchResult.Items, config.CACHE_TTL_SECONDS || 6 * 60 * 60);
                } catch (cacheErr) {
                  logger.debug("Failed to set fallback cache (non-fatal): " + (cacheErr?.message || cacheErr));
                }
                logger.info(`Cached ${fallbackResp.SearchResult.Items.length} items for ${category} (fallback resources).`);
                return fallbackResp.SearchResult.Items;
              }
            }
            break;
          }

          const items = fullResp?.SearchResult?.Items || [];
          logger.info(`Successfully fetched ${items.length} raw items for ${category}. Caching result.`);

          try {
            await setToCache(cacheKey, items, config.CACHE_TTL_SECONDS || 6 * 60 * 60);
            logger.debug(`Set cache for key: ${cacheKey} with TTL: ${config.CACHE_TTL_SECONDS || 6 * 60 * 60}s`);
          } catch (cacheErr) {
            logger.debug("Failed to set PA-API cache (non-fatal): " + (cacheErr?.message || cacheErr));
          }

          return items;
        } catch (error) {
          try {
            const status = error?.statusCode || error?.response?.status || "unknown";
            logger.error(`PA-API Error for ${category} (attempt ${attempt}) - status: ${status} - message: ${error?.message || error}`);

            try {
              const debugReq = { ...probeParams };
              if (debugReq.Resources) debugReq.Resources = debugReq.Resources.slice(0, 10);
              logger.debug(`PA-API Probe Request (debug): ${JSON.stringify(debugReq)}`);
            } catch (rqErr) {
              logger.debug("Failed to stringify probe request: " + (rqErr?.message || rqErr));
            }

            if (error?.response?.headers) logger.debug(`PA-API Response Headers: ${JSON.stringify(error.response.headers)}`);
            if (error?.response?.data) {
              try {
                logger.debug(`PA-API Response Body: ${JSON.stringify(error.response.data)}`);
              } catch (bodyErr) {
                logger.debug(`PA-API Response Body (raw): ${String(error.response.data)}`);
              }
            }
          } catch (logErr) {
            logger.error("Error while logging PA-API error: " + (logErr?.message || logErr));
          }

          if (isRetryable429(error) && attempt < retries) {
            const backoff = Math.min(5000 * attempt, 30000) + Math.floor(Math.random() * 1000);
            logger.warn(`Rate limit or 429 detected. Waiting ${Math.round(backoff / 1000)}s before retry...`);
            await sleep(backoff);
            continue;
          }

          if (/ECONNRESET|ETIMEDOUT|ENOTFOUND|ECONNREFUSED|EAI_AGAIN/i.test(String(error?.message || "")) && attempt < retries) {
            const wait = 1000 * attempt + Math.floor(Math.random() * 1000);
            logger.warn(`Transient network error detected. Waiting ${wait}ms before next attempt.`);
            await sleep(wait);
            continue;
          }

          break;
        }
      } 
    } 
  } 

  logger.error(`Failed to fetch deals for ${category} after trying all keywords/candidates. Returning empty list.`);
  return [];
};

export default fetchDealsByCategory;
