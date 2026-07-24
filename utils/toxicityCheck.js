/**
 * Toxicity check using HuggingFace Inference API.
 * Falls back gracefully (returns false = non-toxic) on any error,
 * timeout, rate limit, cold start, or missing API key.
 */

const TOXICITY_THRESHOLD = 0.85;
const TIMEOUT_MS = 5000;
const HF_MODEL = 'unitary/toxic-bert';

/**
 * Check whether the given text is toxic.
 * @param {string} text
 * @returns {Promise<boolean>} true = toxic, false = safe (or check skipped)
 */
async function checkToxicity(text) {
  const apiKey = process.env.HUGGINGFACE_API_KEY;

  if (!apiKey) {
    console.warn('[toxicityCheck] HUGGINGFACE_API_KEY not set — skipping moderation');
    return false;
  }

  if (!text?.trim()) return false;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch(
      `https://api-inference.huggingface.co/models/${HF_MODEL}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ inputs: text.slice(0, 512) }),
        signal: controller.signal,
      }
    );

    clearTimeout(timer);

    // 503 = model cold start, 429 = rate limit — skip silently
    if (response.status === 503 || response.status === 429) {
      console.warn(`[toxicityCheck] HuggingFace returned ${response.status} — skipping`);
      return false;
    }

    if (!response.ok) {
      console.warn(`[toxicityCheck] HuggingFace returned ${response.status} — skipping`);
      return false;
    }

    const result = await response.json();

    // Response shape: [[{ label, score }, ...]]
    if (!Array.isArray(result) || !Array.isArray(result[0])) return false;

    const toxicLabel = result[0].find(
      (r) => r.label?.toLowerCase() === 'toxic'
    );

    if (!toxicLabel) return false;

    const isToxic = toxicLabel.score >= TOXICITY_THRESHOLD;
    if (isToxic) {
      console.log(`[toxicityCheck] Flagged — score: ${toxicLabel.score.toFixed(3)}`);
    }
    return isToxic;

  } catch (err) {
    // AbortError = timeout, TypeError = network error
    console.warn('[toxicityCheck] Skipped due to error:', err.message);
    return false;
  }
}

module.exports = { checkToxicity };
