const { BaseAgent } = require('./base-agent');

/**
 * CodexAgent — adapter for the OpenAI Codex CLI.
 * Uses: codex exec "prompt"
 */
class CodexAgent extends BaseAgent {
  constructor(config) {
    super({ ...config, type: 'codex' });
    this.cliPath = config.cliPath || 'codex';
    this.model = config.model || '';
    this.ephemeral = config.ephemeral !== false;
  }

  toConfig() {
    return {
      ...super.toConfig(),
      model: this.model,
    };
  }

  buildCommand(prompt, options = {}) {
    const args = [];

    if (this.role !== 'reviewer') {
      args.push('exec');
      if (this.ephemeral) {
        args.push('--ephemeral');
      }
      args.push('--skip-git-repo-check');
      args.push('--full-auto');
    }

    if (this.model) {
      args.push('--model', this.model);
    }

    args.push(...this.extraFlags);

    return args;
  }

  getStdinInput(prompt, options = {}) {
    return prompt;
  }

  parseOutput(raw) {
    // Codex typically outputs plain text
    return { type: 'text', data: raw };
  }

  extractText(parsed) {
    return parsed.data;
  }

  async healthCheck() {
    return new Promise((resolve) => {
      const { spawn } = require('child_process');
      const proc = spawn(this.cliPath, ['--version'], {
        shell: true,
        windowsHide: true,
        timeout: 10000,
      });
      let output = '';
      proc.stdout.on('data', (d) => output += d.toString());
      proc.stderr.on('data', (d) => output += d.toString());
      proc.on('close', (code) => {
        resolve({
          available: code === 0 || output.trim().length > 0,
          version: output.trim().split('\n')[0] || 'Codex CLI',
        });
      });
      proc.on('error', () => {
        resolve({ available: false, error: 'Codex CLI not found' });
      });
    });
  }
}

module.exports = { CodexAgent };
