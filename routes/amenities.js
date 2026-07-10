const express = require('express');
const Community = require('../models/Community');
const Booking = require('../models/Booking');
const { authMiddleware, adminMiddleware } = require('../middleware/authMiddleware');

// mergeParams: true is REQUIRED so this router inherits :id from the parent mount
// app.use('/api/community/:id/amenities', amenityRoutes)
const router = express.Router({ mergeParams: true });

// ─── Shared helpers ───────────────────────────────────────────────────────────

/** Fetch community and assert it is a society. Returns community or sends error + null. */
async function assertSociety(req, res) {
  const community = await Community.findById(req.params.id);
  if (!community) {
    res.status(404).json({ message: 'Community not found' });
    return null;
  }
  if (community.type !== 'society') {
    res.status(400).json({ message: 'Amenities are only available for Society communities' });
    return null;
  }
  return community;
}

/** Returns true if userId is a member of the community. */
function assertMember(community, userId) {
  return community.members.some((m) => m.toString() === userId.toString());
}

// ─── Amenity routes ───────────────────────────────────────────────────────────

// POST /api/community/:id/amenities  — community admin adds a new amenity
router.post('/', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const community = await assertSociety(req, res);
    if (!community) return;

    if (community.admin.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the community admin can manage amenities' });
    }

    const { name, description, isBookable, capacity, operatingHours, operatingDays } = req.body;
    if (!name?.trim()) {
      return res.status(400).json({ message: 'Amenity name is required' });
    }

    community.amenities.push({
      name: name.trim(),
      description: description?.trim() || '',
      isBookable: typeof isBookable === 'boolean' ? isBookable : true,
      capacity: capacity != null ? Number(capacity) : undefined,
      operatingHours: operatingHours?.trim() || '',
      operatingDays: Array.isArray(operatingDays) ? operatingDays : [],
    });
    await community.save();

    const newAmenity = community.amenities[community.amenities.length - 1];
    res.status(201).json(newAmenity);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/community/:id/amenities/:amenityId  — community admin removes an amenity
router.delete('/:amenityId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const community = await assertSociety(req, res);
    if (!community) return;

    if (community.admin.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the community admin can manage amenities' });
    }

    const amenity = community.amenities.id(req.params.amenityId);
    if (!amenity) {
      return res.status(404).json({ message: 'Amenity not found' });
    }

    // Cascade: cancel all confirmed future bookings for this amenity
    const cancelResult = await Booking.updateMany(
      {
        community: community._id,
        amenityId: req.params.amenityId,
        status: 'confirmed',
        date: { $gte: new Date() },
      },
      { $set: { status: 'cancelled' } }
    );

    amenity.deleteOne();
    await community.save();

    res.json({
      message: 'Amenity deleted',
      cancelledBookings: cancelResult.modifiedCount,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/community/:id/amenities  — members view all amenities
router.get('/', authMiddleware, async (req, res) => {
  try {
    const community = await assertSociety(req, res);
    if (!community) return;

    if (!assertMember(community, req.user._id)) {
      return res.status(403).json({ message: 'You are not a member of this community' });
    }

    res.json(community.amenities);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Per-amenity booking routes ───────────────────────────────────────────────

// POST /api/community/:id/amenities/:amenityId/bookings  — member creates a booking
router.post('/:amenityId/bookings', authMiddleware, async (req, res) => {
  try {
    const community = await assertSociety(req, res);
    if (!community) return;

    if (!assertMember(community, req.user._id)) {
      return res.status(403).json({ message: 'You are not a member of this community' });
    }

    const amenity = community.amenities.id(req.params.amenityId);
    if (!amenity) {
      return res.status(404).json({ message: 'Amenity not found' });
    }
    if (!amenity.isBookable) {
      return res.status(400).json({ message: 'This amenity is not available for booking' });
    }

    const { date, startTime, endTime } = req.body;
    if (!date || !startTime || !endTime) {
      return res.status(400).json({ message: 'date, startTime, and endTime are required' });
    }
    if (startTime >= endTime) {
      return res.status(400).json({ message: 'startTime must be before endTime' });
    }

    const bookingDate = new Date(date);
    bookingDate.setUTCHours(0, 0, 0, 0);

    // Overlap check: existing.startTime < new.endTime AND existing.endTime > new.startTime
    const overlap = await Booking.findOne({
      community: community._id,
      amenityId: req.params.amenityId,
      status: 'confirmed',
      date: bookingDate,
      startTime: { $lt: endTime },
      endTime: { $gt: startTime },
    });

    if (overlap) {
      return res.status(409).json({ message: 'This slot is already booked' });
    }

    const booking = await Booking.create({
      community: community._id,
      amenityId: req.params.amenityId,
      amenityName: amenity.name,
      bookedBy: req.user._id,
      date: bookingDate,
      startTime,
      endTime,
    });

    await booking.populate('bookedBy', 'name email avatarUrl');

    req.io.to(req.params.id).emit('amenity:booked', {
      bookingId: booking._id.toString(),
      amenityId: req.params.amenityId,
      date: bookingDate.toISOString(),
      startTime,
      endTime,
      bookedBy: booking.bookedBy,
    });

    res.status(201).json(booking);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/community/:id/amenities/:amenityId/bookings  — member views bookings for an amenity
router.get('/:amenityId/bookings', authMiddleware, async (req, res) => {
  try {
    const community = await assertSociety(req, res);
    if (!community) return;

    if (!assertMember(community, req.user._id)) {
      return res.status(403).json({ message: 'You are not a member of this community' });
    }

    const amenity = community.amenities.id(req.params.amenityId);
    if (!amenity) {
      return res.status(404).json({ message: 'Amenity not found' });
    }

    const filter = {
      community: community._id,
      amenityId: req.params.amenityId,
      status: 'confirmed',
    };

    if (req.query.date) {
      const d = new Date(req.query.date);
      d.setUTCHours(0, 0, 0, 0);
      filter.date = d;
    }

    const bookings = await Booking.find(filter)
      .populate('bookedBy', 'name avatarUrl')
      .sort({ date: 1, startTime: 1 });

    res.json(bookings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
