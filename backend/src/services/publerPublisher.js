import axios from "axios";
import config from "../config/index.js";
import logger from "../config/logger.js";

const PUBLER_POST_URL = "https://app.publer.com/api/v1/posts/schedule";

export const publishDealToPubler = async (group, caption, time, mediaId) => {
  try {
    if (!config.PUBLER?.API_KEY) throw new Error("Missing Publer key");
    const accounts = config.PUBLER.ACCOUNTS || [];
    const iso = time.toISOString();

    const posts = accounts.map((acc) => ({
      networks: {
        facebook: { type: "photo", text: caption, media: [{ id: mediaId, type: "photo" }] },
        instagram: { type: "photo", text: caption, media: [{ id: mediaId, type: "photo" }] },
      },
      accounts: [{ id: acc, scheduled_at: iso }],
    }));

    const res = await axios.post(PUBLER_POST_URL, { bulk: { state: "scheduled", posts } }, {
      headers: {
        Authorization: `Bearer-API ${config.PUBLER.API_KEY}`,
        "Publer-Workspace-Id": config.PUBLER.WORKSPACE_ID,
      },
    });

    logger.info(`✅ Publer post scheduled for group ${group.id || "unknown"}`);
    return res.data;
  } catch (e) {
    logger.error(`❌ Publer publish error: ${e.message}`);
    return null;
  }
};
