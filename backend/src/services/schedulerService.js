import ContentPost from "../models/ContentPost.js";
import { NICHE_TO_PUBLER_MAP } from "../config/publishingConfig.js";
import { publishCarouselPost } from "./publerPublisher.js";
import logger from "../config/logger.js";
import config from "../config/index.js";
import fs from "fs"; 

export const runScheduler = async () => {
  logger.info("Scheduler service started. Checking for posts...");
  const postIntervalMs =
    (config.PUBLISHING.POST_INTERVAL_MINUTES || 15) * 60 * 1000;

  const postsToSchedule = await ContentPost.find({
    status: "READY_TO_POST",
  })
    .sort({ createdAt: 1 })
    .limit(10); 

  if (postsToSchedule.length === 0) {
    logger.info("Scheduler: No new posts to schedule.");
    return { scheduledCount: 0 };
  }

  logger.info(`Scheduler found ${postsToSchedule.length} posts to schedule.`);
  let scheduledCount = 0;
  
  const lastPost = await ContentPost.findOne({ status: 'POSTED' }).sort({ scheduled_at: -1 });
  let baseTime = lastPost?.scheduled_at ? new Date(lastPost.scheduled_at.getTime()) : new Date(Date.now());

  if (baseTime < new Date()) {
      baseTime = new Date(Date.now() + 60 * 1000); 
  }
  
  logger.info(`Base schedule time set to: ${baseTime.toLocaleString()}`);

  for (let i = 0; i < postsToSchedule.length; i++) {
    const post = postsToSchedule[i];

    try {
      const nicheConfig = NICHE_TO_PUBLER_MAP[post.niche_id];
      if (!nicheConfig) {
        throw new Error(`Invalid niche_id: ${post.niche_id}`);
      }
      const accountIds = nicheConfig.publer_account_ids;

      const scheduleTime = new Date(baseTime.getTime() + (i + 1) * postIntervalMs);

      const publerResponse = await publishCarouselPost(
        accountIds,
        post.caption,
        post.image_urls, 
        scheduleTime
      );

      if (publerResponse) {
        await ContentPost.updateOne(
          { _id: post._id },
          {
            $set: {
              status: "POSTED",
              scheduled_at: scheduleTime,
              publer_post_id: publerResponse.job_id || "N/A",
            },
          }
        );
        scheduledCount++;
        logger.info(
          `Scheduled post "${post.theme_name}" for ${scheduleTime.toLocaleString()}`
        );

        for (const localPath of post.image_urls) {
           if (fs.existsSync(localPath)) {
             fs.unlinkSync(localPath);
             logger.info(`Cleaned up local poster: ${localPath}`);
           }
        }
      } else {
        throw new Error("Publer API returned a null response.");
      }
    } catch (err) {
      logger.error(
        `Failed to schedule post "${post.theme_name}": ${err.message}`
      );
      await ContentPost.updateOne(
        { _id: post._id },
        { $set: { status: "ERROR" } }
      );
    }
  }
  logger.info(`Scheduler finished. ${scheduledCount} posts scheduled.`);
  return { scheduledCount }; 
};