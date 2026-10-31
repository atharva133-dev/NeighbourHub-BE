const express = require('express');
const router = express.Router();
const Payment = require('../models/Payment');
const { authMiddleware } = require('../middleware/authMiddleware');

// ── Helper: generate receipt number ──────────────────────────────────────────
function generateReceiptNo() {
  const now = new Date();
  const yr = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, '0');
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `REC-${yr}-${mo}-${rand}`;
}

// ── GET  /api/payments/my-dues  ───────────────────────────────────────────────
// Returns current month's payment record for logged-in resident
router.get('/my-dues', authMiddleware, async (req, res) => {
  try {
    const { communityId } = req.user;
    if (!communityId) return res.status(400).json({ message: 'No active community' });

    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    let payment = await Payment.findOne({ communityId, residentId: req.user.id, month });

    // Auto-create a pending bill if none exists
    if (!payment) {
      const dueDate = new Date(now.getFullYear(), now.getMonth(), 20);
      payment = await Payment.create({
        communityId,
        flatNo: req.user.flatNo || req.user.name || 'Resident',
        residentId: req.user.id,
        month,
        amount: 3300,
        breakdown: [
          { label: 'Basic Maintenance', amount: 2000 },
          { label: 'Security & Watchman', amount: 800 },
          { label: 'Lift & Power Backup', amount: 500 },
        ],
        dueDate,
        status: now > dueDate ? 'overdue' : 'pending',
      });
    }

    res.json(payment);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET  /api/payments/history  ───────────────────────────────────────────────
router.get('/history', authMiddleware, async (req, res) => {
  try {
    const { communityId } = req.user;
    const payments = await Payment.find({ communityId, residentId: req.user.id })
      .sort({ month: -1 })
      .limit(12);
    res.json(payments);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/payments/:id/submit-utr  ───────────────────────────────────────
// Resident submits UTR number + optional screenshot → under_verification
router.post('/:id/submit-utr', authMiddleware, async (req, res) => {
  try {
    const { utrNumber, screenshotUrl, paymentMode = 'upi' } = req.body;
    if (!utrNumber || utrNumber.trim().length < 8) {
      return res.status(400).json({ message: 'Valid UTR/Reference number is required (min 8 digits)' });
    }

    const payment = await Payment.findOne({ _id: req.params.id, residentId: req.user.id });
    if (!payment) return res.status(404).json({ message: 'Payment record not found' });
    if (payment.status === 'paid') return res.status(400).json({ message: 'This bill is already paid' });

    payment.utrNumber = utrNumber.trim();
    payment.screenshotUrl = screenshotUrl || '';
    payment.paymentMode = paymentMode;
    payment.status = 'under_verification';
    await payment.save();

    // Notify community room via socket
    req.io?.to(payment.communityId.toString()).emit('payment:submitted', {
      paymentId: payment._id,
      flatNo: payment.flatNo,
      month: payment.month,
    });

    res.json(payment);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/payments/:id/verify  ───────────────────────────────────────────
// Admin/Treasurer verifies & marks as paid
router.post('/:id/verify', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin only' });
    const { action, notes } = req.body; // action: 'approve' | 'reject'

    const payment = await Payment.findById(req.params.id);
    if (!payment) return res.status(404).json({ message: 'Payment not found' });

    if (action === 'approve') {
      payment.status = 'paid';
      payment.paidAt = new Date();
      payment.verifiedBy = req.user.id;
      payment.receiptNo = generateReceiptNo();
      payment.notes = notes || '';
    } else {
      payment.status = 'pending';
      payment.utrNumber = '';
      payment.screenshotUrl = '';
      payment.paymentMode = null;
      payment.notes = notes || 'Payment rejected. Please resubmit.';
    }

    await payment.save();
    res.json(payment);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/payments/:id/record-offline  ───────────────────────────────────
// Admin marks cash/cheque payment as paid manually
router.post('/:id/record-offline', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin only' });
    const { paymentMode = 'cash', notes = '' } = req.body;

    const payment = await Payment.findById(req.params.id);
    if (!payment) return res.status(404).json({ message: 'Payment not found' });

    payment.status = 'paid';
    payment.paymentMode = paymentMode;
    payment.paidAt = new Date();
    payment.verifiedBy = req.user.id;
    payment.receiptNo = generateReceiptNo();
    payment.notes = notes;
    await payment.save();

    res.json(payment);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET  /api/payments/admin/all  ────────────────────────────────────────────
// Admin gets all payment records for community
router.get('/admin/all', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin only' });
    const { communityId } = req.user;
    const { month } = req.query;

    const now = new Date();
    const targetMonth = month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const payments = await Payment.find({ communityId, month: targetMonth })
      .populate('residentId', 'name email flatNo')
      .sort({ status: 1, flatNo: 1 });

    res.json(payments);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
