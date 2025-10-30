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

  const formattedPrice = `${Currency}${Price}`;
  const formattedOriginalPrice = `${Currency}${OriginalPrice}`;
  

  const shortTitle = Title.split('-')[0].trim(); 
  
  const template = `✨ STEAL ALERT! ${shortTitle} ✨

You won't believe this price drop! Get the **${Title}** for just **${formattedPrice}**!

That's an instant **${DiscountPercentage}% OFF**—you save ${formattedOriginalPrice - formattedPrice}. This deal ends fast.

Why wait? Upgrade now and save big! 👇

🔗 Grab the deal here: ${ProductURL}

#AmazonMustHaves #DealOfTheDay #${shortTitle.replace(/[^A-Za-z0-9]/g, '').slice(0, 30)} #Savings #AmazonDealsDaily`;

  return template.trim();
};