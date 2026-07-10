require('dotenv').config();
const dns = require('dns');
const express = require('express');
const http = require('http');
const cors = require('cors');
const mongoose = require('mongoose');

// Use public DNS so mongodb+srv SRV lookups work when local DNS blocks them
dns.setServers(['8.8.8.8', '8.8.4.4']);
const { Server } = require('socket.io');

const authRoutes = require('./routes/auth');
const noticeRoutes = require('./routes/notices');
const commentRoutes = require('./routes/comments');
const notificationRoutes = require('./routes/notifications');
const userRoutes = require('./routes/users');
const helperRoutes = require('./routes/helpers');
const communityRoutes = require('./routes/community');
const aiRoutes = require('./routes/ai');
const translateRoutes = require('./routes/translate');
const adminRoutes = require('./routes/admin');
const amenityRoutes = require('./routes/amenities');
const bookingRoutes = require('./routes/bookings');
const cron = require('node-cron');
const { cleanupOldNotices } = require('./jobs/cleanupOldNotices');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST', 'PATCH', 'DELETE'] },
});

app.use(cors());
app.use(express.json());

app.use((req, _res, next) => {
  req.io = io;
  next();
});

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/notices', noticeRoutes);
app.use('/api/notices/:noticeId/comments', commentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/users', userRoutes);
app.use('/api/helpers', helperRoutes);
app.use('/api/community', communityRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/translate', translateRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/community/:id/amenities', amenityRoutes);
app.use('/api/bookings', bookingRoutes);

// Track online users per community room
// Map<communityId, Set<socketId>>
const communityOnline = new Map();

function getRoomCount(communityId) {
  return communityOnline.get(communityId)?.size || 0;
}

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Client joins a community room
  socket.on('community:join', (communityId) => {
    if (!communityId) return;
    const cid = communityId.toString();
    socket.join(cid);

    if (!communityOnline.has(cid)) communityOnline.set(cid, new Set());
    communityOnline.get(cid).add(socket.id);

    io.to(cid).emit('online:count', getRoomCount(cid));
    console.log(`Socket ${socket.id} joined community ${cid} | Room online: ${getRoomCount(cid)}`);
  });

  // Client leaves a community room
  socket.on('community:leave', (communityId) => {
    if (!communityId) return;
    const cid = communityId.toString();
    socket.leave(cid);

    communityOnline.get(cid)?.delete(socket.id);
    if (communityOnline.get(cid)?.size === 0) communityOnline.delete(cid);

    io.to(cid).emit('online:count', getRoomCount(cid));
    console.log(`Socket ${socket.id} left community ${cid} | Room online: ${getRoomCount(cid)}`);
  });

  socket.on('disconnect', () => {
    // Remove socket from all community rooms it was in
    for (const [cid, sockets] of communityOnline.entries()) {
      if (sockets.has(socket.id)) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          communityOnline.delete(cid);
        } else {
          io.to(cid).emit('online:count', sockets.size);
        }
      }
    }
    console.log('Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB connected');
    server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

    // Schedule daily cleanup at 2 AM
    cron.schedule('0 2 * * *', () => {
      console.log('[cron] Running scheduled notice cleanup...');
      cleanupOldNotices().catch((err) =>
        console.error('[cron] Cleanup failed:', err.message)
      );
    });

    // Run once on startup to catch any missed cleanups (e.g. server was down at 2 AM)
    cleanupOldNotices().catch((err) =>
      console.error('[startup cleanup] Failed:', err.message)
    );
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  });
