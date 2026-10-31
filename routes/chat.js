const express = require('express');
const Message = require('../models/Message');
const Community = require('../models/Community');
const User = require('../models/User');
const { authMiddleware } = require('../middleware/authMiddleware');

const router = express.Router();

const populateSender = { path: 'sender', select: 'name email avatarUrl flatNo role' };
const populateRecipient = { path: 'recipient', select: 'name email avatarUrl flatNo role' };

// Fetch messages (either for a group channel OR a 1-to-1 conversation)
router.get('/messages', authMiddleware, async (req, res) => {
  try {
    const { communityId, channel, recipientId } = req.query;
    if (!communityId) {
      return res.status(400).json({ message: 'communityId query param is required' });
    }

    let filter = { community: communityId };

    if (recipientId && recipientId !== 'null' && recipientId !== 'undefined') {
      // 1-to-1 DM messages between req.user._id and recipientId
      filter = {
        community: communityId,
        $or: [
          { sender: req.user._id, recipient: recipientId },
          { sender: recipientId, recipient: req.user._id },
        ],
      };
    } else {
      // Group channel messages
      const ch = channel || 'general';
      filter = {
        community: communityId,
        channel: ch,
        recipient: null,
      };
    }

    const messages = await Message.find(filter)
      .populate(populateSender)
      .populate(populateRecipient)
      .sort({ createdAt: 1 })
      .limit(100);

    // Mark messages as read by current user
    const unreadIds = messages
      .filter((m) => !m.readBy?.some((id) => (id?._id || id)?.toString() === req.user._id.toString()))
      .map((m) => m._id);

    if (unreadIds.length > 0) {
      await Message.updateMany(
        { _id: { $in: unreadIds } },
        { $addToSet: { readBy: req.user._id } }
      );
    }

    res.json(messages);
  } catch (err) {
    console.error('[GET /chat/messages error]:', err);
    res.status(500).json({ message: err.message });
  }
});

// Fetch active 1-to-1 DM conversations list for the current user
router.get('/conversations', authMiddleware, async (req, res) => {
  try {
    const { communityId } = req.query;
    if (!communityId) {
      return res.status(400).json({ message: 'communityId is required' });
    }

    // Find all DM messages where current user is sender or recipient
    const dmMessages = await Message.find({
      community: communityId,
      recipient: { $ne: null },
      $or: [{ sender: req.user._id }, { recipient: req.user._id }],
    })
      .populate(populateSender)
      .populate(populateRecipient)
      .sort({ createdAt: -1 });

    // Group by partner user ID
    const partnerMap = new Map();

    for (const msg of dmMessages) {
      if (!msg.sender || !msg.recipient) continue;

      const isSender = msg.sender._id?.toString() === req.user._id.toString();
      const partner = isSender ? msg.recipient : msg.sender;
      if (!partner || !partner._id) continue;

      const partnerId = partner._id.toString();
      const isUnread = !isSender && !msg.readBy?.some((id) => (id?._id || id)?.toString() === req.user._id.toString());

      if (!partnerMap.has(partnerId)) {
        partnerMap.set(partnerId, {
          partner,
          lastMessage: msg,
          unreadCount: isUnread ? 1 : 0,
        });
      } else {
        const entry = partnerMap.get(partnerId);
        if (isUnread) {
          entry.unreadCount += 1;
        }
      }
    }

    res.json(Array.from(partnerMap.values()));
  } catch (err) {
    console.error('[GET /chat/conversations error]:', err);
    res.status(500).json({ message: err.message });
  }
});

// Get community members list (to start a new 1-to-1 chat)
router.get('/members', authMiddleware, async (req, res) => {
  try {
    const { communityId } = req.query;
    if (!communityId) {
      return res.status(400).json({ message: 'communityId is required' });
    }

    const community = await Community.findById(communityId).populate(
      'members',
      'name email avatarUrl flatNo role'
    );
    if (!community) {
      return res.status(404).json({ message: 'Community not found' });
    }

    // Exclude current user and invalid member references
    const members = community.members || [];
    const otherMembers = members.filter(
      (m) => m && m._id && m._id.toString() !== req.user._id.toString()
    );

    res.json(otherMembers);
  } catch (err) {
    console.error('[GET /chat/members error]:', err);
    res.status(500).json({ message: err.message });
  }
});

// Send a message (Group channel or 1-to-1 DM)
router.post('/send', authMiddleware, async (req, res) => {
  try {
    const { communityId, channel, recipientId, text, imageUrl } = req.body;
    if (!text?.trim() && !imageUrl) {
      return res.status(400).json({ message: 'Message text or image is required' });
    }
    if (!communityId) {
      return res.status(400).json({ message: 'communityId is required' });
    }

    const messageData = {
      community: communityId,
      sender: req.user._id,
      recipient: (recipientId && recipientId !== 'null') ? recipientId : null,
      channel: (recipientId && recipientId !== 'null') ? 'dm' : (channel || 'general'),
      text: text?.trim() || '',
      imageUrl: imageUrl || '',
      readBy: [req.user._id],
    };

    const message = await Message.create(messageData);
    const populated = await Message.findById(message._id)
      .populate(populateSender)
      .populate(populateRecipient);

    // Socket.IO emission
    if (req.io) {
      const room = communityId.toString();
      req.io.to(room).emit('chat:message', populated);
    }

    res.status(201).json(populated);
  } catch (err) {
    console.error('[POST /chat/send error]:', err);
    res.status(500).json({ message: err.message });
  }
});

// Mark conversation as read
router.patch('/read', authMiddleware, async (req, res) => {
  try {
    const { communityId, channel, recipientId } = req.body;
    if (!communityId) {
      return res.status(400).json({ message: 'communityId is required' });
    }

    let filter = { community: communityId };
    if (recipientId && recipientId !== 'null') {
      filter.sender = recipientId;
      filter.recipient = req.user._id;
    } else {
      filter.channel = channel || 'general';
      filter.recipient = null;
    }

    await Message.updateMany(
      { ...filter, readBy: { $ne: req.user._id } },
      { $addToSet: { readBy: req.user._id } }
    );

    res.json({ message: 'Marked as read' });
  } catch (err) {
    console.error('[PATCH /chat/read error]:', err);
    res.status(500).json({ message: err.message });
  }
});

// Edit message (Sender only, within 5 minutes of sending)
router.patch('/messages/:id', authMiddleware, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) {
      return res.status(400).json({ message: 'Message text cannot be empty' });
    }

    const message = await Message.findById(req.params.id);
    if (!message) return res.status(404).json({ message: 'Message not found' });

    if (message.sender.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You can only edit your own messages' });
    }

    const diffMs = Date.now() - new Date(message.createdAt).getTime();
    const diffMins = diffMs / (1000 * 60);
    if (diffMins > 5) {
      return res.status(400).json({ message: 'Messages can only be edited within 5 minutes of sending' });
    }

    message.text = text.trim();
    message.isEdited = true;
    message.editedAt = new Date();
    await message.save();

    const populated = await Message.findById(message._id)
      .populate(populateSender)
      .populate(populateRecipient);

    if (req.io) {
      req.io.to(message.community.toString()).emit('chat:message-edited', populated);
    }

    res.json(populated);
  } catch (err) {
    console.error('[PATCH /chat/messages/:id error]:', err);
    res.status(500).json({ message: err.message });
  }
});

// Delete message (Sender within 5 minutes, or Admin anytime)
router.delete('/messages/:id', authMiddleware, async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);
    if (!message) return res.status(404).json({ message: 'Message not found' });

    const isOwner = message.sender.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: 'Not authorized to delete this message' });
    }

    if (isOwner && !isAdmin) {
      const diffMs = Date.now() - new Date(message.createdAt).getTime();
      const diffMins = diffMs / (1000 * 60);
      if (diffMins > 5) {
        return res.status(400).json({ message: 'Messages can only be deleted within 5 minutes of sending' });
      }
    }

    await message.deleteOne();

    if (req.io) {
      req.io.to(message.community.toString()).emit('chat:message-deleted', {
        id: req.params.id,
        channel: message.channel,
        senderId: message.sender,
        recipientId: message.recipient,
      });
    }

    res.json({ message: 'Message deleted', id: req.params.id });
  } catch (err) {
    console.error('[DELETE /chat/messages/:id error]:', err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
