const { BaseAgent } = require('./base-agent');

/**
 * GeminiAgent — adapter for the Gemini CLI.
 * Uses: gemini -p "prompt" --output-format json
 */
class GeminiAgent extends BaseAgent {
  constructor(config) {
    super({ ...config, type: 'gemini' });
    this.cliPath = config.cliPath || 'gemini';
    this.outputFormat = 'json'; // force json so usage is parseable
    this.model = config.model || '';
    this.autoApprove = config.autoApprove !== false; // default true
  }

  toConfig() {
    return {
      ...super.toConfig(),
      model: this.model,
      outputFormat: this.outputFormat,
      autoApprove: this.autoApprove,
    };
  }

  buildCommand(prompt, options = {}) {
    const args = [];

    args.push('--output-format', 'json');

    if (this.model) {
      args.push('-m', this.model);
    }

    if (this.autoApprove) {
      args.push('--sandbox=none');
    }
    args.push(...this.extraFlags);

    return args;
  }

  getStdinInput(prompt, options = {}) {
    return prompt;
  }

  parseOutput(raw) {
    if (this.outputFormat === 'json') {
      try {
        const data = JSON.parse(raw);
        return { type: 'json', data };
      } catch {
        return { type: 'text', data: raw };
      }
    }
    return { type: 'text', data: raw };
  }

  extractText(parsed) {
    if (parsed.type === 'json') {
      const d = parsed.data;
      if (d.response) return d.response;
      if (d.text) return d.text;
      if (d.content) return d.content;
      if (d.result) return d.result;
      return JSON.stringify(d, null, 2);
    }
    return parsed.data;
  }

  extractUsage(raw, parsed) {
    const find = (obj, key) => {
      if (!obj || typeof obj !== 'object') return null;
      if (key in obj) return obj[key];
      if (Array.isArray(obj)) {
        for (const i of obj) { const v = find(i, key); if (v) return v; }
      } else {
        for (const k of Object.keys(obj)) { const v = find(obj[k], key); if (v) return v; }
      }
      return null;
    };

    let payload = parsed?.type === 'json' ? parsed.data : null;
    if (!payload) {
      try { payload = JSON.parse(raw); } catch { return null; }
    }

    const meta = find(payload, 'usageMetadata') || find(payload, 'usage_metadata') || {};
    const stats = find(payload, 'stats') || {};
    const inputTokens =
      Number(meta.promptTokenCount || meta.prompt_token_count || stats.promptTokenCount || 0);
    const outputTokens =
      Number(
        meta.candidatesTokenCount ||
        meta.candidates_token_count ||
        stats.candidatesTokenCount ||
        meta.responseTokenCount || 0
      );
    const cacheReadTokens =
      Number(meta.cachedContentTokenCount || meta.cached_content_token_count || 0);

    if (!inputTokens && !outputTokens && !cacheReadTokens) return null;
    return { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens: 0, costUsd: null };
  }
}

module.exports = { GeminiAgent };
