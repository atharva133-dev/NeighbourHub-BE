const mongoose = require('mongoose');

const communitySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    code: { type: String, required: true, unique: true, minlength: 6, maxlength: 6 },
    admin: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    avatar: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Community', communitySchema);
