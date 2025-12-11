import axios from "axios";
import config from "../config/index.js";
import logger from "../config/logger.js";
import { publishToTwitter } from "./twitterPublisher.js"; 
import { fileURLToPath } from "url";

const PUBLER_API_URL = "https://app.publer.com/api/v1/posts/schedule";

const ensureString = (v) => (v === undefined || v === null ? "" : String(v));

export const publishDealToPubler = async (
  productOrGroup,
  postText,
  scheduleTime,
  publerMediaIds
) => {
  if (!config.PUBLER?.API_KEY || (config.PUBLER?.ACCOUNTS || []).length === 0) {
    logger.error("Publer configuration missing. Cannot publish deal.");
    return null;
  }

  if (!publerMediaIds || (Array.isArray(publerMediaIds) && publerMediaIds.length === 0)) {
    logger.error(`Media ID(s) missing. Cannot publish.`);
    return null;
  }

  const isoTimestamp = scheduleTime.toISOString();
  const titleForLog = productOrGroup?.title || productOrGroup?.Title || productOrGroup?.ASIN || "unknown";

  const mediaArray = (Array.isArray(publerMediaIds) ? publerMediaIds : [publerMediaIds]).map((id) => ({
    id,
    type: "photo",
  }));

  const posts = (config.PUBLER.ACCOUNTS || []).map((accountId) => ({
    networks: {
      facebook: { type: "photo", text: postText, media: mediaArray },
      instagram: { type: "photo", text: postText, media: mediaArray },
      telegram: { type: "photo", text: postText, media: mediaArray },
    },
    accounts: [{ id: accountId, scheduled_at: isoTimestamp }],
  }));

  const payload = { bulk: { state: "scheduled", posts } };

  try {
    const response = await axios.post(PUBLER_API_URL, payload, {
      headers: {
        Authorization: `Bearer-API ${config.PUBLER.API_KEY}`,
        "Publer-Workspace-Id": config.PUBLER.WORKSPACE_ID,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      timeout: 120000,
    });

    logger.info(`✅ Publer: Scheduled post for ${titleForLog}`);
    logger.debug(`Publer response: ${JSON.stringify(response.data)}`);

    if (
      process.env.TWITTER_API_KEY &&
      process.env.TWITTER_API_SECRET &&
      process.env.TWITTER_ACCESS_TOKEN &&
      process.env.TWITTER_ACCESS_SECRET
    ) {
      const repImageUrl = productOrGroup?.items?.[0]?.ImageURL || null;
      logger.info(`Scheduling Twitter post for ${titleForLog}...`);
      await publishToTwitter(productOrGroup, postText, repImageUrl);
    } else {
      logger.info("Skipping Twitter: No credentials found in environment.");
    }

    return response.data;
  } catch (error) {
    logger.error(`❌ Publer Error for ${titleForLog}: ${error?.message || error}`);
    if (error.response?.data) {
      logger.error(`Publer API Response Error: ${JSON.stringify(error.response.data)}`);
    }

    if (
      process.env.TWITTER_API_KEY &&
      process.env.TWITTER_API_SECRET &&
      process.env.TWITTER_ACCESS_TOKEN &&
      process.env.TWITTER_ACCESS_SECRET
    ) {
      const repImageUrl = productOrGroup?.items?.[0]?.ImageURL || null;
      await publishToTwitter(productOrGroup, postText, repImageUrl);
    }

    return null;
  }
};

export default publishDealToPubler;
