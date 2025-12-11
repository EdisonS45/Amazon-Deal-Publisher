import logger from "../config/logger.js";

const stripParenthesis = (s) => (s || "").replace(/\(.*?\)/g, "").replace(/\[.*?\]/g, "");
const takeFirstWords = (s, n = 6) =>
  (s || "")
    .split(/\s+/)
    .slice(0, n)
    .join(" ")
    .replace(/[,:;]+$/g, "")
    .trim();

const makeShortTitle = (fullTitle) => {
  if (!fullTitle) return "";
  let t = stripParenthesis(fullTitle);
  t = t.replace(/\s{2,}/g, " ").trim();
  const short = takeFirstWords(t, 6);
  return short.length < fullTitle.length ? short : fullTitle.slice(0, 100);
};

const safe = (v) => (v === undefined || v === null ? "" : String(v));

export const generateSocialCaption = (productOrGroup) => {
  if (!productOrGroup) {
    logger.error("Null input to generateSocialCaption");
    return null;
  }

  const isGroup = !!(productOrGroup && Array.isArray(productOrGroup.items));

  if (!isGroup) {
    const {
      Title,
      Price,
      OriginalPrice,
      Currency,
      DiscountPercentage,
      ProductURL,
      Category,
      Features,
      SalesRank,
      RatingsCount,
      StarRating,
    } = productOrGroup;

    if (!Title || !Price || !OriginalPrice || !Currency || !DiscountPercentage || !ProductURL) {
      logger.error("❌ Missing required product properties for caption");
      return null;
    }

    const numericPrice = Math.floor(Number(Price) || 0);
    const numericOriginalPrice = Math.floor(Number(OriginalPrice) || 0);
    const savings = Math.max(0, numericOriginalPrice - numericPrice);
    const formattedPrice = `${Currency}${numericPrice}`;
    const formattedOriginalPrice = `${Currency}${numericOriginalPrice}`;

    const shortTitle = makeShortTitle(Title);
    const categoryTag = (Category || "AmazonFinds").replace(/[^A-Za-z0-9]/g, "");

    let featureLine = "";
    if (Array.isArray(Features) && Features.length > 0) {
      featureLine = `• ${Features[0].slice(0, 120)}${Features[0].length > 120 ? "..." : ""}\n\n`;
    }

    const rankLine = SalesRank ? `🏆 Rank: ${SalesRank}\n` : "";
    const ratingLine = RatingsCount ? `⭐ ${StarRating || "N/A"} (${RatingsCount})\n` : "";

    const template = `
🔥 ${DiscountPercentage}% OFF

${shortTitle}

${featureLine}${rankLine}${ratingLine}
💰 ${formattedPrice} (Was ${formattedOriginalPrice})
💸 You Save: ${Currency}${savings}

Buy now:
🛒 ${ProductURL}

#AmazonDeal #${categoryTag} #Deal
`.trim();

    return template;
  } else {
    const group = productOrGroup;
    const items = group.items || [];
    if (items.length === 0) {
      logger.error("Group contains no items for caption");
      return null;
    }

    const maxPrice = Math.max(...items.map((it) => Number(it.Price || 0)));
    const headlineCategory = group.category || items[0]?.Category || "Deals";
    const headline = `Top ${items.length} ${headlineCategory} Deals under ${items[0]?.Currency || ""}${maxPrice}`;

    const bullets = items
      .slice(0, 10)
      .map((it, idx) => {
        const short = makeShortTitle(it.Title || "");
        const price = `${it.Currency || ""}${it.Price || ""}`;
        const disc = `${it.DiscountPercentage || 0}%`;
        const link = safe(it.ProductURL) || "";
        return `${idx + 1}. ${short} — ${disc} — ${price}${link ? `\n🔗 ${link}` : ""}`;
      })
      .join("\n\n");

    const firstFeatures = (items[0]?.Features || [])[0];
    const featureLine = firstFeatures ? `• ${firstFeatures.slice(0, 140)}${firstFeatures.length > 140 ? "..." : ""}\n\n` : "";

    const ctaUrl = items[0]?.ProductURL || "";

    const caption = `
${headline}

${featureLine}${bullets}

#AmazonDeals #TopPicks #AmazonOffers
`.trim();

    return caption;
  }
};
export default generateSocialCaption;
