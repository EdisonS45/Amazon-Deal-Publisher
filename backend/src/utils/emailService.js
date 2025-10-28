import nodemailer from 'nodemailer';
import logger from '../config/logger.js';
import config from '../config/index.js';

export const sendEmail = async ({ subject, text }) => {
    try {
        const transporter = nodemailer.createTransport({
            host: config.EMAIL.HOST,
            port: config.EMAIL.PORT,
            secure: config.EMAIL.SECURE, 
            auth: {
                user: config.EMAIL.USER,
                pass: config.EMAIL.PASS,
            },
        });

        await transporter.sendMail({
            from: `"Deal Fetcher Bot" <${config.EMAIL.USER}>`,
            to: config.EMAIL.TO,
            subject,
            text,
        });

        logger.info(`📧 Email sent successfully: ${subject}`);
    } catch (error) {
        logger.error(`Email sending failed: ${error.message}`);
    }
};
