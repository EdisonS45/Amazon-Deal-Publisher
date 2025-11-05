// src/services/amazonScraper.js
import amazonPaapi from "amazon-paapi";
import config from "../config/index.js";
import logger from "../config/logger.js";
import { getFromCache, setToCache } from "./redisClient.js";

/**
 * Robust, production-ready PA-API SearchItems wrapper
 *
 * Behavior & decisions:
 * - Two-phase: probe (ItemCount=1, safe resources) then full fetch if probe succeeds.
 * - Deterministic keyword rotation using config.AMAZON.KEYWORDS_ROTATION_MAP (day-index),
 *   falling back to KEYWORDS_OVERRIDE and built-in derived keywords.
 * - If available, uses config.AMAZON.BROWSE_NODE_OVERRIDES[category] to include BrowseNodeId
 *   in the probe/full calls (prefer subcategory when provided).
 * - Rate limiting: respects config.AMAZON.PAAPI_RPS, adds jitter.
 * - ItemPage randomization (config.AMAZON.RANDOMIZE_ITEM_PAGE) to reduce stale repeated results.
 * - Safe-resource fallback: if full fetch fails due to resources, retry with DEFAULT_SAFE_RESOURCES.
 * - Probe results are stored in a probe cache key to reuse recent successful probes.
 */

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

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

// rate-limit / RPS handling
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
  // Split CamelCase and underscores, keep alphanumerics, limit length
  const spaced = category.replace(/([A-Z])/g, " $1").replace(/_/g, " ").trim();
  let cleaned = spaced.replace(/\s+/g, " ").toLowerCase();
  cleaned = cleaned.replace(/[^\w\s\-]/g, "");
  if (cleaned.length > 60) cleaned = cleaned.slice(0, 60).trim();
  return cleaned || "deals";
};

// Built-in fallback single-word suggestions (kept as safety net)
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

  // 1) Daily-rotated set (KEYWORDS_ROTATION_MAP): choose today's keyword deterministically
  const rotationMap = config.AMAZON?.KEYWORDS_ROTATION_MAP || {};
  const rotationList = Array.isArray(rotationMap[category])
    ? rotationMap[category].map((k) => String(k).trim()).filter(Boolean)
    : [];

  if (rotationList.length > 0) {
    // deterministic index by day (UTC), stable across runs
    const daysSinceEpoch = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
    const rotIndex = daysSinceEpoch % rotationList.length;
    // Push chosen rotation keyword first (highest priority)
    candidates.push(rotationList[rotIndex]);
    // also queue the remaining rotation keywords (so if the chosen one fails we can try others)
    rotationList.forEach((k, idx) => {
      if (idx !== rotIndex) candidates.push(k);
    });
  }

  // 2) KEYWORDS_OVERRIDE (explicit single override per category) - keep high priority if present
  const overrideConfig = config.AMAZON?.KEYWORDS_OVERRIDE || {};
  if (overrideConfig[category]) {
    const s = String(overrideConfig[category]).replace(/[^\x20-\x7E]/g, "");
    const safe = s.replace(/[^\w\s\-]/g, "").slice(0, 80).trim();
    if (safe && !candidates.includes(safe)) candidates.unshift(safe);
  }

  // 3) Built-in safe fallback
  if (BUILTIN_OVERRIDES[category] && !candidates.includes(BUILTIN_OVERRIDES[category])) {
    candidates.push(BUILTIN_OVERRIDES[category]);
  }

  // 4) Derived keywords from category name
  const derived = sanitizeCategoryToKeyword(category);
  if (derived) {
    if (!candidates.includes(derived)) candidates.push(derived);
    if (!candidates.includes(`${derived} deals`)) candidates.push(`${derived} deals`);
    if (!candidates.includes(`${derived} bestsellers`)) candidates.push(`${derived} bestsellers`);
  }

  // 5) Finally a generic fallback
  if (!candidates.includes("deals")) candidates.push("deals");

  // Sanitize and dedupe
  const sanitized = candidates
    .map((s) => (s ? String(s).replace(/[^\w\s\-\']/g, "").trim() : null))
    .filter(Boolean);

  return [...new Set(sanitized)];
};

const isRetryable429 = (err) => {
  if (!err) return false;
  const code = err?.statusCode || err?.response?.status;
  if (code === 429) return true;
  const msg = String(err?.message || "").toLowerCase();
  if (/429|too many requests|rate limit/i.test(msg)) return true;
  // some PA-API libs embed status in response.data
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
  // randomize ItemPage 1..3 for probe if configured (helps variety) - but keep probe small
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
  // Optionally randomize ItemPage to avoid always getting page 1 results
  if (config.AMAZON?.RANDOMIZE_ITEM_PAGE) {
    const maxPage = 3; // keep within PA-API allowed small range
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

  // Prepare keyword candidates (rotation + overrides + derived)
  const candidates = buildKeywordCandidates(category);
  if (candidates.length === 0) candidates.push(sanitizeCategoryToKeyword(category));

  // Prefer BrowseNodeId if provided in config overrides
  const browseOverrides = config.AMAZON?.BROWSE_NODE_OVERRIDES || {};
  const browseNodeId = browseOverrides && browseOverrides[category] ? browseOverrides[category] : null;

  // Probe cache key: remember last working probe (keyword + browseNode) to speed subsequent runs
  const probeCacheKey = `paapi:probe:${category}:${config.AMAZON.MARKETPLACE}`;
  try {
    const lastProbe = await getFromCache(probeCacheKey);
    if (lastProbe && lastProbe.Keywords && lastProbe.SearchIndex) {
      // Put the known good probe first (it may be same as today's rotation)
      if (!candidates.includes(lastProbe.Keywords)) {
        candidates.unshift(lastProbe.Keywords);
      } else {
        // move it to front
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

  // Try each candidate keyword (and possibly BrowseNodeId) until one yields results
  for (let cIndex = 0; cIndex < candidates.length; cIndex++) {
    const keyword = candidates[cIndex];
    // If browseNodeId provided, try it first combined with the keyword; if it fails, try without browseNodeId
    const probeVariants = browseNodeId ? [ { keyword, browseNodeId }, { keyword, browseNodeId: null } ] : [ { keyword, browseNodeId: null } ];

    for (const variant of probeVariants) {
      const probeParams = buildProbeParams(category, variant.keyword, variant.browseNodeId);

      // Per-candidate retry loop (probe attempts)
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          await ensureRateLimit();

          logger.info(
            `Fetching deals for category: ${category} (probe attempt ${attempt}) - ProbeKeywords=${probeParams.Keywords} ItemCount=${probeParams.ItemCount}` +
              (variant.browseNodeId ? ` BrowseNode=${variant.browseNodeId}` : "")
          );

          // Probe call
          const probeResp = await amazonPaapi.SearchItems(commonParameters, probeParams);

          // If PA-API returned an Errors array inside success, treat it
          if (probeResp?.Errors && probeResp.Errors.length > 0) {
            logger.error(`PA-API probe returned Errors for ${category}: ${JSON.stringify(probeResp.Errors)}`);
            const isRate = probeResp.Errors.some((e) => /RateLimit|Too Many Requests|429/i.test(JSON.stringify(e)));
            if (isRate && attempt < retries) {
              const wait = 1000 * Math.min(30, 2 ** attempt) + Math.floor(Math.random() * 1000);
              logger.warn(`PA-API indicated rate-limit in probe body; backing off ${wait}ms before retry`);
              await sleep(wait);
              continue;
            } else {
              // probe returned an error — stop attempts for this variant
              break;
            }
          }

          const probeItems = probeResp?.SearchResult?.Items || [];
          if (!Array.isArray(probeItems) || probeItems.length === 0) {
            logger.warn(`Probe returned no items for keyword "${keyword}" (browseNode ${variant.browseNodeId}). Trying next candidate/variant.`);
            break; // break out of attempts for this variant and try next variant
          }

          // Probe success -> cache probe metadata for reuse
          try {
            await setToCache(probeCacheKey, { Keywords: keyword, SearchIndex: category, BrowseNodeId: variant.browseNodeId || null }, config.CACHE_TTL_SECONDS || 6 * 60 * 60);
          } catch (cacheErr) {
            logger.debug("Failed to set probe cache (non-fatal): " + (cacheErr?.message || cacheErr));
          }

          logger.info(`Probe success for category=${category} keyword="${keyword}". Proceeding to full fetch.`);

          // Build full fetch params from probe
          const fullParams = buildFullParams(probeParams, itemCount, variant.browseNodeId);

          // small polite delay
          await sleep(200 + Math.floor(Math.random() * 300));

          await ensureRateLimit();
          logger.info(`Running full fetch for ${category} - ItemCount=${fullParams.ItemCount} Resources=${fullParams.Resources.length}`);

          const fullResp = await amazonPaapi.SearchItems(commonParameters, fullParams);

          if (fullResp?.Errors && fullResp.Errors.length > 0) {
            logger.error(`PA-API full fetch returned Errors for ${category}: ${JSON.stringify(fullResp.Errors)}`);
            // Try fallback with safer resources exactly once
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
            // not recoverable for this variant -> break and try next
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
          // Enhanced error logging to help debugging
          try {
            const status = error?.statusCode || error?.response?.status || "unknown";
            logger.error(`PA-API Error for ${category} (attempt ${attempt}) - status: ${status} - message: ${error?.message || error}`);

            // Log a sanitized probe request for replay debugging
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

          // Rate limiting (429) with exponential backoff
          if (isRetryable429(error) && attempt < retries) {
            const backoff = Math.min(5000 * attempt, 30000) + Math.floor(Math.random() * 1000);
            logger.warn(`Rate limit or 429 detected. Waiting ${Math.round(backoff / 1000)}s before retry...`);
            await sleep(backoff);
            continue;
          }

          // Network transient errors: retry
          if (/ECONNRESET|ETIMEDOUT|ENOTFOUND|ECONNREFUSED|EAI_AGAIN/i.test(String(error?.message || "")) && attempt < retries) {
            const wait = 1000 * attempt + Math.floor(Math.random() * 1000);
            logger.warn(`Transient network error detected. Waiting ${wait}ms before next attempt.`);
            await sleep(wait);
            continue;
          }

          // Otherwise break out of attempts for this variant and try next candidate/variant
          break;
        }
      } // end attempts for variant
    } // end variants loop (browseNode first then keyword-only)
  } // end candidates loop

  logger.error(`Failed to fetch deals for ${category} after trying all keywords/candidates. Returning empty list.`);
  return [];
};

export default fetchDealsByCategory;
