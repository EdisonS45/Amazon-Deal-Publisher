import config from '../config/index.js';

export const generateSocialCaption = (product) => {
  const { 
    Title, 
    Price, 
    OriginalPrice, 
    Currency, 
    DiscountPercentage, 
    ProductURL 
  } = product;

  if (!Title || !Price || !OriginalPrice || !Currency || !DiscountPercentage || !ProductURL) {
    logger.error('❌ Missing required product properties');
    return null;  
  }

  const numericPrice = Math.floor(parseFloat(Price));
  const numericOriginalPrice = Math.floor(parseFloat(OriginalPrice));

  if (isNaN(numericPrice) || isNaN(numericOriginalPrice)) {
    logger.error('❌ Invalid numeric values for price or original price');
    return null;
  }

  const savings = Math.floor(numericOriginalPrice - numericPrice);

  const formattedPrice = `${Currency}${numericPrice}`;
  const formattedOriginalPrice = `${Currency}${numericOriginalPrice}`;

  const shortTitle = Title.split('-')[0].trim();

  const template = `🔥 **${shortTitle}** – Now at an INSANE **${DiscountPercentage}% OFF!** 🔥

💰 Price Drop: **${formattedOriginalPrice} → ${formattedPrice}**
💸 You Save: **${Currency}${savings}**

🛒 Grab it before it’s gone!
👉 ${ProductURL}

#AmazonFinds #DealOfTheDay #MegaSavings #${shortTitle.replace(/[^A-Za-z0-9]/g, '').slice(0, 25)} #StealDeal #AmazonIndia`;

  return template.trim();
};
