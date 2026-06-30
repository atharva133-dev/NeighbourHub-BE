const express = require('express');
const { translate } = require('@vitalets/google-translate-api');
const { authMiddleware } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/', authMiddleware, async (req, res) => {
  const { text, targetLang } = req.body;

  if (!text || !targetLang) {
    return res.status(400).json({ message: 'text and targetLang are required' });
  }

  try {
    const result = await translate(text, { to: targetLang });
    res.json({ translatedText: result.text });
  } catch (err) {
    // Fallback: return original text so the UI never hard-breaks
    console.error('Translation error:', err.message);
    res.json({ translatedText: text });
  }
});

module.exports = router;
