import fs from "fs";
import path from "path";
import axios from "axios";
import FormData from "form-data";
import config from "../config/index.js";
import logger from "../config/logger.js";
import os from "os";

const PUBLER_MEDIA_UPLOAD_URL = "https://app.publer.com/api/v1/media";


const uploadSingleLocalFileToPubler = async (localFilePath, identifier) => {
  const formData = new FormData();
  formData.append("file", fs.createReadStream(localFilePath));
  formData.append("direct_upload", "true");
  formData.append("in_library", "false");

  const headers = {
    Authorization: `Bearer-API ${config.PUBLER.API_KEY}`,
    "Publer-Workspace-Id": config.PUBLER.WORKSPACE_ID,
    Accept: "*/*",
    ...formData.getHeaders(),
  };

  const uploadResponse = await axios.post(PUBLER_MEDIA_UPLOAD_URL, formData, {
    headers,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    timeout: 120000,
  });

  const mediaId = uploadResponse.data?.id;
  if (mediaId) {
    logger.info(`Publer media uploaded for ${identifier}: ${mediaId}`);
    return mediaId;
  }
  throw new Error(`Publer uploaded but no media id returned. Resp: ${JSON.stringify(uploadResponse.data)}`);
};

const downloadToTemp = async (imageUrl, identifier) => {
  const response = await axios.get(imageUrl, {
    responseType: "arraybuffer",
    timeout: 20000,
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Failed to download image from URL: ${imageUrl}`);
  }
  const buffer = Buffer.from(response.data);
  const tempDir = config.TEMP_PATH || os.tmpdir();
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  const fileExt = (response.headers["content-type"] || "image/jpeg").split("/")[1] || "jpg";
  const fileName = `temp_${identifier}_${Date.now()}.${fileExt}`;
  const tempFilePath = path.join(tempDir, fileName);
  fs.writeFileSync(tempFilePath, buffer);
  logger.debug(`Downloaded image to temp file: ${tempFilePath}`);
  return tempFilePath;
};

export const uploadMediaToPubler = async (imageInput, identifier, localFilePath = null) => {
  if (!config.PUBLER?.API_KEY) {
    logger.error("Publer API key missing for media upload.");
    return null;
  }

  const inputs = Array.isArray(imageInput) ? imageInput : [imageInput || localFilePath].filter(Boolean);
  const mediaIds = [];

  const downloadedTemps = [];

  for (let i = 0; i < inputs.length; i++) {
    let inp = inputs[i];
    let tempPath = null;
    let fileWasDownloaded = false;
    try {
      if (typeof inp === "string") {
        if (fs.existsSync(inp)) {
          tempPath = inp;
        } else {
          tempPath = await downloadToTemp(inp, `${identifier}_${i}`);
          fileWasDownloaded = true;
          downloadedTemps.push(tempPath);
        }
      } else if (inp && inp.localFilePath) {
        tempPath = inp.localFilePath;
      } else if (inp && inp.url) {
        tempPath = await downloadToTemp(inp.url, `${identifier}_${i}`);
        fileWasDownloaded = true;
        downloadedTemps.push(tempPath);
      } else {
        logger.warn(`Invalid media input at index ${i} for ${identifier}, skipping.`);
        continue;
      }

      const mediaId = await uploadSingleLocalFileToPubler(tempPath, `${identifier}_${i}`);
      mediaIds.push(mediaId);
    } catch (error) {
      logger.error(`Publer Media Upload Error for ${identifier} (index ${i}): ${error?.message || error}`);
      if (error.response?.data) {
        logger.error(`Publer API Response: ${JSON.stringify(error.response.data)}`);
      }
    } finally {
    }
  }

  for (const p of downloadedTemps) {
    try {
      if (fs.existsSync(p)) {
        fs.unlinkSync(p);
        logger.debug(`Cleaned up temp file: ${p}`);
      }
    } catch (cleanupError) {
      logger.warn(`Failed to cleanup temp file: ${p}: ${cleanupError.message}`);
    }
  }

  if (!Array.isArray(imageInput) && mediaIds.length > 0) return mediaIds[0];
  return mediaIds;
};

export default uploadMediaToPubler;
