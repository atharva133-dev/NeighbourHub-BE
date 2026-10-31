const mongoose = require('mongoose');

const listingSchema = new mongoose.Schema(
  {
    community: { type: mongoose.Schema.Types.ObjectId, ref: 'Community', required: true },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: ['Electronics', 'Furniture', 'Books', 'Clothing', 'Services', 'Kitchen', 'Sports', 'Other'],
      default: 'Other',
    },
    price: { type: Number, default: 0, min: 0 },   // 0 = free
    condition: {
      type: String,
      enum: ['New', 'Like New', 'Good', 'Fair'],
      default: 'Good',
    },
    images: [{ type: String }],                    // Cloudinary URLs
    contactInfo: { type: String, trim: true, default: '' },
    status: { type: String, enum: ['available', 'sold'], default: 'available' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Listing', listingSchema);
