const express = require('express');
const Comment = require('../models/Comment');
const Notice = require('../models/Notice');
const { authMiddleware } = require('../middleware/authMiddleware');
const { createNotification } = require('../services/notificationService');

const router = express.Router({ mergeParams: true });

const populateAuthor = { path: 'author', select: 'name email' };

router.get('/', async (req, res) => {
  try {
    const notice = await Notice.findById(req.params.noticeId);
    if (!notice) {
      return res.status(404).json({ message: 'Notice not found' });
    }

    const comments = await Comment.find({ notice: req.params.noticeId })
      .populate(populateAuthor)
      .sort({ createdAt: 1 });

    res.json(comments);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content?.trim()) {
      return res.status(400).json({ message: 'Comment content is required' });
    }

    const notice = await Notice.findById(req.params.noticeId);
    if (!notice) {
      return res.status(404).json({ message: 'Notice not found' });
    }

    const comment = await Comment.create({
      content: content.trim(),
      notice: req.params.noticeId,
      author: req.user._id,
    });

    await comment.populate(populateAuthor);
    await createNotification({
      recipient: notice.author,
      actor: req.user._id,
      notice: notice._id,
      comment: comment._id,
      type: 'comment',
      message: `${req.user.name} commented on your notice "${notice.title}"`,
      io: req.io,
    });

    req.io.emit('comment:created', { noticeId: req.params.noticeId, comment });
    res.status(201).json(comment);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
