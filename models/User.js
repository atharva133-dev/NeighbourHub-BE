const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6 },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    bio: { type: String, trim: true, default: '' },
    avatarUrl: { type: String, default: '' },
    notificationPreferences: {
      likes: { type: Boolean, default: true },
      comments: { type: Boolean, default: true },
      emergency: { type: Boolean, default: true },
      emailAlerts: { type: Boolean, default: false },
    },
    privacySettings: {
      showName: { type: Boolean, default: true },
      publicProfile: { type: Boolean, default: true },
      onlineStatus: { type: Boolean, default: true },
    },
    communityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Community', default: null },
  },
  { timestamps: true }
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model('User', userSchema);
