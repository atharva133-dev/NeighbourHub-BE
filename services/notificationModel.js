const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    notice: { type: mongoose.Schema.Types.ObjectId, ref: 'Notice' },
    comment: { type: mongoose.Schema.Types.ObjectId, ref: 'Comment' },
    type: {
      type: String,
      enum: ['like', 'comment'],
      required: true,
    },
    message: { type: String, required: true, trim: true },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

notificationSchema.index({ recipient: 1, read: 1, createdAt: -1 });

module.exports =
  mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
