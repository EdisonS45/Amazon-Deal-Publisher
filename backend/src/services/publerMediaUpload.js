import fs from "fs";
import path from "path";
import axios from "axios";
import FormData from "form-data";
import os from "os";
import config from "../config/index.js";
import logger from "../config/logger.js";

const PUBLER_MEDIA_URL = "https://app.publer.com/api/v1/media";

export const uploadMediaToPubler = async (imageUrl, id, localPath = null) => {
  let temp = localPath; // move this line OUTSIDE try
  try {
    if (!config.PUBLER?.API_KEY) throw new Error("Missing Publer API key");

    if (!temp) {
      const res = await axios.get(imageUrl, { responseType: "arraybuffer" });
      const ext = (res.headers["content-type"] || "image/jpeg").split("/")[1];
      const fName = `temp_${id}_${Date.now()}.${ext}`;
      temp = path.join(os.tmpdir(), fName);
      fs.writeFileSync(temp, res.data);
    }

    const form = new FormData();
    form.append("file", fs.createReadStream(temp));
    form.append("direct_upload", "true");
    form.append("in_library", "false");

    const res = await axios.post(PUBLER_MEDIA_URL, form, {
      headers: {
        Authorization: `Bearer-API ${config.PUBLER.API_KEY}`,
        "Publer-Workspace-Id": config.PUBLER.WORKSPACE_ID,
        ...form.getHeaders(),
      },
    });

    const idOut = res.data?.id;
    if (!idOut) throw new Error("No media ID returned");
    logger.info(`Uploaded media to Publer -> ${idOut}`);
    return idOut;
  } catch (e) {
    logger.error(`Publer upload error for ${id}: ${e.message}`);
    return null;
  } finally {
    if (!localPath && fs.existsSync(temp)) fs.unlinkSync(temp);
  }
};
