const express = require('express');
const { authMiddleware, adminMiddleware } = require('../middleware/authMiddleware');
const { cleanupOldNotices, getLastCleanupResult } = require('../jobs/cleanupOldNotices');

const router = express.Router();

// POST /api/admin/cleanup-now — manual trigger for testing / admin use
router.post('/cleanup-now', authMiddleware, adminMiddleware, async (_req, res) => {
  try {
    const deletedCount = await cleanupOldNotices();
    res.json({
      message: `Cleanup complete. Deleted ${deletedCount} old notice(s).`,
      deletedCount,
      ranAt: new Date(),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/admin/cleanup-status — returns last run result
router.get('/cleanup-status', authMiddleware, adminMiddleware, (_req, res) => {
  res.json(getLastCleanupResult());
});

module.exports = router;
