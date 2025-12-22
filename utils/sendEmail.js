// utils/sendEmail.js
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: Number(process.env.SMTP_PORT) === 465, // true if port 465
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  // Extra debug (optional)
  // logger: true,
  // debug: true,
});

async function sendEmail({ to, subject, html, text , attachments}) {
  try {
    const info = await transporter.sendMail({
      from: process.env.MAIL_FROM || '"Cartime" <no-reply@cartime.app>',
      to,
      subject,
      html,
      text,
      attachments
    });

    console.log("📧 Email sent:", info.messageId);
  } catch (err) {
    console.error("❌ sendEmail error:", err);
    throw err; // so your /register catch sees it
  }
}



module.exports = sendEmail;