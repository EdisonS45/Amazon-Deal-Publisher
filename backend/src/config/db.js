import mongoose from "mongoose";
import config from "./index.js"
import logger from "./logger.js";

const connectDB = async () => {
    try {
        await mongoose.connect(config.MONGO_URI);
        logger.info('MongoDB connected successfully.');
    } catch (err) {
        logger.error(`MongoDB connection error: ${err.message}`);
        process.exit(1); 
    }
};

export default connectDB