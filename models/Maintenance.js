const mongoose = require('mongoose');

const maintenanceSchema = new mongoose.Schema(
  {
    community: { type: mongoose.Schema.Types.ObjectId, ref: 'Community', required: true },
    raisedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: ['Plumbing', 'Electrical', 'Carpentry', 'Cleaning', 'Lift', 'Security', 'Other'],
      default: 'Other',
    },
    priority: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Medium' },
    flatNo: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['Open', 'In Progress', 'Resolved', 'Rejected'],
      default: 'Open',
    },
    adminNote: { type: String, trim: true, default: '' },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Maintenance', maintenanceSchema);
