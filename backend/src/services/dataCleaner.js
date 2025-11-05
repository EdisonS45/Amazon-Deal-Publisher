// src/services/dataCleaner.js
import config from "../config/index.js";
import logger from "../config/logger.js";

/**
 * Utilities for extracting numbers/currency and cleaning image URLs.
 */

const extractNumber = (str) => {
  if (str === undefined || str === null) return null;
  try {
    const cleaned = String(str).replace(/[^\d.]/g, "");
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  } catch (e) {
    return null;
  }
};

const extractCurrency = (str) =>
  String(str || "").match(/[₹$€£]/)?.[0] || (config.AMAZON?.CURRENCY || "₹");

/**
 * Conservative image URL cleanup to prefer higher resolution images.
 */
const normalizeImageUrl = (url) => {
  if (!url) return null;
  try {
    // Remove common size tokens but leave URL valid. e.g. remove "._SL500_"
    let cleaned = String(url).replace(/(\._SL\d+_|_SL\d+_|\._SX\d+_|_SX\d+_)/gi, ".");
    cleaned = cleaned.replace(/\.{2,}/g, ".");
    return cleaned;
  } catch (e) {
    return url;
  }
};

const pickHiResImage = (rawProduct) => {
  if (!rawProduct?.Images) return null;

  // Prefer Variants -> Large, then Primary Large -> Medium -> Small
  const variants = rawProduct.Images?.Variants || [];
  if (Array.isArray(variants) && variants.length > 0) {
    for (const v of variants) {
      if (v?.Large?.URL) return normalizeImageUrl(v.Large.URL);
      if (v?.Medium?.URL) return normalizeImageUrl(v.Medium.URL);
    }
  }

  const primaryLarge = rawProduct?.Images?.Primary?.Large?.URL;
  if (primaryLarge) return normalizeImageUrl(primaryLarge);

  const primaryMedium = rawProduct?.Images?.Primary?.Medium?.URL;
  if (primaryMedium) return normalizeImageUrl(primaryMedium);

  const primarySmall = rawProduct?.Images?.Primary?.Small?.URL;
  if (primarySmall) return normalizeImageUrl(primarySmall);

  return null;
};

/**
 * Sales rank extraction (numeric)
 */
const readSalesRank = (rawProduct) => {
  try {
    const browseNodes = rawProduct?.BrowseNodeInfo?.BrowseNodes || [];
    if (Array.isArray(browseNodes) && browseNodes.length > 0) {
      for (const bn of browseNodes) {
        const sv = bn?.SalesRank;
        if (typeof sv === "number") return sv;
        if (typeof sv === "string") {
          const n = parseInt(sv.replace(/[^\d]/g, ""), 10);
          if (!isNaN(n)) return n;
        }
        // Sometimes SalesRank present as object:
        if (sv && typeof sv === "object") {
          const v = sv?.Value || sv?.DisplayValue || sv?.Rank;
          const n = parseInt(String(v || "").replace(/[^\d]/g, ""), 10);
          if (!isNaN(n)) return n;
        }
      }
    }

    const websiteRanks = rawProduct?.BrowseNodeInfo?.WebsiteSalesRank;
    if (Array.isArray(websiteRanks) && websiteRanks.length > 0) {
      const first = websiteRanks[0];
      const n = parseInt(String(first?.Rank || first)?.replace(/[^\d]/g, ""), 10);
      if (!isNaN(n)) return n;
    }

    // fallback to classifications
    const classRank = rawProduct?.ItemInfo?.Classifications?.SalesRank;
    if (classRank) {
      const n = parseInt(String(classRank).replace(/[^\d]/g, ""), 10);
      if (!isNaN(n)) return n;
    }

    return null;
  } catch (e) {
    return null;
  }
};

const cleanAndValidateProduct = (rawProduct, category) => {
  try {
    const asin = rawProduct?.ASIN ? String(rawProduct.ASIN) : null;
    const listing = rawProduct?.Offers?.Listings?.[0] || rawProduct?.Offers?.[0] || {};

    const title = rawProduct?.ItemInfo?.Title?.DisplayValue || rawProduct?.Title;
    if (!title) {
      logger.debug(`Skipping ASIN ${asin}: Missing title.`);
      return null;
    }

    // Price
    const priceObj = listing?.Price || null;
    const priceStr = priceObj?.DisplayAmount ?? priceObj?.Amount ?? null;
    if (!priceStr) {
      logger.debug(`Skipping ASIN ${asin}: Missing price info.`);
      return null;
    }

    const origPriceObj = listing?.SavingBasis || null;
    const origPriceStr = origPriceObj?.DisplayAmount ?? origPriceObj?.Amount ?? null;

    const rawCurrentPrice = extractNumber(priceStr);
    const rawOriginalPrice = extractNumber(origPriceStr) || rawCurrentPrice;

    const currency = extractCurrency(priceStr);

    if (rawCurrentPrice === null) {
      logger.debug(`Skipping ASIN ${asin}: Could not parse a numeric current price from "${priceStr}".`);
      return null;
    }

    const currentPrice = Math.floor(rawCurrentPrice);
    const originalPrice = Math.floor(rawOriginalPrice || currentPrice);

    let discountPercentage = 0;
    let savingsAmount = 0;
    if (originalPrice > currentPrice) {
      discountPercentage = Math.floor(((originalPrice - currentPrice) / originalPrice) * 100);
      savingsAmount = Math.floor(originalPrice - currentPrice);
    }

    // filter by minimum discount or saving percent if configured
    const minDiscount = config.AMAZON?.MIN_SAVING_PERCENT ?? config.MIN_DISCOUNT_PERCENT ?? 10;
    if (minDiscount && discountPercentage < minDiscount) {
      logger.debug(`Skipping ASIN ${asin}: Discount ${discountPercentage}% < configured min ${minDiscount}%.`);
      return null;
    }

    // brand / byline
    const brand =
      rawProduct?.ItemInfo?.ByLineInfo?.Brand?.DisplayValue ||
      rawProduct?.ItemInfo?.ByLineInfo?.Manufacturer ||
      null;

    const isPrimeEligible = !!(
      listing?.DeliveryInfo?.IsPrimeEligible ||
      rawProduct?.Offers?.Listings?.[0]?.DeliveryInfo?.IsPrimeEligible
    );

    const availability =
      listing?.Availability?.Message ||
      rawProduct?.Offers?.Listings?.[0]?.Availability?.Message ||
      rawProduct?.Offers?.Listings?.[0]?.Availability ||
      "Unknown";

    // features array
    const features =
      rawProduct?.ItemInfo?.Features?.DisplayValues ||
      rawProduct?.ItemInfo?.Features ||
      [];

    // sales rank numeric
    const salesRank = readSalesRank(rawProduct);

    // ratings
    const ratingsCount =
      rawProduct?.CustomerReviews?.Count ||
      rawProduct?.ItemInfo?.CustomerReviews?.TotalReviewCount ||
      0;
    const starRating =
      rawProduct?.CustomerReviews?.StarRating ||
      rawProduct?.ItemInfo?.CustomerReviews?.StarRating ||
      0;

    const imageUrl = pickHiResImage(rawProduct);

    return {
      ASIN: asin,
      Title: title,
      ProductURL: rawProduct?.DetailPageURL || null,
      ImageURL: imageUrl,
      ImagesFallbacks: {
        Primary: rawProduct?.Images?.Primary || null,
        Variants: rawProduct?.Images?.Variants || null,
      },

      Price: currentPrice,
      OriginalPrice: originalPrice,
      Currency: currency,

      DiscountPercentage: discountPercentage,
      SavingsAmount: savingsAmount,

      Brand: brand,
      IsPrimeEligible: isPrimeEligible,
      Availability: availability,

      RatingsCount: Number(ratingsCount || 0),
      StarRating: Number(starRating || 0),

      Features: Array.isArray(features) ? features : [features].filter(Boolean),
      SalesRank: salesRank,

      Category: category,
      Marketplace: config.AMAZON?.MARKETPLACE || "unknown",
      LastUpdated: new Date(),
      IsPosted: false,
    };
  } catch (error) {
    logger.error(
      `Fatal error cleaning product data for ASIN ${rawProduct?.ASIN}: ${error?.message}`
    );
    return null;
  }
};

export const processRawDeals = (rawItems, category) => {
  const results = (rawItems || [])
    .map((item) => cleanAndValidateProduct(item, category))
    .filter((item) => item !== null);
  return results;
};
