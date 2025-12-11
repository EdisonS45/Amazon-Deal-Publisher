import config from "../config/index.js";

const VISUAL_CATEGORIES = [
  "fashion",
  "homeandkitchen",
  "electronics",
  "computers",
  "beauty",
  "toysandgames",
  "sportsandoutdoors",
  "furniture",
  "watches",
  "toolsandhomeimprovement",
  "gardenandoutdoor",
  "luxurybeauty",
];

const safeNum = (v) => (isNaN(Number(v)) ? 0 : Number(v));

export const shouldGenerateImage = (itemOrGroup, generatedCount = 0) => {
  if (generatedCount >= config.IMAGE_DECISION.MAX_GENERATIONS_PER_RUN) return false;

  const isGroup = !!(itemOrGroup && Array.isArray(itemOrGroup.items));
  let discount = 0, price = 0, visual = false, prime = 0;

  if (isGroup) {
    const items = itemOrGroup.items || [];
    const discounts = items.map((i) => safeNum(i.DiscountPercentage));
    const prices = items.map((i) => safeNum(i.Price));
    discount = Math.max(...discounts, 0);
    price = Math.max(...prices, 0);
    for (const i of items) {
      const cat = (i.Category || "").toLowerCase();
      if (VISUAL_CATEGORIES.includes(cat)) visual = true;
      if (i.IsPrimeEligible) prime++;
    }
  } else {
    const i = itemOrGroup;
    discount = safeNum(i.DiscountPercentage);
    price = safeNum(i.Price);
    const cat = (i.Category || "").toLowerCase();
    visual = VISUAL_CATEGORIES.includes(cat);
    if (i.IsPrimeEligible) prime = 1;
  }

  const category = (isGroup ? itemOrGroup.category : itemOrGroup.Category || "").toLowerCase();

  if (discount < config.IMAGE_DECISION.DISCOUNT_MIN) return false;
  if (price < config.IMAGE_DECISION.PRICE_MIN) return false;

  let score = 0;
  if (discount >= 70) score += 3;
  else if (discount >= 50) score += 2;
  if (price >= 500) score += 2;
  if (visual) score += 1;
  if (prime) score += 1;

  return score >= config.IMAGE_DECISION.SCORE_THRESHOLD;
};
