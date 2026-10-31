const express = require('express');
const Maintenance = require('../models/Maintenance');
const { authMiddleware, adminMiddleware } = require('../middleware/authMiddleware');

const router = express.Router();

// Submit a maintenance request
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { title, description, category, priority, flatNo } = req.body;
    if (!title || !description || !flatNo) {
      return res.status(400).json({ message: 'Title, description, and flat number are required' });
    }
    if (!req.user.communityId) {
      return res.status(400).json({ message: 'You must be in a community to raise a request' });
    }

    const request = await Maintenance.create({
      community: req.user.communityId,
      raisedBy: req.user._id,
      title: title.trim(),
      description: description.trim(),
      category: category || 'Other',
      priority: priority || 'Medium',
      flatNo: flatNo.trim(),
    });

    const populated = await request.populate('raisedBy', 'name');

    // Emit socket event so admin dashboard updates in real time
    req.io?.to(req.user.communityId.toString()).emit('maintenance:created', populated);

    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get requests — resident sees own, admin sees all
router.get('/', authMiddleware, async (req, res) => {
  try {
    if (!req.user.communityId) return res.json([]);

    const filter = { community: req.user.communityId };
    if (req.user.role !== 'admin') filter.raisedBy = req.user._id;

    const requests = await Maintenance.find(filter)
      .populate('raisedBy', 'name')
      .sort({ createdAt: -1 });

    res.json(requests);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update status (admin only)
router.patch('/:id/status', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { status, adminNote } = req.body;
    const validStatuses = ['Open', 'In Progress', 'Resolved', 'Rejected'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const update = { status, adminNote: adminNote?.trim() || '' };
    if (status === 'Resolved') update.resolvedAt = new Date();

    const request = await Maintenance.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { new: true }
    ).populate('raisedBy', 'name');

    if (!request) return res.status(404).json({ message: 'Request not found' });

    req.io?.to(request.community.toString()).emit('maintenance:updated', request);

    res.json(request);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Delete request (owner or admin)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const request = await Maintenance.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Request not found' });

    const isOwner = request.raisedBy.toString() === req.user._id.toString();
    if (!isOwner && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorised' });
    }

    await request.deleteOne();
    res.json({ message: 'Request deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
