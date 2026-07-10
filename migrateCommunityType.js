/**
 * One-time migration: set type = 'other' on all Community documents
 * that don't yet have a type field.
 *
 * Run once with:
 *   node migrateCommunityType.js
 */

require('dotenv').config();
const dns = require('dns');
const mongoose = require('mongoose');

// Use public DNS (same as server.js) so mongodb+srv SRV lookups work
dns.setServers(['8.8.8.8', '8.8.4.4']);

// Import the model AFTER dotenv is loaded so MONGO_URI is available
const Community = require('./models/Community');

async function migrate() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected');

    const result = await Community.updateMany(
      { type: { $exists: false } },   // communities that predate the type field
      { $set: { type: 'other' } }
    );

    console.log(`Migration complete. Updated ${result.modifiedCount} community document(s).`);
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('MongoDB disconnected');
  }
}

migrate();
