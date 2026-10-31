const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    communityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Community',
      required: true,
      index: true,
    },
    flatNo: { type: String, required: true, trim: true },
    residentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    month: { type: String, required: true, trim: true }, // e.g. "2026-08"
    amount: { type: Number, required: true },
    breakdown: [
      {
        label: { type: String, required: true }, // e.g. "Basic Maintenance"
        amount: { type: Number, required: true },
      },
    ],
    dueDate: { type: Date, required: true },
    status: {
      type: String,
      enum: ['pending', 'under_verification', 'paid', 'overdue'],
      default: 'pending',
      index: true,
    },
    paymentMode: {
      type: String,
      enum: ['upi', 'cash', 'cheque', 'neft', 'auto'],
      default: null,
    },
    utrNumber: { type: String, trim: true, default: '' },
    screenshotUrl: { type: String, default: '' },
    receiptNo: { type: String, default: '' },
    paidAt: { type: Date, default: null },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

// Unique payment per flat per month per community
paymentSchema.index({ communityId: 1, flatNo: 1, month: 1 }, { unique: true });

module.exports = mongoose.model('Payment', paymentSchema);
