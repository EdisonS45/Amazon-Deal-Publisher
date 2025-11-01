// src/models/ContentPost.js
import mongoose from "mongoose";

const contentPostSchema = new mongoose.Schema({
  // --- Identity ---
  theme_name: { type: String, required: true },
  niche_id: { type: String, required: true, index: true }, // e.g., "ELECTRONICS"
  
  // --- AI-Generated Content ---
  caption: { type: String, required: true },
  
  // --- Media ---
  // This array will have 6 URLs: [TitleCard, Prod1, Prod2, Prod3, Prod4, Prod5]
  image_urls: { type: [String], required: true },
  
  // --- Product & Scheduling ---
  // Store the ASINs used, so we don't re-use them
  related_asins: { type: [String], index: true },
  status: {
    type: String,
    enum: ['READY_TO_POST', 'POSTED', 'ERROR'],
    default: 'READY_TO_POST',
    index: true
  },
  
  // --- Publer Info ---
  scheduled_at: { type: Date },
  publer_post_id: { type: String },
  
  createdAt: { type: Date, default: Date.now },
});

const ContentPost = mongoose.model("ContentPost", contentPostSchema);
export default ContentPost;