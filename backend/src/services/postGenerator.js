// src/services/postGenerator.js
import logger from "../config/logger.js";

/**
 * Utility: clean and shorten product titles for readability.
 * Removes marketing phrases like "with", "for", "True Wireless", "Bluetooth", etc.
 */
const cleanTitle = (title = "") => {
  try {
    let short = title.split(/[-,|:]/)[0].trim(); // take before - , | :
    // remove redundant marketing words
    short = short
      .replace(/\b(True Wireless|Bluetooth|Earbuds?|Headphones?|with Mic|with|Fast Charge|Charging|Smart|Portable|Wireless|TWS|Edition)\b/gi, "")
      .replace(/\s{2,}/g, " ") // collapse multiple spaces
      .trim();

    // capitalise first letter if missing
    return short.charAt(0).toUpperCase() + short.slice(1);
  } catch (e) {
    return title;
  }
};

/**
 * generateSocialCaption supports both:
 * - single deal (has ASIN)
 * - group { id, title, items: [...] }
 */
export const generateSocialCaption = (productOrGroup) => {
  if (!productOrGroup) {
    logger.error("Null input to generateSocialCaption");
    return null;
  }

  const isGroup = !!(productOrGroup && Array.isArray(productOrGroup.items));

  // ---------- SINGLE PRODUCT ----------
  if (!isGroup) {
    const {
      Title,
      Price,
      OriginalPrice,
      Currency,
      DiscountPercentage,
      ProductURL,
      Category,
    } = productOrGroup;

    if (!Title || !Price || !OriginalPrice || !Currency || !DiscountPercentage || !ProductURL) {
      logger.error("❌ Missing required product properties for caption");
      return null;
    }

    const cleanName = cleanTitle(Title);
    const discountText = `${DiscountPercentage}% OFF`;
    const priceText = `${Currency}${Price}`;
    const originalText = `${Currency}${OriginalPrice}`;
    const savings = Math.floor(OriginalPrice - Price);

    const categoryTag = (Category || "AmazonFinds").replace(/[^A-Za-z0-9]/g, "");

    const caption = `
🔥 ${discountText}! 🔥

${cleanName}
💰 ${priceText}  ~${originalText}~ 
💸 Save ${Currency}${savings}

🛒 Buy now: ${ProductURL}

#${categoryTag} #AmazonDeals #Sale
    `.trim();

    return caption;
  }

  // ---------- GROUP POST ----------
  const group = productOrGroup;
  const items = group.items || [];
  if (items.length === 0) {
    logger.error("Group contains no items for caption");
    return null;
  }

  const category = (group.category || items[0]?.Category || "Deals").replace(/[^A-Za-z0-9]/g, "");
  const topBadge = `🔥 Top ${items.length} ${category} Deals 🔥`;
  const titleLine = group.title ? `${group.title}\n\n` : "";

  // Short list (name + discount + price)
  const bullets = items.slice(0, 5).map((it, idx) => {
    const name = cleanTitle(it.Title);
    const price = `${it.Currency || ""}${it.Price || ""}`;
    const disc = `${it.DiscountPercentage || 0}%`;
    return `${idx + 1}️⃣ ${name} — ${disc} off — ${price}`;
  }).join("\n");

  // Add all available URLs
  const links = items.slice(0, 5).map((it, idx) => {
    if (!it.ProductURL) return null;
    return `${idx + 1}️⃣ ${it.ProductURL}`;
  }).filter(Boolean).join("\n");

  const caption = `
${topBadge}

${titleLine}${bullets}

🛒 Shop all deals 👇
${links}

#AmazonDeals #TopPicks #${category}
  `.trim();

  return caption;
};
