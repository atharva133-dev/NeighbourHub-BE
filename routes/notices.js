const express = require('express');
const Notice = require('../models/Notice');
const Comment = require('../models/Comment');
const { authMiddleware, adminMiddleware } = require('../middleware/authMiddleware');
const { sendEmergencyNoticeEmail } = require('../services/emailService');
const { createNotification } = require('../services/notificationService');
const { ensureStepOneNoticeFields } = require('../services/noticeSchemaService');

const router = express.Router();

ensureStepOneNoticeFields(Notice);

const populateAuthor = { path: 'author', select: 'name email' };

router.get('/', async (_req, res) => {
  try {
    const notices = await Notice.find()
      .populate(populateAuthor)
      .sort({ pinned: -1, createdAt: -1 });
    res.json(notices);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { title, content, category } = req.body;
    if (!title || !content) {
      return res.status(400).json({ message: 'Title and content are required' });
    }

    const notice = await Notice.create({
      title,
      content,
      category: category || 'General',
      author: req.user._id,
    });

    await notice.populate(populateAuthor);
    if (notice.category === 'Emergency') {
      await sendEmergencyNoticeEmail(notice, req.user);
    }

    req.io.emit('notice:created', notice);
    res.status(201).json(notice);
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
    req.io.emit('notice:updated', notice);
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

    req.io.emit('notice:updated', notice);
    res.json(notice);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const notice = await Notice.findByIdAndDelete(req.params.id);
    if (!notice) {
      return res.status(404).json({ message: 'Notice not found' });
    }

    await Comment.deleteMany({ notice: notice._id });
    req.io.emit('notice:deleted', { id: notice._id });
    res.json({ message: 'Notice deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
