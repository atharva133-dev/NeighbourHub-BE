const express = require('express');
const Helper = require('../models/Helper');
const { authMiddleware } = require('../middleware/authMiddleware');

const router = express.Router();

// Get helpers for a specific community
router.get('/', authMiddleware, async (req, res) => {
  try {
    const communityId = req.query.communityId || req.user.communityId;
    if (!communityId) {
      return res.json([]);
    }

    const helpers = await Helper.find({ communityId }).sort({ category: 1, name: 1 });
    res.json(helpers);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Add helper to community (any member/admin of community)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, category, phone, description, communityId } = req.body;
    const targetCommunityId = communityId || req.user.communityId;

    if (!name || !category || !phone) {
      return res.status(400).json({ message: 'Name, category, and phone are required' });
    }
    if (!targetCommunityId) {
      return res.status(400).json({ message: 'Community ID is required' });
    }

    const helper = await Helper.create({
      communityId: targetCommunityId,
      name: name.trim(),
      category: category.trim(),
      phone: phone.trim(),
      description: description?.trim() || '',
    });

    res.status(201).json(helper);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update helper
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { name, category, phone, description } = req.body;
    const helper = await Helper.findByIdAndUpdate(
      req.params.id,
      { name, category, phone, description },
      { new: true, runValidators: true }
    );

    if (!helper) {
      return res.status(404).json({ message: 'Helper not found' });
    }

    res.json(helper);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Delete helper
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const helper = await Helper.findByIdAndDelete(req.params.id);
    if (!helper) {
      return res.status(404).json({ message: 'Helper not found' });
    }
    res.json({ message: 'Helper deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
