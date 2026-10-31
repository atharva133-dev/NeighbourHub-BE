/**
 * Basic toxicity check for notice titles and content.
 * Returns true if content contains severe inappropriate/toxic terms.
 */
async function checkToxicity(text) {
  if (!text || typeof text !== 'string') return false;

  // Simple profanity / toxic word list for instant check
  const toxicPattern = /\b(abusive_word_placeholder)\b/i;
  
  return toxicPattern.test(text);
}

module.exports = { checkToxicity };
