import { createObjectCsvWriter } from 'csv-writer';
import path from 'path';
import logger from '../config/logger.js';

const CSV_HEADERS = [
    { id: 'ASIN', title: 'ASIN' },
    { id: 'Title', title: 'Product Title' },
    { id: 'Price', title: 'Current Price' },
    { id: 'OriginalPrice', title: 'Original Price' },
    { id: 'Currency', title: 'Currency' },
    { id: 'DiscountPercentage', title: 'Discount %' },
    { id: 'SavingsAmount', title: 'Savings Amount' },
    { id: 'ProductURL', title: 'URL' },
    { id: 'ImageURL', title: 'Image URL' },
    { id: 'Category', title: 'Category' },
    { id: 'Brand', title: 'Brand' },
    { id: 'IsPrimeEligible', title: 'Prime' },
];

export const exportDealsToCsv = async (records) => {
    if (!records || records.length === 0) {
        logger.warn('CSV Export skipped: No records provided for export.');
        return null;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = path.join(process.cwd(), 'exports', `amazon_deals_${timestamp}.csv`);

    const csvWriter = createObjectCsvWriter({
        path: filePath,
        header: CSV_HEADERS,
    });

    try {
        await csvWriter.writeRecords(records);
        logger.info(`✅ Successfully exported ${records.length} deals to: ${filePath}`);
        return filePath;
    } catch (error) {
        logger.error(`❌ Error during CSV export: ${error.message}`);
        return null;
    }
};