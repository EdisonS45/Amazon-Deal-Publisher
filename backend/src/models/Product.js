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
    ImageURL: { type: String },

    Price: { type: Number, required: true },
    OriginalPrice: { type: Number },
    Currency: { type: String, default: "USD" },
    DiscountPercentage: { type: Number },
    SavingsAmount: { type: Number },
    Brand: { type: String },
    IsPrimeEligible: { type: Boolean },
    Availability: { type: String },

    Category: { type: String, required: true },
    Marketplace: { type: String, default: "US" },
    LastUpdated: { type: Date, default: Date.now },
    IsPosted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("Product", productSchema);