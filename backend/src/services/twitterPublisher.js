import { TwitterApi } from "twitter-api-v2";
import logger from "../config/logger.js";
import config from "../config/index.js";

const twitterClient = new TwitterApi({
  appKey: process.env.TWITTER_API_KEY,
  appSecret: process.env.TWITTER_API_SECRET,
  accessToken: process.env.TWITTER_ACCESS_TOKEN,
  accessSecret: process.env.TWITTER_ACCESS_SECRET,
});

const rwClient = twitterClient.readWrite;
let twitterPostCount = 0;


export async function publishToTwitter(group) {
  if (!group || !group.items?.length) {
    logger.warn("🐦 No valid group or items. Skipping Twitter post.");
    return null;
  }

  if (config.TEST_MODE && twitterPostCount >= 1) {
    logger.info("🧪 TEST MODE: Skipping extra Twitter posts.");
    return null;
  }

  try {
    logger.info(`🐦 Preparing Twitter post for ${group.title}`);

    const mediaIds = [];
    for (let i = 0; i < Math.min(group.items.length, 4); i++) {
      const item = group.items[i];
      if (!item.ImageURL) continue;

      try {
        const res = await fetch(item.ImageURL);
        const buffer = Buffer.from(await res.arrayBuffer());
        const mediaId = await rwClient.v1.uploadMedia(buffer, { type: "image/jpeg" });
        mediaIds.push(mediaId);
      } catch (e) {
        logger.warn(`⚠️ Failed to upload image for ${item.Title}: ${e.message}`);
      }
    }

    const categoryName = group.category || "Deals";
    const header = `🔥 Top ${group.items.length} ${categoryName} Deals 🔥`;

    const productLines = group.items
      .slice(0, 4)
      .map((it, idx) => {
        const shortTitle = it.Title.split("|")[0].trim().split(" ").slice(0, 3).join(" ");
        const price = it.Price ? `₹${it.Price}` : "";
        const discount =
          it.DiscountPercentage || it.Discount
            ? `(-${String(it.DiscountPercentage || it.Discount).replace("%", "")}%)`
            : "";
        return `${idx + 1}. ${shortTitle} — ${price} ${discount}`;
      })
      .join("\n");

    const caption = `${header}\n\n${productLines}\n\n🔗 Links in comments 👇\n#AmazonDeals #TopPicks`;

    const mainTweet = await rwClient.v2.tweet({
      text: caption.slice(0, 275),
      media: mediaIds.length > 0 ? { media_ids: mediaIds } : undefined,
    });

    logger.info(`✅ Main tweet posted: https://x.com/i/web/status/${mainTweet.data.id}`);

    const linkLines = group.items
      .slice(0, 4)
      .map((it, idx) => `${idx + 1}️⃣ ${it.ProductURL.replace("https://www.", "https://")}`);

    let currentChunk = [];
    let currentLength = 0;
    const chunks = [];

    for (const line of linkLines) {
      if (currentLength + line.length + 2 > 270) {
        chunks.push(currentChunk);
        currentChunk = [line];
        currentLength = line.length;
      } else {
        currentChunk.push(line);
        currentLength += line.length + 2;
      }
    }
    if (currentChunk.length) chunks.push(currentChunk);

    let replyTo = mainTweet.data.id;
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkText = `🛍️ Product Links (${i + 1}/${chunks.length})\n\n${chunk.join(
        "\n"
      )}\n\n#LootDeals #AmazonOffers`;

      const reply = await rwClient.v2.reply(chunkText.slice(0, 275), replyTo);
      logger.info(`💬 Reply ${i + 1}/${chunks.length} posted successfully.`);
      replyTo = reply.data.id;
    }

    twitterPostCount++;
    return mainTweet;
  } catch (err) {
    logger.error(`❌ Twitter post failed for ${group.title}: ${err.message}`);
    return null;
  }
}
