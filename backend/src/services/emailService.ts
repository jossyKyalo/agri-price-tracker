import nodemailer from 'nodemailer';
import { logger } from '../utils/logger';  
 
interface EmailContent {
    to: string;
    subject: string;
    text: string;
    html: string;
}
 
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_PORT === '465',  
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,  
    },
    tls: {
        rejectUnauthorized: false
    }
});


export const sendEmail = async (content: EmailContent): Promise<void> => {
    try {
        const mailOptions = {
            from: `AgriPrice System <${process.env.SMTP_USER}>`,  
            to: content.to,
            subject: content.subject,
            text: content.text,
            html: content.html,
        };

        const info = await transporter.sendMail(mailOptions);
        logger.info(`Email sent to ${content.to}: ${info.messageId}`);
        
    } catch (error) {
        logger.error(`Error sending email to ${content.to}:`, error);
        throw new Error('Failed to send email.'); 
    }
};