import express from "express";
import fs from "fs";
import Product from "../models/Product.js";
import { generatePosterImage } from "../services/imageGenerator.js";
import { generateSocialCaption } from "../services/postGenerator.js";
import logger from "../config/logger.js";

const router = express.Router();

router.post("/post", async (req, res) => {
  try {
    const { asin, asins, groupTitle } = req.body;
    if (!asin && !asins) return res.status(400).json({ error: "Provide asin or asins." });

    let data;
    if (asin) {
      const p = await Product.findOne({ ASIN: asin }).lean();
      if (!p) return res.status(404).json({ error: "ASIN not found" });
      data = p;
    } else {
      const prods = await Product.find({ ASIN: { $in: asins } }).lean();
      data = { id: `preview_${Date.now()}`, title: groupTitle || `Top ${prods.length} Preview`, items: prods };
    }

    const caption = generateSocialCaption(data);
    const imagePath = await generatePosterImage(data);

    const base64 = fs.existsSync(imagePath)
      ? `data:image/jpeg;base64,${fs.readFileSync(imagePath).toString("base64")}`
      : null;

    return res.json({ caption, imagePath, imageBase64: base64 });
  } catch (e) {
    logger.error(`Preview error: ${e.message}`);
    return res.status(500).json({ error: e.message });
  }
});

export default router;
