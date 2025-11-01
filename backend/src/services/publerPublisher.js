import axios from "axios";
import config from "../config/index.js";
import logger from "../config/logger.js";
import { uploadMediaToPubler } from "./publerMediaUpload.js";

const PUBLER_SCHEDULE_URL = "https://app.publer.com/api/v1/posts/schedule";
const PUBLER_JOB_STATUS_URL = "https://app.publer.com/api/v1/job_status/";

export const publishCarouselPost = async (
  accountIds,
  caption,
  localFilePaths,
  scheduleTime
) => {
  if (!config.PUBLER.API_KEY || !accountIds?.length) {
    logger.error("Publer config or accountIds missing. Cannot publish post.");
    return null;
  }

  if (!localFilePaths?.length) {
    logger.error("No images provided. Cannot publish.");
    return null;
  }

  logger.info(`Publishing post with ${localFilePaths.length} media file(s)...`);

  try {
    const mediaIds = [];
    for (const localPath of localFilePaths) {
      const mediaId = await uploadMediaToPubler(null, "post-image", localPath);
      if (mediaId) {
        mediaIds.push({
          id: mediaId,
          type: "image", 
          alt_text: "Product image",
        });
      } else {
        throw new Error(`Failed to upload media: ${localPath}`);
      }
    }
    logger.info(`All ${mediaIds.length} media files uploaded to Publer.`);

    const isoTimestamp = scheduleTime.toISOString();
    const isCarousel = mediaIds.length > 1;

    const posts = accountIds.map((accountId) => ({
      networks: {
        facebook: {
          type: isCarousel ? "album" : "photo",
          text: caption,
          media: mediaIds, 
        },
        instagram: {
          type: isCarousel ? "carousel" : "photo",
          text: caption,
          media: mediaIds,
        },
        twitter: {
          type: "photo",
          text: caption,
          media: mediaIds.slice(0, 4),
        },
      },
      accounts: [{ id: accountId, scheduled_at: isoTimestamp }],
    }));

    const payload = { bulk: { state: "scheduled", posts } };

    const response = await axios.post(PUBLER_SCHEDULE_URL, payload, {
      headers: {
        Authorization: `Bearer-API ${config.PUBLER.API_KEY}`, 
        "Publer-Workspace-Id": config.PUBLER.WORKSPACE_ID,
        "Content-Type": "application/json",
      },
    });

    logger.info(`📤 Publer response: ${JSON.stringify(response.data, null, 2)}`);

    const jobId = response.data.job_id;
    if (jobId) {
      logger.info(`✅ Publer: Successfully scheduled post job (Job ID: ${jobId}).`);
      checkJobStatus(jobId);
    } else {
      logger.error(`⚠️ Publer returned no job_id: ${JSON.stringify(response.data)}`);
    }

    return response.data;
  } catch (error) {
    logger.error(`❌ Publer Scheduling Error: ${error.message}`);
    if (error.response?.data) {
      logger.error(
        `Publer API Response: ${JSON.stringify(error.response.data)}`
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
    const response = await axios.get(`${PUBLER_JOB_STATUS_URL}${jobId}`, {
      headers: {
        Authorization: `Bearer-API ${config.PUBLER.API_KEY}`,
        "Publer-Workspace-Id": config.PUBLER.WORKSPACE_ID,
        "Content-Type": "application/json",
      },
    });
    logger.info(`📤 Publer response: ${JSON.stringify(response.data, null, 2)}`);

    const status = response.data.status;
    if (status === "completed") {
      logger.info("✅ Publer job completed successfully!");
    } else if (status === "failed") {
      logger.error(`❌ Publer job failed: ${JSON.stringify(response.data.payload)}`);
    } else {
      logger.info(`⏳ Publer job still processing (${status})...`);
    }
  } catch (error) {
    logger.error(`Error checking Publer job status: ${error.message}`);
  }
};
