import config from "../config/index.js";

const VISUAL_CATEGORIES = [
  "fashion",
  "homeandkitchen",
  "electronics",
  "jewelry",
  "computers",
  "toysandgames",
  "furniture",
  "sportsandoutdoors",
  "beauty",
  "luxurybeauty",
  "watches",
  "toolsandhomeimprovement",
  "gardenandoutdoor",
];

export const shouldGenerateImage = (deal, generationCountSoFar = 0) => {
  if (generationCountSoFar >= config.IMAGE_DECISION.MAX_GENERATIONS_PER_RUN) {
    return false;
  }

  const category = (deal.Category || "").toLowerCase();
  const forceCategories = ["giftcards"];
  if (forceCategories.includes(category)) {
    return true;
  }

  const discount = Number(deal.DiscountPercentage || 0);
  const price = Number(deal.Price || 0);

  if (discount < config.IMAGE_DECISION.DISCOUNT_MIN) return false;
  if (price < config.IMAGE_DECISION.PRICE_MIN) return false;

  let score = 0;

  if (discount >= 75) score += 4;
  else if (discount >= 50) score += 2;

  if (price >= 200) score += 3;
  else if (price >= 75) score += 2;

  if (VISUAL_CATEGORIES.includes(category)) score += 1;

  if (!!deal.IsPrime) score += 1;

  return score >= config.IMAGE_DECISION.SCORE_THRESHOLD;
};
