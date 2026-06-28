const Notification = require('./notificationModel');

const notificationPopulate = [
  { path: 'actor', select: 'name email' },
  { path: 'notice', select: 'title category' },
  { path: 'comment', select: 'content' },
];

async function createNotification({ recipient, actor, notice, comment, type, message, io }) {
  try {
    if (!recipient || !type || !message) return null;

    const recipientId = recipient.toString();
    const actorId = actor?.toString();

    if (actorId && actorId === recipientId) return null;

    const notification = await Notification.create({
      recipient,
      actor,
      notice,
      comment,
      type,
      message,
    });

    await notification.populate(notificationPopulate);

    if (io) {
      io.emit('notification:created', {
        recipientId,
        notification,
      });
    }

    return notification;
  } catch (err) {
    console.error('Notification creation failed:', err.message);
    return null;
  }
}

module.exports = { createNotification, notificationPopulate };
