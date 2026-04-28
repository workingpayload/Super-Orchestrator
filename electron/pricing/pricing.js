/**
 * Pricing table — USD per 1M tokens (input / output / cacheWrite / cacheRead).
 * Sources: vendor public pricing pages as of 2026-04. Update as needed.
 * Numbers below are per 1,000,000 tokens.
 */
const PRICE_TABLE = {
  // ─── Anthropic Claude ───
  'claude-opus-4-7':           { input: 15.00, output: 75.00, cacheWrite: 18.75, cacheRead: 1.50 },
  'claude-opus-4-6':           { input: 15.00, output: 75.00, cacheWrite: 18.75, cacheRead: 1.50 },
  'claude-opus-4':             { input: 15.00, output: 75.00, cacheWrite: 18.75, cacheRead: 1.50 },
  'claude-sonnet-4-6':         { input:  3.00, output: 15.00, cacheWrite:  3.75, cacheRead: 0.30 },
  'claude-sonnet-4':           { input:  3.00, output: 15.00, cacheWrite:  3.75, cacheRead: 0.30 },
  'claude-haiku-4-5-20251001': { input:  1.00, output:  5.00, cacheWrite:  1.25, cacheRead: 0.10 },
  'claude-haiku-4-5':          { input:  1.00, output:  5.00, cacheWrite:  1.25, cacheRead: 0.10 },
  'claude-3-5-sonnet':         { input:  3.00, output: 15.00, cacheWrite:  3.75, cacheRead: 0.30 },

  // ─── Google Gemini ───
  'gemini-2.5-pro':            { input:  1.25, output: 10.00, cacheWrite: 0,     cacheRead: 0.31 },
  'gemini-2.5-flash':          { input:  0.30, output:  2.50, cacheWrite: 0,     cacheRead: 0.075 },
  'gemini-2.0-flash':          { input:  0.10, output:  0.40, cacheWrite: 0,     cacheRead: 0.025 },

  // ─── OpenAI Codex / GPT ───
  'o4-mini':                   { input:  1.10, output:  4.40, cacheWrite: 0,     cacheRead: 0.275 },
  'o3':                        { input:  2.00, output:  8.00, cacheWrite: 0,     cacheRead: 0.50 },
  'o3-mini':                   { input:  1.10, output:  4.40, cacheWrite: 0,     cacheRead: 0.55 },
  'gpt-4.1':                   { input:  2.00, output:  8.00, cacheWrite: 0,     cacheRead: 0.50 },
  'gpt-4o':                    { input:  2.50, output: 10.00, cacheWrite: 0,     cacheRead: 1.25 },
  'gpt-4o-mini':               { input:  0.15, output:  0.60, cacheWrite: 0,     cacheRead: 0.075 },
};

const DEFAULT_PRICE_BY_TYPE = {
  claude: PRICE_TABLE['claude-sonnet-4-6'],
  gemini: PRICE_TABLE['gemini-2.5-flash'],
  codex:  PRICE_TABLE['o4-mini'],
  custom: { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 },
};

function lookupPrice(type, model) {
  if (model && PRICE_TABLE[model]) return PRICE_TABLE[model];
  if (model) {
    const exact = Object.keys(PRICE_TABLE).find(k => model.startsWith(k));
    if (exact) return PRICE_TABLE[exact];
  }
  return DEFAULT_PRICE_BY_TYPE[type] || DEFAULT_PRICE_BY_TYPE.custom;
}

/**
 * Compute USD cost for usage. Tokens may be undefined (treated as 0).
 * @param {object} usage { inputTokens, outputTokens, cacheWriteTokens, cacheReadTokens }
 * @param {string} type 'claude' | 'gemini' | 'codex' | 'custom'
 * @param {string} model model identifier
 * @returns {number} cost in USD
 */
function computeCost(usage, type, model) {
  if (!usage) return 0;
  const p = lookupPrice(type, model);
  const inT  = Number(usage.inputTokens || 0);
  const outT = Number(usage.outputTokens || 0);
  const cwT  = Number(usage.cacheWriteTokens || 0);
  const crT  = Number(usage.cacheReadTokens || 0);
  return (
    (inT  * p.input)      / 1_000_000 +
    (outT * p.output)     / 1_000_000 +
    (cwT  * p.cacheWrite) / 1_000_000 +
    (crT  * p.cacheRead)  / 1_000_000
  );
}

module.exports = { PRICE_TABLE, lookupPrice, computeCost };
