import {
  GoogleGenAI,
  createUserContent,
  createPartFromUri,
} from "@google/genai";
import config from "../config/index.js";
import logger from "../config/logger.js";
import fs from "fs";

const genAI = new GoogleGenAI(config.GEMINI.API_KEY);


export const generateAICaption = async (products, aiPrompt, firstImagePath) => {
  logger.info(
    `Generating AI caption for theme: "${aiPrompt.substring(0, 50)}..."`
  );

  if (!products || products.length === 0) {
    throw new Error("No products provided to generate caption.");
  }
  if (!firstImagePath) {
    throw new Error(
      `First image path is missing or invalid: Value is literally 'undefined'`
    );
  }
  if (!fs.existsSync(firstImagePath)) {
    throw new Error(
      `First image path exists but file not found on disk: ${firstImagePath}`
    );
  }

  let uploadedFile = null; 

  try {
    const productDataString = products
      .map((p, index) => {
        return `
--- Product ${index + 1} (This is Slide ${index + 1}) ---
Title: ${p.Title}
Price: ${p.Currency}${p.Price}
Discount: ${p.DiscountPercentage}%
Sales Rank: ${p.sales_rank || "N/A"}
Link: ${p.ProductURL}
---
      `;
      })
      .join("\n");

    const fullPrompt = `
You are an expert social media copywriter. The attached image is the cover image for a 5-product carousel post.
Your goal is to write a high-engagement caption for the *entire* carousel.
${aiPrompt}
Here is the data for all products in the carousel:
${productDataString}
Please provide ONLY the final, ready-to-post caption. The caption should cleverly introduce all products. Start with a hook and end with a call-to-action that points to the link in bio. Do not include your own commentary.
    `;


    logger.debug(`Uploading ${firstImagePath} to Gemini API for captioning...`);
    uploadedFile = await genAI.files.upload({
      file: firstImagePath,
      mimeType: "image/jpeg",
    });
    logger.debug(`File uploaded, URI: ${uploadedFile.uri}`);

    const result = await genAI.models.generateContent({
      model: config.GEMINI.TEXT_MODEL || "gemini-2.5-flash",
      contents: [
        createUserContent([
          fullPrompt,
          createPartFromUri(uploadedFile.uri, uploadedFile.mimeType),
        ]),
      ],
    });


    const caption = result?.text || "";
    if (!caption) {
      throw new Error(
        "Gemini returned an empty caption or invalid response structure."
      );
    }

    logger.info(`✅ AI caption generated successfully.`);
    return caption.trim();
  } catch (error) {
    logger.error(`❌ AI caption generation failed: ${error.message}`);
    logger.debug(`[AI_CAPTION STACK TRACE] ${error.stack}`);
    return "🔥 Amazing deals inside! Swipe to see them all. Link in bio! #ad"; // Fallback
  } finally {
    if (uploadedFile) {
      try {
        const fileId = uploadedFile.name || uploadedFile.file?.name;
        if (fileId) {
          await genAI.files.delete(fileId);
          logger.debug(`Cleaned up uploaded file ${fileId} from Gemini.`);
        }
      } catch (cleanupError) {
        logger.warn(`Failed to cleanup Gemini file: ${cleanupError.message}`);
      }
    }
  }
};
