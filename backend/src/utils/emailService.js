import nodemailer from "nodemailer";
import logger from "../config/logger.js";
import config from "../config/index.js";

export const sendEmail = async ({ subject, text, html }) => {
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

    const senderName = "Amazon Deal Publisher";

    await transporter.sendMail({
      from: `"${senderName}" <${config.EMAIL.USER}>`,
      to: config.EMAIL.TO,
      subject,
      text,
      html,
    });

    logger.info(`📧 Email sent successfully: ${subject}`);
  } catch (error) {
    logger.error(`Email sending failed: ${error.message}`);
  }
};
