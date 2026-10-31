const mongoose = require('mongoose');

function generatePassCode() {
  return 'VIS-' + Math.random().toString(36).substring(2, 6).toUpperCase();
}

const visitorSchema = new mongoose.Schema(
  {
    community: { type: mongoose.Schema.Types.ObjectId, ref: 'Community', required: true },
    host: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    guestName: { type: String, required: true, trim: true },
    guestPhone: { type: String, trim: true, default: '' },
    flatNo: { type: String, required: true, trim: true },
    visitDate: { type: Date, required: true },
    visitTime: { type: String, required: true },       // e.g. "14:00"
    visitEndTime: { type: String, default: '' },        // e.g. "16:00"
    purpose: { type: String, trim: true, default: '' },
    passCode: { type: String, default: generatePassCode, unique: true },
    status: { type: String, enum: ['active', 'expired', 'cancelled'], default: 'active' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Visitor', visitorSchema);
