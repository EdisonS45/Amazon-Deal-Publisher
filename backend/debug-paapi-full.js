// debug-paapi-full.js
import amazonPaapi from "amazon-paapi";
import dotenv from "dotenv";
dotenv.config();

const commonParameters = {
  AccessKey: process.env.AMAZON_ACCESS_KEY,
  SecretKey: process.env.AMAZON_SECRET_KEY,
  PartnerTag: process.env.AMAZON_PARTNER_TAG,
  Marketplace: process.env.AMAZON_MARKETPLACE || "www.amazon.in",
  PartnerType: "Associates",
};

async function runTest() {
  try {
    const Resources = [
      "ItemInfo.Title",
      "Images.Primary.Large",
      "Offers.Listings.Price",
      "Offers.Listings.SavingBasis",
    ];

    const params = {
      SearchIndex: "All",        // safe fallback
      ItemCount: 1,
      ItemPage: 1,
      Resources,
      Keywords: "wireless earbuds", // concrete product phrase (not just "electronics")
      // SortBy: "Relevance" // omit to keep default
    };

    console.log("=== PA-API DEBUG TEST ===");
    console.log("Marketplace:", commonParameters.Marketplace);
    console.log("PartnerTag:", commonParameters.PartnerTag ? "provided" : "MISSING");
    console.log("Request params:", JSON.stringify(params, null, 2));

    const resp = await amazonPaapi.SearchItems(commonParameters, params);
    console.log("=== PA-API RESPONSE (success) ===");
    console.log(JSON.stringify(resp, null, 2));
  } catch (err) {
    console.error("=== PA-API ERROR ===");
    console.error("message:", err.message);
    // library-specific shape
    if (err.response) {
      try {
        console.error("status:", err.response.status);
        console.error("headers:", JSON.stringify(err.response.headers, null, 2));
      } catch (e) {}
      try {
        console.error("body:", JSON.stringify(err.response.data, null, 2));
      } catch (e) {
        console.error("body(raw):", err.response.data);
      }
    }
    // sometimes amazon-paapi throws with statusCode on the error object
    if (err.statusCode) console.error("statusCode:", err.statusCode);
    if (err.data) console.error("err.data:", JSON.stringify(err.data, null, 2));
    console.error("full error object (flattened):", JSON.stringify({
      name: err.name, code: err.code, message: err.message, stack: err.stack
    }, null, 2));
    process.exit(1);
  }
}

runTest();
