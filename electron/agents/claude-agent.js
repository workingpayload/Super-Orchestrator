const { BaseAgent } = require('./base-agent');
const path = require('path');
const fs = require('fs');
const os = require('os');

/**
 * ClaudeAgent — adapter for the Claude Code CLI.
 *
 * Uses --output-format stream-json (requires --verbose). This streams
 * line-delimited JSON events while Claude works, ending with a single
 * `result` event that carries the final text + usage + total_cost_usd.
 *
 * `autoApprove` (default true) toggles `--dangerously-skip-permissions`.
 * When false, Claude will emit permission prompts to stderr/stdout.
 */
class ClaudeAgent extends BaseAgent {
  constructor(config) {
    super({ ...config, type: 'claude' });
    this.cliPath = config.cliPath || 'claude';
    // Force stream-json so we always get usage + streaming output, regardless of legacy stored config.
    this.outputFormat = 'stream-json';
    this.model = config.model || '';
    this.allowedTools = config.allowedTools || [];
    this.bare = config.bare === true;

    // Permission mode controls how Claude handles tool/file permission requests.
    //   'bypass'       → --dangerously-skip-permissions (silent, writes everything)
    //   'accept-edits' → --permission-mode acceptEdits (file writes auto, bash still asks)
    //   'plan'         → --permission-mode plan (read-only planning)
    //   'default'      → --permission-mode default (asks every time; will hang in non-interactive
    //                     unless allowedTools is set or the user uses an external grant flow)
    // Migration: any agent without an explicit `permissionMode` field becomes 'bypass'.
    // Older `autoApprove: false` configs are NOT mapped to 'default' because there is no
    // permission-grant UI yet — they would silently hang on every tool call.
    this.permissionMode = config.permissionMode || 'bypass';
  }

  toConfig() {
    return {
      ...super.toConfig(),
      model: this.model,
      outputFormat: this.outputFormat,
      allowedTools: this.allowedTools,
      permissionMode: this.permissionMode,
    };
  }

  /**
   * Generate a temp MCP config file that wires Claude Code to our
   * permission bridge. Returns absolute path to the JSON file.
   */
  _writeMcpConfig(bridgePort, cwd) {
    const serverScript = path.resolve(__dirname, '..', 'permission', 'mcp-permission-server.js');
    const cfg = {
      mcpServers: {
        'orcha-perm': {
          command: process.execPath, // node binary (Electron's bundled node also works for plain Node scripts)
          args: [serverScript],
          env: {
            ORCHA_BRIDGE_PORT: String(bridgePort),
            ORCHA_CWD: cwd || process.cwd(),
            ORCHA_AGENT_NAME: this.name || 'Claude',
            ELECTRON_RUN_AS_NODE: '1', // make Electron run the script as plain node
          },
        },
      },
    };
    const tmp = path.join(os.tmpdir(), `orcha-mcp-${this.id || 'claude'}-${Date.now()}.json`);
    fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2), 'utf8');
    return tmp;
  }

  buildCommand(prompt, options = {}) {
    // Claude Code auto-detects non-interactive mode when stdin is piped, so no -p flag.
    const args = [];

    if (this.model) args.push('--model', this.model);

    args.push('--output-format', 'stream-json');
    args.push('--verbose'); // required for stream-json non-interactive

    if (this.bare) args.push('--bare');

    let allowedTools = [...this.allowedTools];

    switch (this.permissionMode) {
      case 'bypass':
        // Modern flag (Claude Code v1.x+) plus the deprecated alias for older builds.
        args.push('--permission-mode', 'bypassPermissions');
        args.push('--dangerously-skip-permissions');
        break;
      case 'accept-edits':
        args.push('--permission-mode', 'acceptEdits');
        break;
      case 'plan':
        args.push('--permission-mode', 'plan');
        break;
      case 'ui-prompt': {
        const port = options.bridgePort;
        if (port) {
          const cfgPath = this._writeMcpConfig(port, options.cwd);
          args.push('--mcp-config', cfgPath);
          args.push('--permission-prompt-tool', 'mcp__orcha-perm__approval');
        } else {
          // Fallback if bridge isn't available — behave like default.
          args.push('--permission-mode', 'default');
        }
        break;
      }
      case 'default':
      default:
        args.push('--permission-mode', 'default');
        break;
    }

    if (allowedTools.length > 0) args.push('--allowedTools', allowedTools.join(','));

    args.push(...this.extraFlags);
    return args;
  }

  getStdinInput(prompt) {
    return prompt;
  }

  parseOutput(raw) {
    const lines = (raw || '').split('\n').map(l => l.trim()).filter(Boolean);
    const events = [];
    for (const line of lines) {
      if (!line.startsWith('{')) continue;
      try {
        events.push(JSON.parse(line));
      } catch {}
    }
    if (events.length === 0) {
      // Fallback: try whole-string JSON parse (json mode legacy)
      try {
        return { type: 'json', data: JSON.parse(raw), events: [] };
      } catch {
        return { type: 'text', data: raw, events: [] };
      }
    }
    return { type: 'stream-json', events };
  }

  extractText(parsed) {
    if (parsed.type === 'stream-json') {
      const result = parsed.events.findLast?.(e => e.type === 'result')
        ?? [...parsed.events].reverse().find(e => e.type === 'result');
      if (result) {
        return result.result || result.message?.content || '';
      }
      // Fallback: concatenate assistant text deltas
      const out = [];
      for (const e of parsed.events) {
        if (e.type === 'assistant' && e.message?.content) {
          for (const c of e.message.content) {
            if (typeof c === 'string') out.push(c);
            else if (c.type === 'text' && c.text) out.push(c.text);
          }
        }
      }
      return out.join('\n');
    }
    if (parsed.type === 'json') {
      const d = parsed.data;
      if (d.result) return d.result;
      if (d.content) {
        if (Array.isArray(d.content)) return d.content.map(c => c.text || c.content || '').join('\n');
        return d.content;
      }
      return JSON.stringify(d, null, 2);
    }
    return parsed.data;
  }

  extractUsage(raw, parsed) {
    const collect = (obj) => {
      if (!obj || typeof obj !== 'object') return null;
      if (obj.usage && typeof obj.usage === 'object') return obj;
      if (Array.isArray(obj)) {
        for (const i of obj) { const r = collect(i); if (r) return r; }
      } else {
        for (const k of Object.keys(obj)) { const r = collect(obj[k]); if (r) return r; }
      }
      return null;
    };

    let host = null;
    let costFromPayload = null;

    if (parsed?.type === 'stream-json' && parsed.events.length > 0) {
      // Prefer the final `result` event.
      const result = [...parsed.events].reverse().find(e => e.type === 'result');
      if (result) {
        host = collect(result) || result;
        if (typeof result.total_cost_usd === 'number') costFromPayload = result.total_cost_usd;
      }
      // If not found, sum usage across assistant events.
      if (!host) {
        const summed = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
        let any = false;
        for (const e of parsed.events) {
          const u = e.message?.usage || e.usage;
          if (u) {
            any = true;
            summed.input_tokens += u.input_tokens || 0;
            summed.output_tokens += u.output_tokens || 0;
            summed.cache_read_input_tokens += u.cache_read_input_tokens || 0;
            summed.cache_creation_input_tokens += u.cache_creation_input_tokens || 0;
          }
        }
        if (any) host = { usage: summed };
      }
    } else if (parsed?.type === 'json') {
      host = collect(parsed.data) || parsed.data;
      if (typeof parsed.data.total_cost_usd === 'number') costFromPayload = parsed.data.total_cost_usd;
    } else {
      // text fallback — try last JSON-looking line
      const lines = (raw || '').trim().split('\n').reverse();
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith('{')) continue;
        try {
          const obj = JSON.parse(t);
          host = collect(obj) || obj;
          if (typeof obj.total_cost_usd === 'number') costFromPayload = obj.total_cost_usd;
          break;
        } catch {}
      }
    }

    if (!host) return null;
    const u = host.usage || {};
    const inputTokens = Number(u.input_tokens || u.prompt_tokens || u.inputTokens || 0);
    const outputTokens = Number(u.output_tokens || u.completion_tokens || u.outputTokens || 0);
    const cacheReadTokens = Number(u.cache_read_input_tokens || u.cache_read_tokens || 0);
    const cacheWriteTokens = Number(u.cache_creation_input_tokens || u.cache_creation_tokens || 0);

    if (!inputTokens && !outputTokens && !cacheReadTokens && !cacheWriteTokens && costFromPayload == null) {
      return null;
    }

    return {
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      costUsd: costFromPayload,
    };
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
        proc.on('close', () => {
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
