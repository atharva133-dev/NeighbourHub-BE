const User = require('../models/User');

function hasSmtpConfig() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT);
}

function createTransporter() {
  let nodemailer;
  try {
    nodemailer = require('nodemailer');
  } catch {
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          }
        : undefined,
  });
}

async function sendEmergencyNoticeEmail(notice, author) {
  try {
    if (!hasSmtpConfig()) {
      console.warn('Emergency email skipped: SMTP_HOST and SMTP_PORT are not configured.');
      return { sent: false, skipped: true };
    }

    const recipients = await User.find({ _id: { $ne: author._id } }).select('email');
    const emails = recipients.map((user) => user.email).filter(Boolean);

    if (emails.length === 0) {
      return { sent: false, skipped: true };
    }

    const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'NeighbourHub <no-reply@neighbourhub.local>';
    const transporter = createTransporter();
    if (!transporter) {
      console.warn('Emergency email skipped: nodemailer is not installed.');
      return { sent: false, skipped: true };
    }

    await transporter.sendMail({
      from,
      to: from,
      bcc: emails,
      subject: `Emergency Notice: ${notice.title}`,
      text: `${author.name} posted an emergency notice on NeighbourHub.\n\n${notice.title}\n\n${notice.content}`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
          <h2 style="color: #dc2626;">Emergency Notice</h2>
          <p><strong>${author.name}</strong> posted an emergency notice on NeighbourHub.</p>
          <h3>${notice.title}</h3>
          <p>${notice.content}</p>
        </div>
      `,
    });

    return { sent: true, skipped: false };
  } catch (err) {
    console.error('Emergency email failed:', err.message);
    return { sent: false, skipped: false };
  }
}

module.exports = { sendEmergencyNoticeEmail };
