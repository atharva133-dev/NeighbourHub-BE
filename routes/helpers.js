const express = require('express');
const Helper = require('../models/Helper');
const { authMiddleware, adminMiddleware } = require('../middleware/authMiddleware');

const router = express.Router();

// Get all helpers (public)
router.get('/', async (_req, res) => {
  try {
    const helpers = await Helper.find().sort({ category: 1, name: 1 });
    res.json(helpers);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Create helper (admin only)
router.post('/', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { name, category, phone, description } = req.body;
    if (!name || !category || !phone) {
      return res.status(400).json({ message: 'Name, category, and phone are required' });
    }

    const helper = await Helper.create({ name, category, phone, description });
    res.status(201).json(helper);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update helper (admin only)
router.put('/:id', authMiddleware, adminMiddleware, async (req, res) => {
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

// Delete helper (admin only)
router.delete('/:id', authMiddleware, adminMiddleware, async (req, res) => {
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
