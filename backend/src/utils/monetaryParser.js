/**
 * Shared monetary and percentage extraction utilities.
 * Used by RSS adapters and intelligence enrichment pipeline.
 */

/**
 * Extract a funding/monetary amount from text.
 * Handles patterns like:
 *   "$50M" or "$50m"         -> 50000000
 *   "$50 million"            -> 50000000
 *   "$1.5B" or "$1.5 billion"-> 1500000000
 *   "$50,000,000"            -> 50000000
 *   "raised $50M"            -> 50000000
 *
 * @param {string} text - Text to search for funding amounts.
 * @returns {number|null} The extracted funding amount in dollars, or null.
 */
function extractFundingAmount(text) {
  if (!text || typeof text !== 'string') return null;

  // Pattern 1: $NNN.NNM or $NNN.NNB (shorthand suffix)
  const shorthandMatch = text.match(/\$\s*([\d,]+(?:\.\d+)?)\s*([mMbBtT])\b/);
  if (shorthandMatch) {
    const num = parseFloat(shorthandMatch[1].replace(/,/g, ''));
    const suffix = shorthandMatch[2].toLowerCase();
    if (suffix === 'm') return num * 1_000_000;
    if (suffix === 'b') return num * 1_000_000_000;
    if (suffix === 't') return num * 1_000_000_000_000;
  }

  // Pattern 2: $NNN.NN million or $NNN.NN billion (word suffix)
  const wordMatch = text.match(/\$\s*([\d,]+(?:\.\d+)?)\s*(million|billion|trillion)/i);
  if (wordMatch) {
    const num = parseFloat(wordMatch[1].replace(/,/g, ''));
    const suffix = wordMatch[2].toLowerCase();
    if (suffix === 'million') return num * 1_000_000;
    if (suffix === 'billion') return num * 1_000_000_000;
    if (suffix === 'trillion') return num * 1_000_000_000_000;
  }

  // Pattern 3: $NNN,NNN,NNN (full numeric with commas, at least thousands)
  const fullNumMatch = text.match(/\$\s*([\d,]{5,})/);
  if (fullNumMatch) {
    const num = parseFloat(fullNumMatch[1].replace(/,/g, ''));
    if (!isNaN(num) && num > 0) return num;
  }

  return null;
}

/**
 * Extract a percentage delta from text.
 * Handles: "increase of 15%", "up 20%", "grew 30 percent", "rose by 12%", "decline of 5%"
 *
 * @param {string} text - Text to search.
 * @returns {{ value: number, direction: 'up'|'down' }|null}
 */
function extractPercentageDelta(text) {
  if (!text || typeof text !== 'string') return null;

  // Positive patterns
  const upMatch = text.match(/(?:increas|grew|rose|up|gain|jump|surge|climb|expand|boost)\w*\s+(?:of\s+|by\s+)?(\d+(?:\.\d+)?)\s*(?:%|percent)/i);
  if (upMatch) {
    return { value: parseFloat(upMatch[1]), direction: 'up' };
  }

  // Negative patterns
  const downMatch = text.match(/(?:decreas|declin|drop|fell|down|cut|slash|reduc|shrink)\w*\s+(?:of\s+|by\s+)?(\d+(?:\.\d+)?)\s*(?:%|percent)/i);
  if (downMatch) {
    return { value: parseFloat(downMatch[1]), direction: 'down' };
  }

  // Generic "N% increase/decrease"
  const genericMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:%|percent)\s*(increase|decrease|growth|decline|drop|rise|gain)/i);
  if (genericMatch) {
    const direction = /decrease|decline|drop/i.test(genericMatch[2]) ? 'down' : 'up';
    return { value: parseFloat(genericMatch[1]), direction };
  }

  return null;
}

module.exports = { extractFundingAmount, extractPercentageDelta };
