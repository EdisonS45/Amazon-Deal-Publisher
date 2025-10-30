import axios from "axios";
import config from "../config/index.js";
import logger from "../config/logger.js";
import { uploadMediaToPubler } from "../utils/publerMediaUpload.js";

const PUBLER_API_URL = "https://app.publer.com/api/v1/posts/schedule";

export const publishDealToPubler = async (product, postText, scheduleTime,publerMediaId) => {
  if (!config.PUBLER.API_KEY || config.PUBLER.ACCOUNTS.length === 0) {
    logger.error("Publer configuration missing. Cannot publish deal.");
    return null;
  }
  if (!publerMediaId) {
    logger.error(`Media ID missing for ASIN ${product.ASIN}. Cannot publish.`);
    return null;
  }
  const isoTimestamp = scheduleTime.toISOString();

    const posts = config.PUBLER.ACCOUNTS.map((accountId) => ({
    networks: {
      facebook: {
        type: "photo",
        text: postText,
        media: [
          {
            id: publerMediaId,
            type: "photo",
            alt_text: "Product image",
          },
        ],
      },
      instagram: {
        type: "photo",
        text: postText,
        media: [
          {
            id: publerMediaId,
            type: "photo",
          },
        ],
      },
    },
    accounts: [
      {
        id: accountId,
        scheduled_at: isoTimestamp,
      },
    ],
  }));

  const payload = {
    bulk: {
      state: "scheduled",
      posts,
    },
  };

  try {
    const response = await axios.post(PUBLER_API_URL, payload, {
      headers: {
        Authorization: `Bearer-API ${config.PUBLER.API_KEY}`,
        "Publer-Workspace-Id": config.PUBLER.WORKSPACE_ID,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });
    logger.info(
      `✅ Publer: Successfully scheduled post for ASIN ${product.ASIN}`
    );
    logger.debug(`Response: ${JSON.stringify(response.data)}`);
    await checkJobStatus(response.data.job_id);
    return response.data;
  } catch (error) {
    logger.error(`❌ Publer Error for ASIN ${product.ASIN}: ${error.message}`);
    if (error.response?.data) {
      logger.error(
        `Publer API Response Error: ${JSON.stringify(error.response.data)}`
      );
    }
    return null;
  }
};

const checkJobStatus = async (jobId) => {
  if (!jobId) {
    logger.error("❌ Job ID is missing. Cannot check job status.");
    return;
  }

  try {
    const response = await axios.get(
      `https://app.publer.com/api/v1/job_status/${jobId}`,
      {
        headers: {
          Authorization: `Bearer-API ${config.PUBLER.API_KEY}`,
          "Publer-Workspace-Id": config.PUBLER.WORKSPACE_ID,
        },
      }
    );

    if (response.data.status === "completed") {
      logger.info("✅ Job completed successfully!");
    } else if (response.data.status === "failed") {
      logger.error(`❌ Job failed: ${JSON.stringify(response.data.payload)}`);
    } else {
      logger.info("Job still processing...");
    }
  } catch (error) {
    logger.error(`Error checking job status: ${error.message}`);
  }
};
