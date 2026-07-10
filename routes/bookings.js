const express = require('express');
const Booking = require('../models/Booking');
const Community = require('../models/Community');
const { authMiddleware } = require('../middleware/authMiddleware');

const router = express.Router();

// GET /api/bookings/my — all bookings by the logged-in user
router.get('/my', authMiddleware, async (req, res) => {
  try {
    const bookings = await Booking.find({ bookedBy: req.user._id })
      .populate('community', 'name type')
      .sort({ date: 1, startTime: 1 });
    res.json(bookings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/bookings/:id — cancel a booking (soft delete)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    if (booking.status === 'cancelled') {
      return res.status(400).json({ message: 'Booking is already cancelled' });
    }

    // Ownership check: booker OR that community's admin
    const isBooker = booking.bookedBy.toString() === req.user._id.toString();
    let isCommunityAdmin = false;
    if (!isBooker) {
      const community = await Community.findById(booking.community).select('admin');
      isCommunityAdmin = community?.admin.toString() === req.user._id.toString();
    }

    if (!isBooker && !isCommunityAdmin) {
      return res.status(403).json({ message: 'You are not authorized to cancel this booking' });
    }

    booking.status = 'cancelled';
    await booking.save();

    // Notify community room
    req.io.to(booking.community.toString()).emit('amenity:booking-cancelled', {
      bookingId: booking._id,
    });

    res.json(booking);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
