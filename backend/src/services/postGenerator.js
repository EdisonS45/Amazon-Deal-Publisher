import logger from "../config/logger.js";

export const generateSocialCaption = (product) => {
  const {
    Title,
    Price,
    OriginalPrice,
    Currency,
    DiscountPercentage,
    ProductURL,
    Category,
  } = product;

  if (
    !Title ||
    !Price ||
    !OriginalPrice ||
    !Currency ||
    !DiscountPercentage ||
    !ProductURL
  ) {
    logger.error("❌ Missing required product properties for caption");
    return null;
  }

  const numericPrice = Math.floor(parseFloat(Price));
  const numericOriginalPrice = Math.floor(parseFloat(OriginalPrice));

  if (isNaN(numericPrice) || isNaN(numericOriginalPrice)) {
    logger.error("❌ Invalid numeric values for price or original price");
    return null;
  }

  const savings = Math.floor(numericOriginalPrice - numericPrice);

  const formattedPrice = `${Currency}${numericPrice}`;
  const formattedOriginalPrice = `${Currency}${numericOriginalPrice}`;

  const shortTitle = Title.split("-")[0].trim();
  const categoryTag = (Category || "AmazonFinds").replace(/[^A-Za-z0-9]/g, "");

  const template = `
🔥 ${DiscountPercentage}% OFF! 🔥

${shortTitle}

💰 Deal Price: ${formattedPrice}
🏷️ Was: ${formattedOriginalPrice}
💸 You Save: ${Currency}${savings}

LIMITED TIME OFFER!
🛒 SHOP HERE: ${ProductURL}

#AmazonDeal #${categoryTag} #Sale #LimitedTimeOffer
`;

  return template.trim();
};
