const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Notice = require('../models/Notice');
const { authMiddleware, adminMiddleware } = require('../middleware/authMiddleware');
const { formatUser } = require('../utils/formatUser');
const { sendOtpEmail } = require('../utils/mailer');

const router = express.Router();

const signToken = (user) =>
  jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });

/** Generate a random 6-digit OTP string */
function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) {
      // If the user exists but is not verified, resend a fresh OTP
      if (!exists.isVerified) {
        const otp = generateOtp();
        const otpExpiry = new Date(Date.now() + 5 * 60 * 1000);
        // Use updateOne to bypass the bcrypt pre-save hook
        await User.updateOne(
          { _id: exists._id },
          { $set: { otp, otpExpiry } }
        );
        await sendOtpEmail(exists.email, otp);
        return res.status(200).json({ message: 'OTP sent', email: exists.email });
      }
      return res.status(409).json({ message: 'Email already registered' });
    }

    const role =
      email.toLowerCase() === process.env.ADMIN_EMAIL?.toLowerCase() ? 'admin' : 'user';

    const otp = generateOtp();
    const otpExpiry = new Date(Date.now() + 5 * 60 * 1000);

    const user = await User.create({ name, email, password, role, otp, otpExpiry, isVerified: false });

    await sendOtpEmail(user.email, otp);

    res.status(201).json({ message: 'OTP sent', email: user.email });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ message: 'Email and OTP are required' });
    }

    const user = await User.findOne({ email: email.toLowerCase() }).populate('communityId', 'name code admin type');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    if (user.isVerified) {
      return res.status(400).json({ message: 'Email already verified' });
    }
    if (!user.otp || !user.otpExpiry) {
      return res.status(400).json({ message: 'No OTP pending. Please register again.' });
    }
    if (new Date() > user.otpExpiry) {
      return res.status(400).json({ message: 'OTP has expired. Please request a new one.' });
    }
    if (user.otp !== otp.trim()) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    await User.updateOne(
      { _id: user._id },
      { $set: { isVerified: true, otp: null, otpExpiry: null } }
    );

    const token = signToken(user);
    res.json({ token, user: formatUser(user) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/resend-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    if (user.isVerified) {
      return res.status(400).json({ message: 'Email already verified' });
    }

    const otp = generateOtp();
    const otpExpiry = new Date(Date.now() + 5 * 60 * 1000);
    // Use updateOne to bypass the bcrypt pre-save hook
    await User.updateOne(
      { _id: user._id },
      { $set: { otp, otpExpiry } }
    );

    await sendOtpEmail(user.email, otp);

    res.json({ message: 'OTP sent' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await User.findOne({ email: email.toLowerCase() }).populate('communityId', 'name code admin type');
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    if (!user.isVerified) {
      await User.updateOne({ _id: user._id }, { $set: { isVerified: true } });
      user.isVerified = true;
    }

    const token = signToken(user);
    res.json({
      token,
      user: formatUser(user),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/me', authMiddleware, (req, res) => {
  res.json({ user: formatUser(req.user) });
});

// Update own profile
router.patch('/profile', authMiddleware, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) {
      return res.status(400).json({ message: 'Name is required' });
    }

    req.user.name = name.trim();
    await req.user.save();

    res.json({ user: formatUser(req.user) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Admin: list all users
router.get('/users', authMiddleware, adminMiddleware, async (_req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Admin: change user role
router.patch('/users/:id/role', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { role } = req.body;
    if (!['user', 'admin'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Admin: delete user
router.delete('/users/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Also remove their notices and comments
    await Notice.deleteMany({ author: user._id });
    const Comment = require('../models/Comment');
    await Comment.deleteMany({ author: user._id });

    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// Forgot password — send reset OTP
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const user = await User.findOne({ email: email.toLowerCase() });
    // Always respond 200 so we don't leak whether an email exists
    if (!user) {
      return res.status(200).json({ message: 'If that email is registered, a reset code has been sent.' });
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await User.updateOne({ _id: user._id }, { $set: { otp, otpExpiry } });
    console.log(`🔑 [RESET OTP] ${user.email} -> OTP: ${otp}`);

    // Reuse the existing mailer but with a reset-flavoured message
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASS },
    });

    await transporter.sendMail({
      from: `"NeighbourHub" <${process.env.GMAIL_USER}>`,
      to: user.email,
      subject: 'Reset your NeighbourHub password',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#f8fafc;border-radius:12px;">
          <h2 style="margin:0 0 8px;font-size:22px;color:#0f172a;">Reset your password</h2>
          <p style="margin:0 0 24px;color:#475569;font-size:15px;">
            Use the code below to reset your NeighbourHub password. It expires in <strong>10 minutes</strong>.
          </p>
          <div style="letter-spacing:10px;font-size:36px;font-weight:700;text-align:center;
                      background:linear-gradient(135deg,#6E8F73,#C97B5A);
                      -webkit-background-clip:text;-webkit-text-fill-color:transparent;
                      padding:16px 0;">
            ${otp}
          </div>
          <p style="margin:24px 0 0;color:#94a3b8;font-size:13px;">
            If you didn't request this, you can safely ignore this email. Your password won't change.
          </p>
        </div>
      `,
    });

    res.status(200).json({ message: 'If that email is registered, a reset code has been sent.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Reset password — verify OTP and set new password
router.post('/reset-password', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) {
      return res.status(400).json({ message: 'Email, OTP, and new password are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!user.otp || !user.otpExpiry) {
      return res.status(400).json({ message: 'No reset code pending. Please request a new one.' });
    }
    if (new Date() > user.otpExpiry) {
      return res.status(400).json({ message: 'Reset code has expired. Please request a new one.' });
    }
    if (user.otp !== otp.trim()) {
      return res.status(400).json({ message: 'Invalid reset code' });
    }

    // Use bcrypt directly so we bypass the pre-save hook confusion
    const bcrypt = require('bcryptjs');
    const hashed = await bcrypt.hash(newPassword, 10);

    await User.updateOne(
      { _id: user._id },
      { $set: { password: hashed, isVerified: true, otp: null, otpExpiry: null } }
    );

    res.json({ message: 'Password reset successfully. You can now sign in.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;

