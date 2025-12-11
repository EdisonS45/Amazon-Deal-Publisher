import fs from "fs";
import path from "path";
import sharp from "sharp";
import fetch from "node-fetch";
import { GoogleGenAI } from "@google/genai";
import config from "../config/index.js";
import logger from "../config/logger.js";

const ensureDir = () => {
  const dir = path.join(process.cwd(), "posters");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
};

const fetchImage = async (url) => {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
};

const overlaySvg = (title, badge, price, orig, width = 1200, height = 1200) => Buffer.from(`
<svg width="${width}" height="${height}">
<rect x="0" y="${height - 220}" width="${width}" height="220" fill="rgba(0,0,0,0.55)"/>
<text x="40" y="${height - 150}" font-family="Helvetica" font-size="48" fill="white" font-weight="700">${title}</text>
<rect x="${width - 280}" y="40" width="240" height="80" rx="8" ry="8" fill="#ff4d4f"/>
<text x="${width - 160}" y="95" text-anchor="middle" font-family="Helvetica" font-size="44" fill="white">${badge}</text>
<text x="40" y="${height - 70}" font-family="Helvetica" font-size="46" fill="#ffffff">${price}</text>
<text x="250" y="${height - 70}" font-family="Helvetica" font-size="36" fill="#ddd" text-decoration="line-through">${orig}</text>
</svg>
`);

const geminiGenerateGroup = async (group) => {
  if (!config.GEMINI?.API_KEY) return null;
  try {
    const ai = new GoogleGenAI({ apiKey: config.GEMINI.API_KEY });
    const items = (group.items || []).slice(0, 4);
    const parts = [];

    for (const it of items) {
      const buf = await fetchImage(it.ImageURL);
      if (buf) {
        parts.push({ inlineData: { mimeType: "image/jpeg", data: buf.toString("base64") } });
      }
    }

    const prompt = `
Design a 1200x1200 promotional poster combining these products in a clean 2x2 grid.
Headline: "${group.title}"
Highlight: "${Math.max(...items.map(i => i.DiscountPercentage || 0))}% OFF"
Include "Shop Now" and one visible price "${items[0].Currency || ""}${items[0].Price || ""}".
Bright, professional e-commerce style.`;

    parts.push({ text: prompt });
    const res = await ai.models.generateContent({
      model: config.GEMINI.MODEL || "gemini-2.5-flash-image",
      contents: parts
    });

    const base64 = res?.response?.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
    if (!base64) return null;

    const filePath = path.join(ensureDir(), `group_${group.id}_${Date.now()}.jpg`);
    await fs.promises.writeFile(filePath, Buffer.from(base64, "base64"));
    logger.info(`Gemini group poster generated -> ${filePath}`);
    return filePath;
  } catch (e) {
    logger.warn(`Gemini group gen failed: ${e.message}`);
    return null;
  }
};

const localCollage = async (group) => {
  const items = (group.items || []).slice(0, 4);
  const buffers = await Promise.all(items.map(i => fetchImage(i.ImageURL)));
  const imgs = await Promise.all(buffers.map(async b => b ? sharp(b).resize(600,600).toBuffer() : sharp({create:{width:600,height:600,channels:3,background:'#ddd'}}).png().toBuffer()));
  const positions = [{l:0,t:0},{l:600,t:0},{l:0,t:600},{l:600,t:600}];
  const base = sharp({create:{width:1200,height:1200,channels:3,background:'#fff'}});
  const composites = imgs.map((b,i)=>({input:b,left:positions[i].l,top:positions[i].t}));
  const collage = await base.composite(composites).png().toBuffer();

  const svg = overlaySvg(group.title, `${Math.max(...items.map(i => i.DiscountPercentage||0))}% OFF`, `${items[0].Currency||""}${items[0].Price}`, `${items[0].Currency||""}${items[0].OriginalPrice}`);
  const outPath = path.join(ensureDir(), `group_${group.id}_${Date.now()}.jpg`);
  await sharp(collage).composite([{input:svg,top:0,left:0}]).jpeg({quality:90}).toFile(outPath);
  logger.info(`Local collage created -> ${outPath}`);
  return outPath;
};

export const generatePosterImage = async (itemOrGroup) => {
  try {
    const isGroup = !!(itemOrGroup && Array.isArray(itemOrGroup.items));
    if (isGroup) {
      const gem = await geminiGenerateGroup(itemOrGroup);
      if (gem) return gem;
      return await localCollage(itemOrGroup);
    } else {
      const deal = itemOrGroup;
      const buf = await fetchImage(deal.ImageURL);
      if (!buf) throw new Error("No image buffer");
      const svg = overlaySvg(deal.Title.split("-")[0], `${deal.DiscountPercentage}% OFF`, `${deal.Currency}${deal.Price}`, `${deal.Currency}${deal.OriginalPrice}`);
      const outPath = path.join(ensureDir(), `poster_${deal.ASIN}_${Date.now()}.jpg`);
      await sharp(buf).resize(1200,1200).composite([{input:svg,top:0,left:0}]).jpeg({quality:90}).toFile(outPath);
      logger.info(`Local single poster -> ${outPath}`);
      return outPath;
    }
  } catch (e) {
    logger.error(`Image generation failed: ${e.message}`);
    return null;
  }
};
