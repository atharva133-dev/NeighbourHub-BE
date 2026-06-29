const mongoose = require('mongoose');

const noticeSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    content: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: ['General', 'Event', 'Lost & Found', 'Emergency'],
      default: 'General',
    },
    priority: {
      type: String,
      enum: ['Low', 'Medium', 'High', 'Urgent'],
      default: 'Medium',
    },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    communityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Community', required: true },
    pinned: { type: Boolean, default: false },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    commentCount: { type: Number, default: 0 },
    imageUrl: { type: String },
    imagePublicId: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Notice', noticeSchema);
