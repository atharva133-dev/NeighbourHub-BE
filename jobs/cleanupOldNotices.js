const Notice = require('../models/Notice');
const Comment = require('../models/Comment');
const { cloudinary } = require('../config/cloudinary');

// In-memory record of the last run result — readable by the admin API
let lastCleanupResult = {
  ranAt: null,
  deletedCount: 0,
};

/**
 * Delete notices older than 15 days (excluding pinned ones),
 * their Cloudinary images, and all associated comments.
 * Returns the number of notices deleted.
 */
async function cleanupOldNotices() {
  const cutoff = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000); // 15 days ago

  console.log(`[cleanup] Running notice cleanup. Cutoff: ${cutoff.toISOString()}`);

  let deletedCount = 0;

  // Find old, non-pinned notices
  const oldNotices = await Notice.find({
    createdAt: { $lt: cutoff },
    pinned: { $ne: true },
  }).select('_id imagePublicId');

  if (oldNotices.length === 0) {
    console.log('[cleanup] No old notices to delete.');
    lastCleanupResult = { ranAt: new Date(), deletedCount: 0 };
    return 0;
  }

  for (const notice of oldNotices) {
    try {
      // 1. Delete Cloudinary image if it exists
      if (notice.imagePublicId) {
        try {
          await cloudinary.uploader.destroy(notice.imagePublicId);
        } catch (imgErr) {
          console.warn(`[cleanup] Failed to delete Cloudinary image for notice ${notice._id}:`, imgErr.message);
        }
      }

      // 2. Delete all comments linked to this notice
      await Comment.deleteMany({ notice: notice._id });

      // 3. Delete the notice itself
      await Notice.findByIdAndDelete(notice._id);

      deletedCount++;
    } catch (err) {
      // One failure should not stop the whole run
      console.error(`[cleanup] Error deleting notice ${notice._id}:`, err.message);
    }
  }

  console.log(`[cleanup] Done. Deleted ${deletedCount} old notice(s).`);
  lastCleanupResult = { ranAt: new Date(), deletedCount };
  return deletedCount;
}

function getLastCleanupResult() {
  return lastCleanupResult;
}

module.exports = { cleanupOldNotices, getLastCleanupResult };
