import axios from "axios";
import FormData from "form-data";
import config from "../config/index.js";
import logger from "../config/logger.js";

export const uploadMediaToPubler = async (imageUrl) => {
    
    if (!imageUrl || typeof imageUrl !== 'string') {
        throw new Error("Cannot upload media: Image URL input is invalid or missing.");
    }
    
    let cleanImageUrl;
    try {
        const trimmedUrl = imageUrl.trim();


        if (trimmedUrl.length === 0) {
             throw new Error("URL is empty after trimming whitespace.");
        }

        cleanImageUrl = encodeURI(decodeURI(trimmedUrl));
        
    } catch (e) {

        logger.error(`❌ URL Sanitization Error: ${e.message}. Original URL: ${imageUrl}`);
        throw new Error("Invalid URL (failed sanitization)"); 
    }

    try {
        const imageResponse = await axios.get(cleanImageUrl, {
            responseType: 'stream'
        });
        

        return response.data;
    } catch (error) {
        logger.error(`❌ Failed to upload media to Publer: ${error.message}`);
        logger.error(`Problematic URL was: ${cleanImageUrl || imageUrl}`); 
        if (error.response?.data) {
            logger.error(`Publer upload error: ${JSON.stringify(error.response.data, null, 2)}`);
        }
        return null;
    }
};