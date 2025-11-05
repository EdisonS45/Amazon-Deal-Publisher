import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    ASIN: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    Title: { type: String, required: true },
    ProductURL: { type: String, required: true },

    // Primary image used for quick upload; ImageFallbacks stores raw image objects returned by PA-API
    ImageURL: { type: String },
    ImagesFallbacks: { type: mongoose.Schema.Types.Mixed, default: null },

    // Pricing
    Price: { type: Number, required: true },
    OriginalPrice: { type: Number },
    Currency: { type: String, default: "USD" },
    DiscountPercentage: { type: Number, default: 0 },
    SavingsAmount: { type: Number, default: 0 },

    // Product metadata
    Brand: { type: String, default: null },
    Features: { type: [String], default: [] },
    SalesRank: { type: Number, default: null },

    // Availability / fulfillment
    IsPrimeEligible: { type: Boolean, default: false },
    Availability: { type: String, default: "Unknown" },

    // Ratings
    RatingsCount: { type: Number, default: 0 },
    StarRating: { type: Number, default: 0 },

    // Publishing metadata
    Category: { type: String, required: true },
    Marketplace: { type: String, default: "US" },

    // Internal tracking fields
    LastUpdated: { type: Date, default: Date.now },
    IsPosted: { type: Boolean, default: false },
    TimesPosted: { type: Number, default: 0 },
    LastPostedAt: { type: Date, default: null },
    PublerPostID: { type: String, default: null },
    LocalImagePath: { type: String, default: null }, // store generated poster path if present

    // Additional raw fields preserved if needed
    RawItem: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  {
    timestamps: true,
  }
);

// Add an index for LastUpdated + DiscountPercentage to speed queries that sort by these
productSchema.index({ LastUpdated: -1, DiscountPercentage: -1 });

export default mongoose.model("Product", productSchema);
