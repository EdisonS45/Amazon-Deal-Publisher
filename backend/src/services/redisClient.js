import { createClient } from 'redis';
import config from '../config/index.js';
import logger from '../config/logger.js';

const client = createClient({
    url: config.REDIS_URL,
});

client.on('error', (err) => logger.error(`Redis Client Error: ${err.message}`));
client.on('connect', () => logger.info('Redis connected successfully.'));

(async () => {
    try {
        await client.connect();
    } catch (e) {
        logger.error(`Failed to connect to Redis: ${e.message}`);
    }
})();


export const getFromCache = async (key) => {
    try {
        const cachedData = await client.get(key);
        if (cachedData) {
            logger.debug(`Cache HIT for key: ${key}`);
            return JSON.parse(cachedData);
        }
        logger.debug(`Cache MISS for key: ${key}`);
        return null;
    } catch (error) {
        logger.error(`Error reading from Redis cache: ${error.message}`);
        return null; 
    }
};


export const setToCache = async (key, value, ttl = config.CACHE_TTL_SECONDS) => {
    try {
        await client.setEx(key, ttl, JSON.stringify(value));
        logger.debug(`Set cache for key: ${key} with TTL: ${ttl}s`);
    } catch (error) {
        logger.error(`Error writing to Redis cache: ${error.message}`);
    }
};

export default client;