const mongoose = require('mongoose');

const COMMUNITY_TYPES = ['society', 'college_school', 'other'];

const amenitySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    isBookable: { type: Boolean, default: true },
    capacity: { type: Number },
    operatingHours: { type: String, trim: true, default: '' },
    operatingDays: { type: [String], default: [] },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true } // each amenity gets its own _id for booking references
);

const communitySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    code: { type: String, required: true, unique: true, minlength: 6, maxlength: 6 },
    admin: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    avatar: { type: String, default: '' },
    moderationEnabled: { type: Boolean, default: true },
    communityGuidelines: { type: String, trim: true, default: '' },
    type: { type: String, enum: COMMUNITY_TYPES, required: true },
    // Optional type-specific details — only relevant for the matching type
    societyDetails: {
      totalUnits: { type: Number },
      hasSecurityGate: { type: Boolean, default: false },
    },
    institutionDetails: {
      institutionName: { type: String, trim: true },
      affiliatedBoard: { type: String, trim: true },
    },
    // Admin-configurable amenities (society only)
    amenities: [amenitySchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Community', communitySchema);
module.exports.COMMUNITY_TYPES = COMMUNITY_TYPES;
