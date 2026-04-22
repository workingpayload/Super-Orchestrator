const { BaseAgent } = require('./base-agent');

/**
 * GeminiAgent — adapter for the Gemini CLI.
 * Uses: gemini -p "prompt" --output-format json
 */
class GeminiAgent extends BaseAgent {
  constructor(config) {
    super({ ...config, type: 'gemini' });
    this.cliPath = config.cliPath || 'gemini';
    this.outputFormat = config.outputFormat || 'text';
    this.model = config.model || '';
  }

  toConfig() {
    return {
      ...super.toConfig(),
      model: this.model,
      outputFormat: this.outputFormat,
    };
  }

  buildCommand(prompt, options = {}) {
    const args = [];

    if (this.outputFormat) {
      args.push('--output-format', this.outputFormat);
    }

    if (this.model) {
      args.push('-m', this.model);
    }

    args.push('--sandbox=none');
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
}

module.exports = { GeminiAgent };
