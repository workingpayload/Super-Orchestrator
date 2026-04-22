const { BaseAgent } = require('./base-agent');

/**
 * ClaudeAgent — adapter for the Claude Code CLI.
 * Uses: claude -p "prompt" --output-format json
 */
class ClaudeAgent extends BaseAgent {
  constructor(config) {
    super({ ...config, type: 'claude' });
    this.cliPath = config.cliPath || 'claude';
    this.outputFormat = config.outputFormat || 'text';
    this.model = config.model || '';
    this.allowedTools = config.allowedTools || [];
    this.bare = config.bare === true;
  }

  toConfig() {
    return {
      ...super.toConfig(),
      model: this.model,
      outputFormat: this.outputFormat,
      allowedTools: this.allowedTools,
    };
  }

  buildCommand(prompt, options = {}) {
    // Prompt is piped via stdin (see getStdinInput) to avoid Windows
    // cmd.exe mangling long prompts. Claude CLI detects piped stdin
    // and runs non-interactively — no -p flag needed.
    const args = [];

    if (this.model) {
      args.push('--model', this.model);
    }

    if (this.outputFormat) {
      args.push('--output-format', this.outputFormat);
    }

    if (this.bare) {
      args.push('--bare');
    }

    if (this.allowedTools.length > 0) {
      args.push('--allowedTools', this.allowedTools.join(','));
    }

    args.push('--dangerously-skip-permissions');
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
      // Claude JSON output format
      if (d.result) return d.result;
      if (d.content) {
        if (Array.isArray(d.content)) {
          return d.content.map(c => c.text || c.content || '').join('\n');
        }
        return d.content;
      }
      return JSON.stringify(d, null, 2);
    }
    return parsed.data;
  }

  async healthCheck() {
    const result = await super.healthCheck();

    const combined = (result.version || '') + (result.error || '');
    if (combined.toLowerCase().includes('not logged in') || combined.toLowerCase().includes('please run /login')) {
      return { available: false, error: 'Claude CLI not logged in. Run: claude /login' };
    }

    if (!result.available) {
      return new Promise((resolve) => {
        const { spawn } = require('child_process');
        const proc = spawn(this.cliPath, ['--help'], {
          shell: true,
          windowsHide: true,
          timeout: 10000,
        });
        let output = '';
        proc.stdout.on('data', (d) => output += d.toString());
        proc.stderr.on('data', (d) => output += d.toString());
        proc.on('close', (code) => {
          if (output.toLowerCase().includes('not logged in')) {
            resolve({ available: false, error: 'Claude CLI not logged in. Run: claude /login' });
          } else {
            resolve({
              available: output.toLowerCase().includes('claude'),
              version: 'Claude Code CLI',
            });
          }
        });
        proc.on('error', () => {
          resolve({ available: false, error: 'Claude CLI not found' });
        });
      });
    }
    return result;
  }
}

module.exports = { ClaudeAgent };
