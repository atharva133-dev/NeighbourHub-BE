const express = require('express');
const multer = require('multer');
const User = require('../models/User');
const Notice = require('../models/Notice');
const Comment = require('../models/Comment');
const { authMiddleware } = require('../middleware/authMiddleware');
const { cloudinary, avatarStorage, extractPublicId } = require('../config/cloudinary');
const { formatUser } = require('../utils/formatUser');

const router = express.Router();
const upload = multer({ storage: avatarStorage });

function parseJsonField(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function deleteAvatar(url) {
  const publicId = extractPublicId(url);
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (err) {
    console.error('Failed to delete avatar:', err);
  }
}

router.patch('/settings', authMiddleware, upload.single('avatar'), async (req, res) => {
  try {
    const { name, bio, removeAvatar } = req.body;
    const notificationPreferences = parseJsonField(req.body.notificationPreferences);
    const privacySettings = parseJsonField(req.body.privacySettings);
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (name?.trim()) user.name = name.trim();
    if (bio !== undefined) user.bio = bio;

    if (notificationPreferences) {
      for (const [key, value] of Object.entries(notificationPreferences)) {
        if (value !== undefined) user.notificationPreferences[key] = value;
      }
      user.markModified('notificationPreferences');
    }

    if (privacySettings) {
      for (const [key, value] of Object.entries(privacySettings)) {
        if (value !== undefined) user.privacySettings[key] = value;
      }
      user.markModified('privacySettings');
    }

    if (req.body.communityId !== undefined) {
      const Community = require('../models/Community');
      const community = await Community.findById(req.body.communityId);
      if (!community || !community.members.some((m) => m.equals(user._id))) {
        return res.status(403).json({ message: 'Not a member of this community' });
      }
      user.communityId = req.body.communityId || null;
    }

    if (removeAvatar === 'true' || removeAvatar === true) {
      if (user.avatarUrl) {
        await deleteAvatar(user.avatarUrl);
        user.avatarUrl = '';
      }
    } else if (req.file) {
      if (user.avatarUrl) {
        await deleteAvatar(user.avatarUrl);
      }
      user.avatarUrl = req.file.path;
    }

    await user.save();
    await user.populate('communityId', 'name code admin type');
    res.json(formatUser(user));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch('/password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current and new password are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters' });
    }

    const user = await User.findById(req.user._id);
    if (!user || !(await user.comparePassword(currentPassword))) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    user.password = newPassword;
    await user.save();

    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/account', authMiddleware, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ message: 'Password is required to delete your account' });
    }

    const user = await User.findById(req.user._id);
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Incorrect password' });
    }

    if (user.avatarUrl) {
      await deleteAvatar(user.avatarUrl);
    }

    await Notice.deleteMany({ author: user._id });
    await Comment.deleteMany({ author: user._id });
    await User.findByIdAndDelete(user._id);

    res.json({ message: 'Account deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
