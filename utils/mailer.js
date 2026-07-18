const nodemailer = require('nodemailer');

/**
 * Send an OTP verification email.
 * Transporter is created per-call so it always reads the latest env vars.
 * @param {string} to  - recipient email address
 * @param {string} otp - 6-digit OTP string
 */
async function sendOtpEmail(to, otp) {
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    // Force IPv4 — some hosts (e.g. Render) can't reach Gmail's IPv6 address
    // and the connection hangs until it fails with ENETUNREACH (~120s).
    family: 4,
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_PASS,
    },
    // Fail fast instead of blocking the request for two minutes.
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });

  await transporter.sendMail({
    from: `"NeighbourHub" <${process.env.GMAIL_USER}>`,
    to,
    subject: 'Your NeighbourHub verification code',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#f8fafc;border-radius:12px;">
        <h2 style="margin:0 0 8px;font-size:22px;color:#0f172a;">Verify your email</h2>
        <p style="margin:0 0 24px;color:#475569;font-size:15px;">
          Welcome to NeighbourHub! Use the code below to verify your account.
          It expires in <strong>5 minutes</strong>.
        </p>
        <div style="letter-spacing:10px;font-size:36px;font-weight:700;text-align:center;
                    background:linear-gradient(135deg,#7c3aed,#2563eb);
                    -webkit-background-clip:text;-webkit-text-fill-color:transparent;
                    padding:16px 0;">
          ${otp}
        </div>
        <p style="margin:24px 0 0;color:#94a3b8;font-size:13px;">
          If you didn't create an account, you can safely ignore this email.
        </p>
      </div>
    `,
  });
}

module.exports = { sendOtpEmail };
