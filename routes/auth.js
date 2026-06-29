const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Notice = require('../models/Notice');
const { authMiddleware, adminMiddleware } = require('../middleware/authMiddleware');
const { formatUser } = require('../utils/formatUser');

const router = express.Router();

const signToken = (user) =>
  jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });

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
      return res.status(409).json({ message: 'Email already registered' });
    }

    const role =
      email.toLowerCase() === process.env.ADMIN_EMAIL?.toLowerCase() ? 'admin' : 'user';

    const user = await User.create({ name, email, password, role });
    const token = signToken(user);

    res.status(201).json({
      token,
      user: formatUser(user),
    });
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

    const user = await User.findOne({ email: email.toLowerCase() }).populate('communityId', 'name code admin');
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid email or password' });
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

module.exports = router;
