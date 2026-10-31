const jwt = require('jsonwebtoken');
const User = require('../models/User');

const authMiddleware = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id)
      .select('-password')
      .populate('communityId', 'name code admin type');
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    // Auto-fix: if user is the admin of their active community but role is 'user', promote them
    if (
      user.role === 'user' &&
      user.communityId?.admin?.toString() === user._id.toString()
    ) {
      user.role = 'admin';
      await User.findByIdAndUpdate(user._id, { role: 'admin' });
    }

    req.user = user;
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

const adminMiddleware = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
};

module.exports = { authMiddleware, adminMiddleware };
