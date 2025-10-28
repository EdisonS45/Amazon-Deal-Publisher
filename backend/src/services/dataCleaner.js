import config from '../config/index.js';
import logger from '../config/logger.js';

const extractNumber = str => {
    if (!str) return null;
    return Number(str.replace(/[^\d.]/g, "")) || null;
};

const extractCurrency = str => str.match(/[₹$€£]/)?.[0] || config.AMAZON.CURRENCY || "INR";


const cleanAndValidateProduct = (rawProduct, category) => {
    try {
        const asin = rawProduct.ASIN;
        const listing = rawProduct.Offers?.Listings?.[0] || {};
        
        if (!listing || !listing.Price || !rawProduct.ItemInfo?.Title?.DisplayValue) {
            logger.debug(`Skipping ASIN ${asin}: Missing essential data (price or title).`);
            return null;
        }

        const priceStr = listing.Price.DisplayAmount;
        const origPriceStr = listing.SavingBasis?.DisplayAmount;
        const currentPrice = extractNumber(priceStr);
        const originalPrice = extractNumber(origPriceStr) || currentPrice;
        const currency = extractCurrency(priceStr);

        let discountPercentage = 0;
        if (originalPrice > currentPrice && originalPrice > 0) {
            discountPercentage = parseFloat(((originalPrice - currentPrice) / originalPrice) * 100).toFixed(2);
            
            
        } else {
            discountPercentage = listing.Price?.Savings?.Percentage || 0;
        }
        const savingsAmount = originalPrice && currentPrice ? originalPrice - currentPrice : null;

        if (discountPercentage < config.MIN_DISCOUNT_PERCENT) {
            logger.debug(`Skipping ASIN ${asin}: Discount (${discountPercentage}%) below threshold.`);
            return null;
        }

        const brand = rawProduct.ItemInfo?.ByLineInfo?.Brand?.DisplayValue || null;
        const isPrimeEligible = listing.IsPrimeEligible || false;
        const availability = listing.Availability?.Message || 'Unknown';

        return {
            ASIN: asin,
            Title: rawProduct.ItemInfo.Title.DisplayValue,
            ProductURL: rawProduct.DetailPageURL,
            ImageURL: rawProduct.Images?.Primary?.Medium?.URL, 

            Price: currentPrice,
            OriginalPrice: originalPrice,
            Currency: currency,
            DiscountPercentage: Number(discountPercentage),
            SavingsAmount: savingsAmount,

            Brand: brand,                           
            IsPrimeEligible: isPrimeEligible,       
            Availability: availability,             

            Category: category,
            Marketplace: config.AMAZON.MARKETPLACE,
            LastUpdated: new Date(),
            IsPosted: false,
        };

    } catch (error) {
        logger.error(`Fatal error cleaning product data for ASIN ${rawProduct.ASIN}: ${error.message}`);
        return null;
    }
};

export const processRawDeals = (rawItems, category) => {
    const results = rawItems
        .map(item => cleanAndValidateProduct(item, category))
        .filter(item => item !== null); 

    return results;
};