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
    const { name, description, type, societyDetails, institutionDetails } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ message: 'Community name is required' });
    }

    const COMMUNITY_TYPES = ['society', 'college_school', 'other'];
    if (!type || !COMMUNITY_TYPES.includes(type)) {
      return res.status(400).json({
        message: `Community type is required and must be one of: ${COMMUNITY_TYPES.join(', ')}`,
      });
    }

    const code = await generateUniqueCode();

    const communityData = {
      name: name.trim(),
      description: description?.trim() || '',
      code,
      admin: req.user._id,
      members: [req.user._id],
      avatar: req.file?.path || '',
      type,
    };

    // Attach optional type-specific details if provided
    const safeParse = (val) => {
      if (!val) return null;
      if (typeof val === 'object') return val;
      try { return JSON.parse(val); } catch { return null; }
    };

    if (type === 'society') {
      const parsed = safeParse(societyDetails);
      if (parsed) {
        communityData.societyDetails = {
          totalUnits: parsed.totalUnits != null ? Number(parsed.totalUnits) : undefined,
          hasSecurityGate: Boolean(parsed.hasSecurityGate),
        };
      }
    }

    if (type === 'college_school') {
      const parsed = safeParse(institutionDetails);
      if (parsed) {
        communityData.institutionDetails = {
          institutionName: parsed.institutionName?.trim() || undefined,
          affiliatedBoard: parsed.affiliatedBoard?.trim() || undefined,
        };
      }
    }

    const community = await Community.create(communityData);

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

    const Notice = require('../models/Notice');
    const Comment = require('../models/Comment');
    
    // Delete notices and comments associated with this community
    await Notice.deleteMany({ communityId: community._id });
    await Comment.deleteMany({ communityId: community._id });

    // Update all users who have this community as their active community
    await User.updateMany({ communityId: community._id }, { communityId: null });
    await Community.findByIdAndDelete(community._id);

    res.json({ message: 'Community deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Admin (community-level): update moderation settings + guidelines
router.patch('/:id/settings', authMiddleware, async (req, res) => {
  try {
    // Fetch without population — we only need admin field for the check
    const community = await Community.findById(req.params.id);

    if (!community) {
      return res.status(404).json({ message: 'Community not found' });
    }

    if (community.admin.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the community admin can change moderation settings' });
    }

    const { moderationEnabled, communityGuidelines } = req.body;
    const updates = {};

    if (typeof moderationEnabled === 'boolean') {
      updates.moderationEnabled = moderationEnabled;
    }
    if (typeof communityGuidelines === 'string') {
      updates.communityGuidelines = communityGuidelines.slice(0, 1000).trim();
    }

    const updated = await Community.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true }
    ).populate('admin', 'name');

    res.json(formatCommunity(updated, req.user._id));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Admin (community-level): update type-specific details after creation
router.patch('/:id/details', authMiddleware, async (req, res) => {
  try {
    const community = await Community.findById(req.params.id);

    if (!community) {
      return res.status(404).json({ message: 'Community not found' });
    }

    if (community.admin.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the community admin can update community details' });
    }

    const { societyDetails, institutionDetails } = req.body;
    const updates = {};

    if (societyDetails !== undefined) {
      if (community.type !== 'society') {
        return res.status(400).json({
          message: 'societyDetails can only be set on a community of type "society"',
        });
      }
      updates.societyDetails = {
        totalUnits: societyDetails.totalUnits != null ? Number(societyDetails.totalUnits) : undefined,
        hasSecurityGate: Boolean(societyDetails.hasSecurityGate),
      };
    }

    if (institutionDetails !== undefined) {
      if (community.type !== 'college_school') {
        return res.status(400).json({
          message: 'institutionDetails can only be set on a community of type "college_school"',
        });
      }
      updates.institutionDetails = {
        institutionName: institutionDetails.institutionName?.trim() || undefined,
        affiliatedBoard: institutionDetails.affiliatedBoard?.trim() || undefined,
      };
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'No valid details provided to update' });
    }

    const updated = await Community.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true }
    ).populate('admin', 'name');

    res.json(formatCommunity(updated, req.user._id));
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
