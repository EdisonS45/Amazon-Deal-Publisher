import Product from "../models/Product.js";
import ContentPost from "../models/ContentPost.js";
import { THEMES } from "../config/publishingConfig.js";
import logger from "../config/logger.js";
import config from "../config/index.js"; 
import { generateAICaption } from "./postGenerator.js";
import { generatePosterImage } from "./imageGenerator.js"; 
import fs from "fs";

export const runContentFactory = async () => {
  logger.info("🏭 --- CONTENT FACTORY STARTED ---");
  let postsCreated = 0;

  for (const theme of THEMES) {
    const generatedImagePaths = []; 
    try {
      const minProducts = 3; 
      const maxProducts = theme.query.limit || 5;

      let products = await Product.find(theme.query.find)
        .sort(theme.query.sort)
        .limit(maxProducts)
        .lean();

      const TEST_MODE_POST_LIMIT = 1; 
      if (config.TEST_MODE && products.length > TEST_MODE_POST_LIMIT) {
        logger.warn(`🧪 TEST_MODE: Slicing product list from ${products.length} to ${TEST_MODE_POST_LIMIT}`);
        products = products.slice(0, TEST_MODE_POST_LIMIT);
      }

      const effectiveMinProducts = config.TEST_MODE ? 1 : minProducts;

      if (products.length < effectiveMinProducts) {
        logger.warn(
          `Skipping theme "${theme.theme_name}": not enough products found (found ${products.length}, need ${effectiveMinProducts}).`
        );
        continue;
      }

      logger.info(
        `Found ${products.length} products. Generating ${products.length} AI posters for theme: "${theme.theme_name}"`
      );
      for (const product of products) {
        const posterPath = await generatePosterImage(product);
        
        if (posterPath) {
          generatedImagePaths.push(posterPath);
        } else {
          logger.error(`Failed to generate poster for ASIN ${product.ASIN}. Skipping this product.`);
        }
      }

      if (generatedImagePaths.length < effectiveMinProducts) {
        logger.warn(
          `Skipping theme "${theme.theme_name}": not enough posters were successfully generated (${generatedImagePaths.length}).`
        );
        throw new Error("Not enough posters generated.");
      }
      
      logger.info(`✅ Generated ${generatedImagePaths.length} AI posters.`);
      
      const firstPosterPath = generatedImagePaths[0];
      
      const successfulProducts = products.slice(0, generatedImagePaths.length);

      const caption = await generateAICaption(
        successfulProducts,
        theme.ai_caption_prompt,
        firstPosterPath
      );

      if (!caption) {
        logger.error(
          `Failed to generate AI caption for theme: ${theme.theme_name}. Skipping post.`
        );
        throw new Error("Caption generation returned null.");
      }
      
      const asins = successfulProducts.map((p) => p.ASIN);

      await ContentPost.create({
        theme_name: theme.theme_name,
        niche_id: theme.niche_id,
        caption: caption,
        image_urls: generatedImagePaths, 
        related_asins: asins,
        status: "READY_TO_POST",
      });

      await Product.updateMany(
        { ASIN: { $in: asins } },
        { $set: { status: "POST_GENERATED" } }
      );

      postsCreated++;
      logger.info(`Created content post for theme: ${theme.theme_name}`);
      
    } catch (err) {
      logger.error(
        `Failed to generate content for theme "${theme.theme_name}": ${err.message}`
      );
      for (const path of generatedImagePaths) {
         if (fs.existsSync(path)) fs.unlinkSync(path);
      }
    }
  }
  logger.info(
    `🏭 --- CONTENT FACTORY FINISHED: Created ${postsCreated} new posts. ---`
  );
  return { postsCreated };
};