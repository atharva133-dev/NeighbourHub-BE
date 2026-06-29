const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Model fallback chain: try each in order if the previous hits a quota/rate limit.
// Only models confirmed available for this API key (gemini-1.5-flash is NOT available).
const MODEL_CHAIN = [
  'gemini-2.0-flash-lite',   // cheapest, try first
  'gemini-2.5-flash-lite',   // next cheapest
  'gemini-2.5-flash',        // more capable fallback
  'gemini-2.0-flash',        // last resort
];

async function generateWithFallback(prompt) {
  let lastError;
  for (const modelName of MODEL_CHAIN) {
    try {
      const m = genAI.getGenerativeModel({ model: modelName });
      const result = await m.generateContent(prompt);
      return result.response.text().trim();
    } catch (err) {
      // Fall through on quota (429) OR model-not-found (404) errors
      const shouldFallback =
        err.status === 429 || err.status === 404 ||
        (err.message && (err.message.includes('429') || err.message.includes('404') || err.message.includes('not found')));
      if (shouldFallback) {
        console.warn(`[GeminiService] ${modelName} failed (${err.status ?? 'unknown'}), trying next model...`);
        lastError = err;
        continue;
      }
      throw err; // Re-throw non-quota/non-404 errors immediately
    }
  }
  throw lastError; // All models exhausted
}

/**
 * Suggest: given a title, generate detailed content for a community notice.
 */
async function suggestContent({ title, category }) {
  const prompt = `You are a helpful assistant for a neighbourhood community app called NeighbourHub.
A resident has started writing a notice with the title: "${title}"
Category: ${category}

Write a clear, friendly, and informative notice body (2-4 sentences) that a neighbour would post on a community board.
Do NOT include the title again. Only return the notice body text, no extra commentary.`;

  return generateWithFallback(prompt);
}

/**
 * Improve: polish the existing content text.
 */
async function improveContent({ title, content, category }) {
  const prompt = `You are a helpful writing assistant for NeighbourHub, a neighbourhood community app.
Improve the following community notice to make it clearer, more friendly, and professional.
Keep the same meaning and length. Only return the improved notice body text, no extra commentary.

Title: "${title}"
Category: ${category}
Original content: "${content}"`;

  return generateWithFallback(prompt);
}

/**
 * Generate: from a short user prompt + category, generate both title and content.
 */
async function generateNotice({ category, prompt: userPrompt }) {
  const prompt = `You are a helpful assistant for NeighbourHub, a neighbourhood community app.
A resident wants to post a "${category}" notice about: "${userPrompt}"

Generate a community notice in this exact JSON format (no markdown, no code blocks, just raw JSON):
{
  "title": "A concise notice title (max 10 words)",
  "content": "A clear, friendly notice body of 2-4 sentences."
}`;

  const raw = await generateWithFallback(prompt);

  // Strip any accidental markdown fences
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  const parsed = JSON.parse(cleaned);
  return { title: parsed.title, content: parsed.content };
}

module.exports = { suggestContent, improveContent, generateNotice };
