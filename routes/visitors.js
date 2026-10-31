const express = require('express');
const Visitor = require('../models/Visitor');
const { authMiddleware, adminMiddleware } = require('../middleware/authMiddleware');

const router = express.Router();

// Create a visitor pass
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { guestName, guestPhone, flatNo, visitDate, visitTime, visitEndTime, purpose } = req.body;
    if (!guestName || !flatNo || !visitDate || !visitTime) {
      return res.status(400).json({ message: 'Guest name, flat, date and time are required' });
    }
    if (!req.user.communityId) {
      return res.status(400).json({ message: 'You must be in a community to create a visitor pass' });
    }

    const pass = await Visitor.create({
      community: req.user.communityId,
      host: req.user._id,
      guestName: guestName.trim(),
      guestPhone: guestPhone?.trim() || '',
      flatNo: flatNo.trim(),
      visitDate: new Date(visitDate),
      visitTime,
      visitEndTime: visitEndTime || '',
      purpose: purpose?.trim() || '',
    });

    const populated = await pass.populate('host', 'name');
    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get visitor passes — residents see their own, admins see all
router.get('/', authMiddleware, async (req, res) => {
  try {
    if (!req.user.communityId) return res.json([]);

    const filter = { community: req.user.communityId };
    if (req.user.role !== 'admin') filter.host = req.user._id;

    const passes = await Visitor.find(filter)
      .populate('host', 'name')
      .sort({ visitDate: -1 });

    // Auto-expire passes whose visitDate has passed
    const now = new Date();
    const toExpire = passes.filter(
      (p) => p.status === 'active' && new Date(p.visitDate) < now
    );
    if (toExpire.length > 0) {
      const ids = toExpire.map((p) => p._id);
      await Visitor.updateMany({ _id: { $in: ids } }, { $set: { status: 'expired' } });
      passes.forEach((p) => {
        if (ids.some((id) => id.equals(p._id))) p.status = 'expired';
      });
    }

    res.json(passes);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Cancel a visitor pass
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const pass = await Visitor.findById(req.params.id);
    if (!pass) return res.status(404).json({ message: 'Pass not found' });

    const isOwner = pass.host.toString() === req.user._id.toString();
    if (!isOwner && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorised' });
    }

    await pass.deleteOne();
    res.json({ message: 'Pass cancelled' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
