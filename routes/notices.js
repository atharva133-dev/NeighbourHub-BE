const express = require('express');
const multer = require('multer');
const Notice = require('../models/Notice');
const Comment = require('../models/Comment');
const Community = require('../models/Community');
const { authMiddleware, adminMiddleware } = require('../middleware/authMiddleware');
const { sendEmergencyNoticeEmail } = require('../services/emailService');
const { createNotification } = require('../services/notificationService');
const { ensureStepOneNoticeFields } = require('../services/noticeSchemaService');
const { cloudinary, storage } = require('../config/cloudinary');

const router = express.Router();

const upload = multer({ storage });

ensureStepOneNoticeFields(Notice);

const populateAuthor = { path: 'author', select: 'name email avatarUrl' };

// Helper – verify user is a member of the given community
async function assertMember(communityId, userId) {
  const community = await Community.findById(communityId);
  if (!community) return { ok: false, status: 404, message: 'Community not found' };
  const isMember = community.members.some((m) => m.toString() === userId.toString());
  if (!isMember) return { ok: false, status: 403, message: 'You are not a member of this community' };
  return { ok: true, community };
}

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { communityId } = req.query;
    if (!communityId) {
      return res.status(400).json({ message: 'communityId query param is required' });
    }

    const check = await assertMember(communityId, req.user._id);
    if (!check.ok) return res.status(check.status).json({ message: check.message });

    const notices = await Notice.find({ communityId })
      .populate(populateAuthor)
      .sort({ pinned: -1, createdAt: -1 });
    res.json(notices);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    const { title, content, category, communityId } = req.body;
    if (!title || !content) {
      return res.status(400).json({ message: 'Title and content are required' });
    }
    if (!communityId) {
      return res.status(400).json({ message: 'communityId is required' });
    }

    const check = await assertMember(communityId, req.user._id);
    if (!check.ok) return res.status(check.status).json({ message: check.message });

    const noticeData = {
      title,
      content,
      category: category || 'General',
      author: req.user._id,
      communityId,
    };

    if (req.file) {
      noticeData.imageUrl = req.file.path;
      noticeData.imagePublicId = req.file.filename;
    }

    const notice = await Notice.create(noticeData);

    await notice.populate(populateAuthor);
    if (notice.category === 'Emergency') {
      await sendEmergencyNoticeEmail(notice, req.user);
    }

    req.io.to(communityId).emit('notice:created', notice);
    res.status(201).json(notice);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get single notice
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const notice = await Notice.findById(req.params.id).populate(populateAuthor);
    if (!notice) {
      return res.status(404).json({ message: 'Notice not found' });
    }

    // Verify membership
    const check = await assertMember(notice.communityId, req.user._id);
    if (!check.ok) return res.status(check.status).json({ message: check.message });

    res.json(notice);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get notices by user
router.get('/user/:userId', authMiddleware, async (req, res) => {
  try {
    const notices = await Notice.find({ author: req.params.userId })
      .populate(populateAuthor)
      .sort({ createdAt: -1 });
    res.json(notices);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch('/:id/like', authMiddleware, async (req, res) => {
  try {
    const notice = await Notice.findById(req.params.id);
    if (!notice) {
      return res.status(404).json({ message: 'Notice not found' });
    }

    const check = await assertMember(notice.communityId, req.user._id);
    if (!check.ok) return res.status(check.status).json({ message: check.message });

    const userId = req.user._id.toString();
    const authorId = notice.author;
    const likes = notice.get('likes') || [];
    const alreadyLiked = likes.some((likedUserId) => likedUserId.toString() === userId);

    if (alreadyLiked) {
      notice.set(
        'likes',
        likes.filter((likedUserId) => likedUserId.toString() !== userId)
      );
    } else {
      notice.set('likes', [...likes, req.user._id]);
    }

    await notice.save();

    if (!alreadyLiked) {
      await createNotification({
        recipient: authorId,
        actor: req.user._id,
        notice: notice._id,
        type: 'like',
        message: `${req.user.name} liked your notice "${notice.title}"`,
        io: req.io,
      });
    }

    await notice.populate(populateAuthor);
    req.io.to(notice.communityId.toString()).emit('notice:updated', notice);
    res.json(notice);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch('/:id/pin', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const notice = await Notice.findById(req.params.id);
    if (!notice) {
      return res.status(404).json({ message: 'Notice not found' });
    }

    notice.pinned = !notice.pinned;
    await notice.save();
    await notice.populate(populateAuthor);

    req.io.to(notice.communityId.toString()).emit('notice:updated', notice);
    res.json(notice);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const notice = await Notice.findById(req.params.id);
    if (!notice) {
      return res.status(404).json({ message: 'Notice not found' });
    }

    // Check if user is author or admin
    const isAuthor = notice.author.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';

    if (!isAuthor && !isAdmin) {
      return res.status(403).json({ message: 'You can only delete your own notices' });
    }

    // Delete image from Cloudinary if it exists
    if (notice.imagePublicId) {
      try {
        await cloudinary.uploader.destroy(notice.imagePublicId);
      } catch (cloudinaryErr) {
        console.error('Failed to delete image from Cloudinary:', cloudinaryErr);
        // Continue with notice deletion even if Cloudinary delete fails
      }
    }

    const communityId = notice.communityId.toString();
    await Notice.findByIdAndDelete(req.params.id);
    await Comment.deleteMany({ notice: notice._id });
    req.io.to(communityId).emit('notice:deleted', { id: notice._id });
    res.json({ message: 'Notice deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
