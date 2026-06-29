const express = require('express');
const multer = require('multer');
const Community = require('../models/Community');
const User = require('../models/User');
const { authMiddleware } = require('../middleware/authMiddleware');
const { cloudinary, communityStorage, extractPublicId } = require('../config/cloudinary');
const { formatCommunity } = require('../utils/formatCommunity');

const router = express.Router();
const upload = multer({ storage: communityStorage });

async function generateUniqueCode() {
  for (let attempt = 0; attempt < 30; attempt++) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const exists = await Community.findOne({ code });
    if (!exists) return code;
  }
  throw new Error('Could not generate a unique community code');
}

function isMember(community, userId) {
  return community.members.some((m) => m.toString() === userId.toString());
}

router.post('/create', authMiddleware, upload.single('avatar'), async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ message: 'Community name is required' });
    }

    const code = await generateUniqueCode();
    const community = await Community.create({
      name: name.trim(),
      description: description?.trim() || '',
      code,
      admin: req.user._id,
      members: [req.user._id],
      avatar: req.file?.path || '',
    });

    await User.findByIdAndUpdate(req.user._id, { communityId: community._id });

    const populated = await Community.findById(community._id)
      .populate('admin', 'name')
      .populate('members', 'name');

    res.status(201).json(formatCommunity(populated, req.user._id));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/join', authMiddleware, async (req, res) => {
  try {
    const { code } = req.body;

    if (!code || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ message: 'A valid 6-digit code is required' });
    }

    const community = await Community.findOne({ code });
    if (!community) {
      return res.status(404).json({ message: 'Invalid community code' });
    }

    if (!isMember(community, req.user._id)) {
      community.members.push(req.user._id);
      await community.save();
    }

    await User.findByIdAndUpdate(req.user._id, { communityId: community._id });

    const populated = await Community.findById(community._id)
      .populate('admin', 'name')
      .populate('members', 'name');

    res.json(formatCommunity(populated, req.user._id));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/my', authMiddleware, async (req, res) => {
  try {
    const communities = await Community.find({ members: req.user._id })
      .populate('admin', 'name')
      .sort({ createdAt: -1 });

    res.json(communities.map((c) => formatCommunity(c, req.user._id)));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const community = await Community.findById(req.params.id).populate('admin', 'name');

    if (!community) {
      return res.status(404).json({ message: 'Community not found' });
    }

    if (!isMember(community, req.user._id)) {
      return res.status(403).json({ message: 'You are not a member of this community' });
    }

    res.json(formatCommunity(community, req.user._id));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const community = await Community.findById(req.params.id);

    if (!community) {
      return res.status(404).json({ message: 'Community not found' });
    }

    if (community.admin.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the community admin can delete this community' });
    }

    if (community.avatar) {
      const publicId = extractPublicId(community.avatar);
      if (publicId) {
        try {
          await cloudinary.uploader.destroy(publicId);
        } catch (err) {
          console.error('Failed to delete community avatar:', err);
        }
      }
    }

    await User.updateMany({ communityId: community._id }, { communityId: null });
    await Community.findByIdAndDelete(community._id);

    res.json({ message: 'Community deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/:id/leave', authMiddleware, async (req, res) => {
  try {
    const community = await Community.findById(req.params.id);
    if (!community) {
      return res.status(404).json({ message: 'Community not found' });
    }

    if (community.admin.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: 'Admin cannot leave the community. Delete it or transfer ownership first.' });
    }

    // Remove user from members
    community.members = community.members.filter(m => m.toString() !== req.user._id.toString());
    await community.save();

    // Remove active community if it matches
    const user = await User.findById(req.user._id);
    if (user.communityId && user.communityId.toString() === community._id.toString()) {
      user.communityId = null;
      await user.save();
    }
    
    // Return updated user object
    res.json({ message: 'Successfully left community', user: require('../utils/formatUser').formatUser(user) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
