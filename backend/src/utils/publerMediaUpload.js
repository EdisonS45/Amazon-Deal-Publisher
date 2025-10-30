import axios from "axios";
import FormData from "form-data";
import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import logger from "../config/logger.js";
import config from "../config/index.js";

const PUBLER_MEDIA_UPLOAD_URL = "https://app.publer.com/api/v1/media";

export const uploadMediaToPubler = async (imageUrl, asin) => {
  if (!config.PUBLER.API_KEY || !imageUrl) {
    logger.error("Publer configuration or image URL missing for media upload.");
    return null;
  }

  try {
    logger.info(`Attempting to upload media for ASIN ${asin} from URL: ${imageUrl}`);

    // Step 1️⃣ — Download the image temporarily
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to download image from URL: ${imageUrl}`);
    }

    const buffer = await response.arrayBuffer();
    const fileName = `temp_${asin}_${Date.now()}.jpg`;
    const tempFilePath = path.join("/tmp", fileName); // or ./tmp if local

    fs.writeFileSync(tempFilePath, Buffer.from(buffer));

    // Step 2️⃣ — Create form-data exactly like Postman
    const formData = new FormData();
    formData.append("file", fs.createReadStream(tempFilePath));
    formData.append("direct_upload", "true"); // ✅ must be string, not boolean
    formData.append("in_library", "false");

    // Step 3️⃣ — POST to Publer
    const uploadResponse = await axios.post(PUBLER_MEDIA_UPLOAD_URL, formData, {
      headers: {
        Authorization: `Bearer-API ${config.PUBLER.API_KEY}`,
        "Publer-Workspace-Id": config.PUBLER.WORKSPACE_ID,
        Accept: "*/*", // matches your Postman request
        ...formData.getHeaders(),
      },
    });

    // Step 4️⃣ — Cleanup temp file
    fs.unlinkSync(tempFilePath);

    const mediaId = uploadResponse.data.id;
    if (mediaId) {
      logger.info(`✅ Publer: Media uploaded successfully for ASIN ${asin}. Media ID: ${mediaId}`);
      return mediaId;
    } else {
      logger.error(`❌ Publer upload succeeded but no media ID in response.`);
      logger.debug(JSON.stringify(uploadResponse.data));
      return null;
    }
  } catch (error) {
    logger.error(`❌ Publer Media Upload Error for ASIN ${asin}: ${error.message}`);
    if (error.response?.data) {
      logger.error(`Publer API Response: ${JSON.stringify(error.response.data)}`);
    }
    return null;
  }
};
