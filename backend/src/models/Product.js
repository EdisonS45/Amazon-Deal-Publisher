// src/models/Product.js
import mongoose from "mongoose";

const productSchema = new mongoose.Schema({
  ASIN: { type: String, required: true, unique: true, index: true },
  Title: { type: String, required: true },
  ProductURL: { type: String, required: true },
  
  // --- Image ---
  // We store BOTH urls for debugging, but will only use the high-res one
  LowResImageURL: { type: String }, 
  ImageURL: { type: String }, // This will be the HIGH-RES URL
  
  // --- Price ---
  Price: { type: Number, required: true },
  OriginalPrice: { type: Number },
  Currency: { type: String },
  DiscountPercentage: { type: Number, index: true },
  SavingsAmount: { type: Number },

  // --- Details (from v1) ---
  Brand: { type: String },
  IsPrimeEligible: { type: Boolean },
  Availability: { type: String },
  
  // --- V2 ENRICHMENT DATA ---
  Category: { type: String, index: true }, // The original Amazon category
  niche_id: { type: String, index: true }, // Your 5 brand categories (e.g., "FASHION")
  features: { type: [String] }, // From ItemInfo.Features
  sales_rank: { type: Number, index: true }, // From BrowseNodeInfo.BrowseNodes.SalesRank
  
  // --- V2 STATUS ---
  status: { 
    type: String, 
    enum: ['PENDING_ENRICHMENT', 'ENRICHED', 'POST_GENERATED'], 
    default: 'PENDING_ENRICHMENT',
    index: true
  },
  
  LastUpdated: { type: Date, default: Date.now },
  
  // We remove IsPosted, as the new content_queue will track this
});

const Product = mongoose.model("Product", productSchema);
export default Product;