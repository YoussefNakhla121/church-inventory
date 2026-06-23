const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD
  },
  family: 4
});

// Verify connection on startup
if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
  console.warn('WARNING: GMAIL_USER or GMAIL_APP_PASSWORD is not set — emails will not be sent.');
} else {
  transporter.verify((error) => {
    if (error) {
      console.error('Gmail connection error:', error.message);
    } else {
      console.log('Gmail mailer ready');
    }
  });
}

module.exports = transporter;
