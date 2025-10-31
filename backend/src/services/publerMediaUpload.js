import fs from "fs";
import path from "path";
import axios from "axios";
import FormData from "form-data";
import config from "../config/index.js";
import logger from "../config/logger.js";
import os from "os";
const PUBLER_MEDIA_UPLOAD_URL = "https://app.publer.com/api/v1/media";
export const uploadMediaToPubler = async (
  imageUrl,
  asin,
  localFilePath = null
) => {
  if (!config.PUBLER.API_KEY) {
    logger.error("Publer API key missing for media upload.");
    return null;
  }

  let tempFilePath = localFilePath;
  let fileWasDownloaded = false;
  try {
    logger.info(
      `Uploading media for ASIN ${asin} (localFilePath: ${!!localFilePath})`
    );

    if (!localFilePath) {
      if (!imageUrl) {
        logger.error(
          "No image URL provided and no local file path. Aborting upload."
        );
        return null;
      }

      const response = await fetch(imageUrl);
      if (!response.ok)
        throw new Error(`Failed to download image from URL: ${imageUrl}`);
      const buffer = await response.arrayBuffer();
      const tempDir = config.TEMP_PATH || os.tmpdir();
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

      const fileName = `temp_${asin}_${Date.now()}.jpg`;
      tempFilePath = path.join(tempDir, fileName);
      fs.writeFileSync(tempFilePath, Buffer.from(buffer));
      fileWasDownloaded = true;
    }

    const formData = new FormData();
    formData.append("file", fs.createReadStream(tempFilePath));
    formData.append("direct_upload", "true");
    formData.append("in_library", "false");

    const uploadResponse = await axios.post(PUBLER_MEDIA_UPLOAD_URL, formData, {
      headers: {
        Authorization: `Bearer-API ${config.PUBLER.API_KEY}`,
        "Publer-Workspace-Id": config.PUBLER.WORKSPACE_ID,
        Accept: "*/*",
        ...formData.getHeaders(),
      },
    });

    const mediaId = uploadResponse.data.id;
    if (mediaId) {
      logger.info(`Publer media uploaded for ASIN ${asin}: ${mediaId}`);
      return mediaId;
    } else {
      logger.error(
        `Publer uploaded but no media id returned. Response: ${JSON.stringify(
          uploadResponse.data
        )}`
      );
      return null;
    }
  } catch (error) {
    logger.error(
      `Publer Media Upload Error for ASIN ${asin}: ${error.message}`
    );
    if (error.response?.data) {
      logger.error(
        `Publer API Response: ${JSON.stringify(error.response.data)}`
      );
    }
    return null;
  } finally {
    if (fileWasDownloaded && tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
        logger.info(`Cleaned up temp file: ${tempFilePath}`);
      } catch (cleanupError) {
        logger.error(
          `Failed to cleanup temp file: ${tempFilePath}: ${cleanupError.message}`
        );
      }
    }
  }
};
