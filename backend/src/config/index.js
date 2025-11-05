// src/config/index.js
import "dotenv/config";
import path from "path";

const root = process.cwd();

const config = {
  TEST_MODE: process.env.TEST_MODE === "true" || false,
  NODE_ENV: process.env.NODE_ENV || "development",
  TIMEZONE: process.env.TIMEZONE || "Asia/Kolkata",

  MONGO_URI: process.env.MONGO_URI,
  REDIS_URL: process.env.REDIS_URL || "redis://127.0.0.1:6379",

  // general
  CACHE_TTL_SECONDS: process.env.CACHE_TTL_SECONDS
    ? parseInt(process.env.CACHE_TTL_SECONDS, 10)
    : 6 * 60 * 60, // 6 hours
  CRON_SCHEDULE: process.env.CRON_SCHEDULE || "*/1 * * * *",

  // app filesystem / temp
  TEMP_PATH: process.env.TEMP_PATH || path.join(root, "tmp"),
  EXPORT_PATH: process.env.EXPORT_PATH || path.join(root, "exports"),
  POSTER_OUTPUT_PATH:
    process.env.POSTER_OUTPUT_PATH || path.join(root, "posters"),

  // logging / debug
  LOG_LEVEL: process.env.LOG_LEVEL || "info",

  IMAGE_DECISION: {
    DISCOUNT_MIN: parseInt(process.env.IMAGE_DECISION_DISCOUNT_MIN || 40, 10),
    PRICE_MIN: parseInt(process.env.IMAGE_DECISION_PRICE_MIN || 500, 10),
    SCORE_THRESHOLD: parseInt(process.env.IMAGE_DECISION_SCORE_THRESHOLD || 5, 10),
    MAX_GENERATIONS_PER_RUN: parseInt(
      process.env.IMAGE_DECISION_MAX_GENERATIONS_PER_RUN || 5,
      10
    ),
  },

  GEMINI: {
    API_KEY: process.env.GEMINI_API_KEY || "",
    ENDPOINT:
      process.env.GEMINI_ENDPOINT || "https://api.gemini.example/generate",
    MODEL: process.env.GEMINI_MODEL || "gemini-2.5-flash-image",
    // safety quota: how many group posters you are allowed per day via Gemini
    DAILY_GROUP_IMAGE_QUOTA: process.env.GEMINI_DAILY_GROUP_QUOTA
      ? parseInt(process.env.GEMINI_DAILY_GROUP_QUOTA, 10)
      : 10,
  },

  PUBLER: {
    API_KEY: process.env.PUBLER_API_KEY,
    WORKSPACE_ID: process.env.PUBLER_WORKSPACE_ID,
    ACCOUNTS: process.env.PUBLER_ACCOUNTS
      ? process.env.PUBLER_ACCOUNTS.split(",").map((a) => a.trim())
      : ["6778626ce77c42842c59202e", "6901e01d1a1afe47aedde520"],
    DEFAULT_SCHEDULE_ACCOUNT_TIMESLOT:
      process.env.PUBLER_DEFAULT_TIME_SLOT || "08:00", // fallback human-slot when needed
  },

  EMAIL: {
    HOST: process.env.EMAIL_HOST,
    PORT: process.env.EMAIL_PORT,
    SECURE: process.env.EMAIL_SECURE === "true",
    USER: process.env.EMAIL_USER,
    PASS: process.env.EMAIL_PASS,
    TO: process.env.EMAIL_TO,
  },

  PUBLISHING: {
    MAX_POSTS_PER_DAY: parseInt(process.env.PUBLISHING_MAX_POSTS_PER_DAY || 70, 10),
    MIN_PRICE: process.env.PUBLISHING_MIN_PRICE
      ? parseFloat(process.env.PUBLISHING_MIN_PRICE)
      : 100,
    MAX_POSTS_PER_CATEGORY: parseInt(
      process.env.PUBLISHING_MAX_POSTS_PER_CATEGORY || 5,
      10
    ),
    POST_INTERVAL_MINUTES: parseFloat(process.env.PUBLISHING_POST_INTERVAL_MINUTES || 5),
    GROUP_SIZE: parseInt(process.env.PUBLISHING_GROUP_SIZE || 4, 10), // default "Top 4"
    MAX_DAILY_GROUPS_WITH_GEMINI: process.env.MAX_DAILY_GROUPS_WITH_GEMINI
      ? parseInt(process.env.MAX_DAILY_GROUPS_WITH_GEMINI, 10)
      : 10,
  },

  AMAZON: {
    ACCESS_KEY: process.env.AMAZON_ACCESS_KEY,
    SECRET_KEY: process.env.AMAZON_SECRET_KEY,
    PARTNER_TAG: process.env.AMAZON_PARTNER_TAG,
    MARKETPLACE: process.env.AMAZON_MARKETPLACE || "www.amazon.com",

    // concurrency & RPS control
    PAAPI_CONCURRENCY: parseInt(process.env.AMAZON_PAAPI_CONCURRENCY || 1, 10),
    PAAPI_RPS: process.env.AMAZON_PAAPI_RPS ? parseInt(process.env.AMAZON_PAAPI_RPS, 10) : 1,
    PAAPI_MAX_RETRIES: process.env.AMAZON_PAAPI_MAX_RETRIES
      ? parseInt(process.env.AMAZON_PAAPI_MAX_RETRIES, 10)
      : 5,

    // keywords / browse node overrides (you can add BrowseNodeId values here per category)
    KEYWORDS_OVERRIDE: {
      Electronics: "wireless earbuds",
      Fashion: "men's t-shirt",
      Beauty: "face serum",
      HomeAndKitchen: "non-stick cookware",
      ToysAndGames: "lego set",
      Computers: "gaming laptop",
      Books: "bestselling fiction",
      GroceryAndGourmetFood: "snacks",
      ...(process.env.AMAZON_KEYWORDS_OVERRIDE_JSON
        ? JSON.parse(process.env.AMAZON_KEYWORDS_OVERRIDE_JSON)
        : {}),
    },

    // Optional: set browse node IDs if you have them to improve relevance, example:
    BROWSE_NODE_OVERRIDES: process.env.AMAZON_BROWSE_NODE_OVERRIDES_JSON
      ? JSON.parse(process.env.AMAZON_BROWSE_NODE_OVERRIDES_JSON)
      : {
          // Example: Electronics: 17467377031
        },

    // resources requested from PA-API (official list) - trimmed when too large by code
    RESOURCES: [
  "ItemInfo.Title",
  "Images.Primary.Large",
  "Offers.Listings.Price",
  "Offers.Listings.SavingBasis",
  "ItemInfo.ByLineInfo",
  "ItemInfo.Features",
  "BrowseNodeInfo.BrowseNodes.SalesRank",
  // "CustomerReviews.StarRating",
        "Offers.Listings.Availability.Message",
      "Offers.Listings.DeliveryInfo.IsPrimeEligible",
],

    // active categories (edit as required)
    CATEGORIES: process.env.AMAZON_CATEGORIES_JSON
      ? JSON.parse(process.env.AMAZON_CATEGORIES_JSON)
      : [
      "Electronics",
      "Fashion",
      "Beauty",
      // "HomeAndKitchen",
      // "SportsAndOutdoors",
      // "ToysAndGames",
      // "Books",
      // "Apparel",
      // "Appliances",
      // "Automotive",
      // "Baby",
      // "Collectibles",
      // "Computers",
      // "Furniture",
      // "GardenAndOutdoor",
      // "GiftCards",
      // "GroceryAndGourmetFood",
      // "HealthPersonalCare",
      // "Industrial",
      // "Jewelry",
      // "KindleStore",
      // "Luggage",
      // "LuxuryBeauty",
      // "MobileApps",
      // "MoviesAndTV",
      // "Music",
      // "MusicalInstruments",
      // "OfficeProducts",
      // "PetSupplies",
      // "Shoes",
      // "Software",
      // "ToolsAndHomeImprovement",
      // "VideoGames",
      // "Watches",
    ],

    // filters you can tune via env
    MIN_SAVING_PERCENT: process.env.AMAZON_MIN_SAVING_PERCENT
      ? parseInt(process.env.AMAZON_MIN_SAVING_PERCENT, 10)
      : undefined,
    MIN_REVIEWS_RATING: process.env.AMAZON_MIN_REVIEWS_RATING
      ? parseInt(process.env.AMAZON_MIN_REVIEWS_RATING, 10)
      : undefined,
    MIN_PRICE: process.env.AMAZON_MIN_PRICE ? parseInt(process.env.AMAZON_MIN_PRICE, 10) : undefined,
    MAX_PRICE: process.env.AMAZON_MAX_PRICE ? parseInt(process.env.AMAZON_MAX_PRICE, 10) : undefined,
    DELIVERY_FLAGS: process.env.AMAZON_DELIVERY_FLAGS
      ? process.env.AMAZON_DELIVERY_FLAGS.split(",").map((s) => s.trim())
      : undefined,

    ITEM_COUNT: parseInt(process.env.AMAZON_ITEM_COUNT || 10, 10),

    // tuning / safety knobs
    CATEGORY_FETCH_DELAY_MS: process.env.AMAZON_CATEGORY_FETCH_DELAY_MS
      ? parseInt(process.env.AMAZON_CATEGORY_FETCH_DELAY_MS, 10)
      : 1800,
    PROBE_CACHE_TTL: process.env.AMAZON_PROBE_CACHE_TTL
      ? parseInt(process.env.AMAZON_PROBE_CACHE_TTL, 10)
      : 12 * 60 * 60,
    MAX_429_BEFORE_DISABLE: process.env.AMAZON_MAX_429_BEFORE_DISABLE
      ? parseInt(process.env.AMAZON_MAX_429_BEFORE_DISABLE, 10)
      : 3,
    RATE_LIMIT_WINDOW_SECONDS: process.env.AMAZON_RATE_LIMIT_WINDOW_SECONDS
      ? parseInt(process.env.AMAZON_RATE_LIMIT_WINDOW_SECONDS, 10)
      : 60,
    DISABLE_AFTER_429_SECONDS: process.env.AMAZON_DISABLE_AFTER_429_SECONDS
      ? parseInt(process.env.AMAZON_DISABLE_AFTER_429_SECONDS, 10)
      : 30 * 60,

    RANDOMIZE_ITEM_PAGE: process.env.AMAZON_RANDOMIZE_ITEM_PAGE === "true",
    SORT_BY_OPTIONS: process.env.AMAZON_SORT_BY_OPTIONS
      ? process.env.AMAZON_SORT_BY_OPTIONS.split(",")
      : undefined,
  },
};

export default config;
