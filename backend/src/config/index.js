import "dotenv/config";

// if (
//   !process.env.MONGO_URI ||
//   !process.env.AMAZON_ACCESS_KEY ||
//   !process.env.AMAZON_SECRET_KEY
// ) {
//   throw new Error("FATAL ERROR: Essential environment variables are not set");
// }

const config = {
  MONGO_URI: process.env.MONGO_URI,
  REDIS_URL: process.env.REDIS_URL || "redis://127.0.0.1:6379",
  CACHE_TTL_SECONDS: 6 * 60 * 60,
  CRON_SCHEDULE: process.env.CRON_SCHEDULE || "0 0 * * *",
  EMAIL: {
    HOST: process.env.EMAIL_HOST,
    PORT: process.env.EMAIL_PORT,
    SECURE: process.env.EMAIL_SECURE === "true",
    USER: process.env.EMAIL_USER,
    PASS: process.env.EMAIL_PASS,
    TO: process.env.EMAIL_TO,
  },
  AMAZON: {
    ACCESS_KEY: process.env.AMAZON_ACCESS_KEY,
    SECRET_KEY: process.env.AMAZON_SECRET_KEY,
    PARTNER_TAG: process.env.AMAZON_PARTNER_TAG,
    MARKETPLACE: process.env.AMAZON_MARKETPLACE || "www.amazon.com",
    RESOURCES: [
      "Images.Primary.Medium",
      "ItemInfo.Title",
      "Offers.Listings.Price",
      "Offers.Listings.SavingBasis",
    ],
    CATEGORIES: [
      "Apparel",
      "Appliances",
      "Automotive",
      "Baby",
      "Beauty",
      "Books",
      "Collectibles",
      "Computers",
      "Electronics",
      "EverythingElse",
      "Fashion",
      "Furniture",
      "GardenAndOutdoor",
      "GiftCards",
      "GroceryAndGourmetFood",
      "HealthPersonalCare",
      "HomeAndKitchen",
      "Industrial",
      "Jewelry",
      "KindleStore",
      "Luggage",
      "LuxuryBeauty",
      "MobileApps",
      "MoviesAndTV",
      "Music",
      "MusicalInstruments",
      "OfficeProducts",
      "PetSupplies",
      "Shoes",
      "Software",
      "SportsAndOutdoors",
      "ToolsAndHomeImprovement",
      "ToysAndGames",
      "VideoGames",
      "Watches",
    ],
    ITEM_COUNT: 20,
  },
};

export default config;
