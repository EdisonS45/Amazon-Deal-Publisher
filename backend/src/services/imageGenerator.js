import fs from "fs";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import config from "../config/index.js";
import logger from "../config/logger.js";
import sharp from "sharp";

const ai = new GoogleGenAI({
  apiKey: config.GEMINI.API_KEY,
});

export const generatePosterImage = async (deal) => {
  try {

    const imagePath = deal.ImageURL || deal.imageUrl;
    if (!imagePath) throw new Error("No product image URL found in deal");

    logger.info(`🔄 Generating promotional image for ASIN ${deal.ASIN}`);

    const imageResponse = await fetch(imagePath);
    if (!imageResponse.ok) {
      throw new Error(
        `Failed to fetch product image: ${imageResponse.statusText}`
      );
    }

    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
    const base64ImageData = imageBuffer.toString("base64");

    const fullTitle = deal.Title;
    const cleanTitle = fullTitle.split("-")[0].split(",")[0].trim();

    const prompt = `
---
### PERSONA & GOAL
Act as a **Senior Promotional Designer at Amazon**. Your single objective is to create a "scroll-stopping" poster...
---
### REQUIRED TEXT (ABSOLUTE)
...
1.  **Headline:** Use this *exact* text: "${cleanTitle}"
2.  **Discount Badge:** *exactly* this text: "${deal.DiscountPercentage}% OFF"
3.  **Current Price:** *exactly* this text: "${deal.Currency}${deal.Price}"
4.  **Original Price:** *exactly* this text: "${deal.Currency}${deal.OriginalPrice}"
    *(This price MUST have a visible strikethrough.)*
5.  **Call to Action:** *exact* text: "Shop Now"
---
### DESIGN STYLE
...
### NEGATIVE CONSTRAINTS
...
`;

    const result = await ai.models.generateContent({
      model: config.GEMINI.MODEL || "gemini-2.5-flash-image",
      contents: [
        {
          inlineData: {
            mimeType: "image/jpeg",
            data: base64ImageData,
          },
        },
        {
          text: prompt,
        },
      ],
    });
    

    const parts =
      result?.response?.candidates?.[0]?.content?.parts ||
      result?.candidates?.[0]?.content?.parts;

    if (!parts || parts.length === 0) {
      throw new Error("No content parts found in Gemini response");
    }

    const imagePart = parts.find(
      (p) => p.inlineData && p.inlineData.mimeType?.startsWith("image/")
    );

    if (!imagePart) {
      logger.error(
        `[GEMINI ERROR] No image data found in response parts: ${JSON.stringify(
          parts,
          null,
          2
        )}`
      );
      throw new Error("Gemini response did not contain an image");
    }

    const base64Image = imagePart.inlineData.data;
    const mimeType = imagePart.inlineData.mimeType;
    if (!base64Image) {
      throw new Error("Gemini returned no image data (base64 empty)");
    }
    const fileExt = mimeType.split("/")[1] || "png";
    const fileName = `poster_${deal.ASIN}_${Date.now()}.${fileExt}`;
    const outputDir = path.join(process.cwd(), "posters");
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    const filePath = path.join(outputDir, fileName);
    await sharp(Buffer.from(base64Image, "base64"))
      .jpeg({ quality: 90 })
      .toFile(filePath);
    if (!fs.existsSync(filePath)) {
      throw new Error("Image file write failed (no file found)");
    }
    logger.info(
      `✅ Image generated successfully for ASIN ${deal.ASIN} -> ${filePath}`
    );
    return filePath;

  } catch (err) {
    logger.error(
      `❌ Image generation failed for ASIN ${deal.ASIN}: ${err.message}`
    );
    logger.debug(`[GEMINI STACK TRACE] ${err.stack}`);
    return null;
  }
};