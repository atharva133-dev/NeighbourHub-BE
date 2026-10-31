const express = require('express');
const Listing = require('../models/Listing');
const { authMiddleware } = require('../middleware/authMiddleware');

const router = express.Router();

// Create a listing
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { title, description, category, price, condition, images, contactInfo } = req.body;
    if (!title || !description) {
      return res.status(400).json({ message: 'Title and description are required' });
    }
    if (!req.user.communityId) {
      return res.status(400).json({ message: 'You must be in a community to post a listing' });
    }

    const listing = await Listing.create({
      community: req.user.communityId,
      seller: req.user._id,
      title: title.trim(),
      description: description.trim(),
      category: category || 'Other',
      price: Number(price) || 0,
      condition: condition || 'Good',
      images: Array.isArray(images) ? images : [],
      contactInfo: contactInfo?.trim() || '',
    });

    const populated = await listing.populate('seller', 'name avatarUrl');
    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Browse all available listings in community
router.get('/', authMiddleware, async (req, res) => {
  try {
    if (!req.user.communityId) return res.json([]);

    const { category } = req.query;
    const filter = { community: req.user.communityId, status: 'available' };
    if (category && category !== 'All') filter.category = category;

    const listings = await Listing.find(filter)
      .populate('seller', 'name avatarUrl')
      .sort({ createdAt: -1 });

    res.json(listings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// My listings (including sold ones)
router.get('/my', authMiddleware, async (req, res) => {
  try {
    if (!req.user.communityId) return res.json([]);

    const listings = await Listing.find({
      community: req.user.communityId,
      seller: req.user._id,
    })
      .populate('seller', 'name avatarUrl')
      .sort({ createdAt: -1 });

    res.json(listings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update listing (owner only)
router.patch('/:id', authMiddleware, async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) return res.status(404).json({ message: 'Listing not found' });

    const isOwner = listing.seller.toString() === req.user._id.toString();
    if (!isOwner && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorised' });
    }

    const allowed = ['title', 'description', 'category', 'price', 'condition', 'images', 'contactInfo', 'status'];
    allowed.forEach((field) => {
      if (req.body[field] !== undefined) listing[field] = req.body[field];
    });

    await listing.save();
    await listing.populate('seller', 'name avatarUrl');
    res.json(listing);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Delete listing (owner or admin)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) return res.status(404).json({ message: 'Listing not found' });

    const isOwner = listing.seller.toString() === req.user._id.toString();
    if (!isOwner && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorised' });
    }

    await listing.deleteOne();
    res.json({ message: 'Listing removed' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
