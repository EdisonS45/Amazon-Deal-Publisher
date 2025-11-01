

export const CATEGORY_TO_NICHE_MAP = {
  // FASHION
  "Apparel": "FASHION",
  "Sunglasses": "FASHION",
  "Watches": "FASHION",
  "Shoes": "FASHION",
  "Jewellry": "FASHION",
  "Bags & luggage": "FASHION",
  "Handbags": "FASHION",
  "Kids apparel": "FASHION",
  "Fashion": "FASHION", // Adding common ones
  "Jewelry": "FASHION",
  "Luggage": "FASHION",

  // DAILY ESSENTIALS
  "HPC": "DAILY_ESSENTIALS", // HealthPersonalCare
  "Toys": "DAILY_ESSENTIALS",
  "Pets": "DAILY_ESSENTIALS",
  "Grocery": "DAILY_ESSENTIALS",
  "Baby": "DAILY_ESSENTIALS",
  "Bty": "DAILY_ESSENTIALS", // Beauty
  "Pharmacy": "DAILY_ESSENTIALS",
  "HealthPersonalCare": "DAILY_ESSENTIALS",
  "PetSupplies": "DAILY_ESSENTIALS",
  "ToysAndGames": "DAILY_ESSENTIALS",
  "Beauty": "DAILY_ESSENTIALS",
  "GroceryAndGourmetFood": "DAILY_ESSENTIALS",

  // HOME, KITCHEN & OUTDOORS
  "Home": "HOME_KITCHEN_OUTDOORS",
  "Kitchen": "HOME_KITCHEN_OUTDOORS",
  "Sports": "HOME_KITCHEN_OUTDOORS",
  "Automotive": "HOME_KITCHEN_OUTDOORS",
  "Industrial & scientific": "HOME_KITCHEN_OUTDOORS",
  "Home improvement": "HOME_KITCHEN_OUTDOORS",
  "Lawn & garden": "HOME_KITCHEN_OUTDOORS",
  "Furniture": "HOME_KITCHEN_OUTDOORS",
  "HomeAndKitchen": "HOME_KITCHEN_OUTDOORS",
  "ToolsAndHomeImprovement": "HOME_KITCHEN_OUTDOORS",
  "GardenAndOutdoor": "HOME_KITCHEN_OUTDOORS",
  "SportsAndOutdoors": "HOME_KITCHEN_OUTDOORS",
  "Industrial": "HOME_KITCHEN_OUTDOORS",

  // ELECTRONICS, APPLIANCES & ACCESSORIES
  "All electronics": "ELECTRONICS",
  "TV": "ELECTRONICS",
  "PC": "ELECTRONICS",
  "Camera": "ELECTRONICS",
  "small appliances": "ELECTRONICS",
  "musical instruments": "ELECTRONICS",
  "PCA": "ELECTRONICS",
  "Stationery coupons": "ELECTRONICS",
  "TV & appliances": "ELECTRONICS",
  "Electronics": "ELECTRONICS",
  "Computers": "ELECTRONICS",
  "Appliances": "ELECTRONICS",
  "MusicalInstruments": "ELECTRONICS",
  "OfficeProducts": "ELECTRONICS", // Stationery

  // BOOKS & ENTERTAINMENT
  "Books": "ENTERTAINMENT",
  "Video Games": "ENTERTAINMENT",
  "Movies": "ENTERTAINMENT",
  "VideoGames": "ENTERTAINMENT",
  "MoviesAndTV": "ENTERTAINMENT",
  "KindleStore": "ENTERTAINMENT",
  
  // Add any of othercategories that are missing
};

export const NICHE_TO_PUBLER_MAP = {
  "FASHION": {
    brand_name: "@StyleStealsDaily",
    publer_account_ids: [
      "6901e01d1a1afe47aedde520", 
      "6778626ce77c42842c59202e" 
    ]
  },
  "DAILY_ESSENTIALS": {
    brand_name: "@EverydayFindsHQ",
    publer_account_ids: ["6901e01d1a1afe47aedde520", "6778626ce77c42842c59202e"]
  },
  "HOME_KITCHEN_OUTDOORS": {
    brand_name: "@HomeHavenDeals",
    publer_account_ids: ["6901e01d1a1afe47aedde520", "6778626ce77c42842c59202e"]
  },

  "ELECTRONICS": {
    brand_name: "@GadgetGeekGarage",
    publer_account_ids: [
      "6901e01d1a1afe47aedde520", 
      "6778626ce77c42842c59202e"  
    ]
  },

  "ENTERTAINMENT": {
    brand_name: "@ReadAndPlayList",
    publer_account_ids: ["6901e01d1a1afe47aedde520", "6778626ce77c42842c59202e"]
  }
};



export const THEMES = [

  // --- THEME 1: TECH (WFH Ergonomics) ---
  {
    theme_name: "Top WFH Gadgets",
    niche_id: "ELECTRONICS",
    query: {
      find: {
        status: 'ENRICHED',
        niche_id: 'ELECTRONICS',
        $or: [
          { Title: { $regex: /laptop stand|monitor stand/i } },
          { Title: { $regex: /ergonomic mouse|vertical mouse/i } },
          { Title: { $regex: /webcam|ring light/i } },
        ],
      },
      sort: { sales_rank: 1, discount_percent: -1 },
      limit: 5,
    },
    ai_caption_prompt:
      "You are a Tech Ergonomics Expert. Create a carousel caption titled 'STOP THE SLOUCH: WFH Posture Fix.' Focus on solving desk-related pain points with clear, benefit-driven descriptions. End with 'Upgrade your setup — your back deserves it.'",
    ai_title_card_prompt:
      "A premium minimalist desk setup shot from a slight top-down angle. Natural daylight from the side. A laptop stand, monitor, and wireless mouse are neatly arranged. Add soft shadows for realism. Use white, wood, and muted blue-gray tones for calm productivity. Add clean overlay text: ‘WFH POSTURE FIX’. 1080x1080 composition.",
  },

  // --- THEME 2: HOME (50% OFF Kitchen Deals) ---
  {
    theme_name: "50% Off Kitchen Upgrades: Don’t Miss Out",
    niche_id: "HOME_KITCHEN_OUTDOORS",
    query: {
      find: {
        status: 'ENRICHED',
        niche_id: 'HOME_KITCHEN_OUTDOORS',
        category: { $in: ['Kitchen', 'HomeAndKitchen', 'Appliances'] },
        discount_percent: { $gt: 50 },
      },
      sort: { discount_percent: -1 },
      limit: 5,
    },
    ai_caption_prompt:
      "You are a Home Deals Curator. Write an urgent, value-packed caption titled '50% OFF: Kitchen Upgrades You Need Now!'. Highlight practicality, savings, and limited-time urgency.",
    ai_title_card_prompt:
      "Dynamic product flat-lay on a bright countertop: air fryer, coffee maker, and blender positioned diagonally for depth. Bright white background with accent pops of red to signal urgency. Add glossy ‘50% OFF’ badge in modern sans-serif type. Lighting: bright and crisp. Composition: balanced, center-weighted. 1080x1080.",
  },

  // --- THEME 3: FASHION (Trending Now) ---
  {
    theme_name: "Trending Now: Amazon’s Top 5 Must-Have Styles",
    niche_id: "FASHION",
    query: {
      find: {
        status: 'ENRICHED',
        niche_id: 'FASHION',
        sales_rank: { $ne: null },
      },
      sort: { sales_rank: 1 },
      limit: 5,
    },
    ai_caption_prompt:
      "You are a Fashion Trend Analyst. Write a stylish caption titled 'TREND ALERT: Top 5 Must-Have Styles.' Emphasize social proof and style descriptors.",
    ai_title_card_prompt:
      "A high-fashion editorial flat-lay. Items: sunglasses, wristwatch, bag, and shoes placed symmetrically over a soft marble background. Neutral tones — beige, taupe, gold accents. Add subtle text overlay: ‘TREND ALERT’. Lighting: soft studio glow with gentle shadows. Mood: chic and aspirational. 1080x1080.",
  },

  // --- THEME 4: DAILY ESSENTIALS (Hidden Gems) ---
  {
    theme_name: "Hidden Gems: Essential Finds Under $20",
    niche_id: "DAILY_ESSENTIALS",
    query: {
      find: {
        status: 'ENRICHED',
        niche_id: 'DAILY_ESSENTIALS',
        Price: { $lt: 2000 },
        discount_percent: { $gt: 20 },
      },
      sort: { Price: 1 },
      limit: 5,
    },
    ai_caption_prompt:
      "You are a Budget Discovery Blogger. Write a fun, conversational caption titled 'Hidden Gems: Under $20!' Make every product sound surprisingly useful.",
    ai_title_card_prompt:
      "Vibrant flat-lay featuring 6–8 small colorful daily items arranged neatly in a grid (mini tools, bottles, pouches). Soft diffused top-light for clarity. Background: matte white or pastel gradient. Add playful heading text: ‘HIDDEN GEMS UNDER $20’. Composition: geometric and well-spaced. 1080x1080.",
  },

  // --- THEME 5: HOME IMPROVEMENT (DIY Tools) ---
  {
    theme_name: "DIY Pro Kit: Tools Every Apartment Needs",
    niche_id: "HOME_KITCHEN_OUTDOORS",
    query: {
      find: {
        status: 'ENRICHED',
        niche_id: 'HOME_KITCHEN_OUTDOORS',
        category: { $in: ['ToolsAndHomeImprovement', 'Industrial'] },
      },
      sort: { discount_percent: -1 },
      limit: 5,
    },
    ai_caption_prompt:
      "You are a Home DIY Enthusiast. Write a practical caption titled 'DIY Pro Kit: Tools Every Apartment Needs.' Emphasize ease, durability, and real use-cases.",
    ai_title_card_prompt:
      "Top-down shot of an organized toolset on a textured wooden surface. Tools arranged in a grid — hammer, screwdriver, tape measure, pliers. Use contrast between steel and wood. Lighting: strong side-light with soft shadows for realism. Add text overlay: ‘DIY PRO KIT’. Mood: competent, reliable. 1080x1080.",
  },

  // --- THEME 6: FAMILY (Parents + Pets) ---
  {
    theme_name: "Sanity Savers: Top 5 Baby & Pet Essentials",
    niche_id: "DAILY_ESSENTIALS",
    query: {
      find: {
        status: 'ENRICHED',
        niche_id: 'DAILY_ESSENTIALS',
        category: { $in: ['Baby', 'PetSupplies'] },
      },
      sort: { sales_rank: 1 },
      limit: 5,
    },
    ai_caption_prompt:
      "You are a Parent & Pet Reviewer. Write a gentle caption titled 'Sanity Savers: Baby & Pet Essentials.' Highlight emotional and practical relief benefits.",
    ai_title_card_prompt:
      "Soft, heartwarming living-room scene with daylight glow. Baby bottle, wipes, and a pet toy arranged on a cozy rug. Background slightly blurred for depth. Warm pastel tones — soft pink, cream, baby blue. Add clean overlay text: ‘SANITY SAVERS’. Mood: calm, nurturing. 1080x1080.",
  },

  // --- THEME 7: FITNESS & WELLNESS ---
  {
    theme_name: "Sweat Smart: Top Fitness Gear This Week",
    niche_id: "DAILY_ESSENTIALS",
    query: {
      find: {
        status: 'ENRICHED',
        $or: [
          { Title: { $regex: /yoga mat|dumbbell|resistance band|foam roller/i } },
          { category: { $regex: /Sports|Fitness|Outdoors/i } },
        ],
      },
      sort: { sales_rank: 1 },
      limit: 5,
    },
    ai_caption_prompt:
      "You are a Fitness Coach. Write an energetic caption titled 'Sweat Smart: Top Fitness Gear This Week.' Focus on motivation and real results.",
    ai_title_card_prompt:
      "Dynamic flat-lay of workout essentials: yoga mat, dumbbells, towel, and water bottle. Angled composition for energy. Cool lighting with blue-gray tones. Add bold, sporty typography: ‘SWEAT SMART’. Mood: disciplined, active, inspiring. 1080x1080.",
  },

  // --- THEME 8: ELECTRONICS (Smart Living) ---
  {
    theme_name: "Smart Living: 5 Gadgets That Simplify Life",
    niche_id: "ELECTRONICS",
    query: {
      find: {
        status: 'ENRICHED',
        niche_id: 'ELECTRONICS',
        $or: [
          { Title: { $regex: /smart plug|smart bulb|tracker|assistant|air purifier/i } },
        ],
      },
      sort: { sales_rank: 1 },
      limit: 5,
    },
    ai_caption_prompt:
      "You are a Smart Home Enthusiast. Write a futuristic caption titled 'Smart Living: 5 Gadgets That Simplify Life.' Keep it clean and visionary.",
    ai_title_card_prompt:
      "Sleek modern living space with ambient lighting from smart bulbs and minimalist decor. Include visible smart home devices subtly glowing. Use cool blues, whites, and glass reflections. Overlay text: ‘SMART LIVING’. Lighting: futuristic and clean. Mood: modern comfort. 1080x1080.",
  },

  // --- THEME 9: ENTERTAINMENT (Chill & Unwind) ---
  {
    theme_name: "Weekend Wind-Down: Binge, Read, Relax",
    niche_id: "ENTERTAINMENT",
    query: {
      find: {
        status: 'ENRICHED',
        niche_id: 'ENTERTAINMENT',
        category: { $in: ['Books', 'MoviesAndTV', 'VideoGames'] },
      },
      sort: { discount_percent: -1 },
      limit: 5,
    },
    ai_caption_prompt:
      "You are a Pop Culture Curator. Write a cozy caption titled 'Weekend Wind-Down: Binge, Read, Relax.' Highlight escapism and calm leisure.",
    ai_title_card_prompt:
      "A cozy flat-lay scene: open book, coffee mug, wireless headphones, and a glowing controller on a blanket. Warm light from a bedside lamp. Brown, amber, and cream tones. Add relaxed typography: ‘WEEKEND WIND-DOWN’. Mood: chill, intimate, comforting. 1080x1080.",
  },

  // --- THEME 10: SEASONAL / LIMITED-TIME ---
  {
    theme_name: "Festive Deals You’ll Regret Missing 🎁",
    niche_id: "HOME_KITCHEN_OUTDOORS",
    query: {
      find: {
        status: 'ENRICHED',
        discount_percent: { $gt: 30 },
      },
      sort: { discount_percent: -1 },
      limit: 5,
    },
    ai_caption_prompt:
      "You are a Holiday Sale Expert. Write an upbeat caption titled 'Festive Deals You’ll Regret Missing 🎁.' Drive urgency with FOMO and gifting emotions.",
    ai_title_card_prompt:
      "Vibrant, festive layout with wrapped gifts, ribbons, ornaments, and discount tags on a warm background. Use deep reds, golds, and sparkles for celebration. Add bold text overlay ‘FESTIVE DEALS’. Lighting: warm, glowing, slightly vignetted edges. Mood: joyful urgency. 1080x1080.",
  },
];
