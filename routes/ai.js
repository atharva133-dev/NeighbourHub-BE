const express = require('express');
const { authMiddleware } = require('../middleware/authMiddleware');
const { suggestContent, improveContent, generateNotice } = require('../services/geminiService');

const router = express.Router();

// POST /api/ai/notice-assist
// Body: { mode: 'suggest' | 'improve' | 'generate', title?, content?, category, prompt? }
router.post('/notice-assist', authMiddleware, async (req, res) => {
  const { mode, title, content, category, prompt } = req.body;

  if (!mode) {
    return res.status(400).json({ message: 'mode is required' });
  }

  try {
    if (mode === 'suggest') {
      if (!title) return res.status(400).json({ message: 'title is required for suggest mode' });
      const result = await suggestContent({ title, category: category || 'General' });
      return res.json({ content: result });
    }

    if (mode === 'improve') {
      if (!content) return res.status(400).json({ message: 'content is required for improve mode' });
      const result = await improveContent({ title: title || '', content, category: category || 'General' });
      return res.json({ content: result });
    }

    if (mode === 'generate') {
      if (!prompt) return res.status(400).json({ message: 'prompt is required for generate mode' });
      const result = await generateNotice({ category: category || 'General', prompt });
      return res.json(result); // { title, content }
    }

    return res.status(400).json({ message: `Unknown mode: ${mode}` });
  } catch (err) {
    console.error('[AI Route] Gemini error:', err.status ?? '', err.message);

    // Give the user a helpful message based on error type
    if (err.status === 429 || (err.message && err.message.includes('429'))) {
      return res.status(429).json({
        message: 'AI quota exhausted for all models. Please wait a minute and try again, or check your Gemini API billing.',
      });
    }

    if (err.status === 400 || (err.message && err.message.includes('400'))) {
      return res.status(400).json({ message: 'Invalid request sent to AI. Try rephrasing your input.' });
    }

    if (err.status === 403 || (err.message && err.message.includes('API key'))) {
      return res.status(500).json({ message: 'AI API key is invalid or not authorised. Check GEMINI_API_KEY in .env.' });
    }

    res.status(500).json({ message: `AI request failed: ${err.message ?? 'Unknown error'}` });
  }
});

module.exports = router;
