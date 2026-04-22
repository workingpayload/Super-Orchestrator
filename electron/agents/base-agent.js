const { spawn } = require('child_process');
const path = require('path');

/**
 * BaseAgent — abstract base class for all CLI agent adapters.
 * Each agent adapter wraps a specific CLI tool (claude, gemini, codex, etc.)
 * and provides a unified interface for execution, streaming, and health checks.
 */
class BaseAgent {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.type = config.type; // 'claude' | 'gemini' | 'codex' | 'custom'
    this.role = config.role; // 'master' | 'worker' | 'reviewer'
    this.cliPath = config.cliPath || config.type; // Path or command name
    this.extraFlags = config.extraFlags || [];
    this.enabled = config.enabled !== false;
    this.process = null;
    this.isRunning = false;
  }

  /**
   * Build the CLI command arguments for execution.
   * Must be implemented by subclasses.
   * @param {string} prompt - The prompt to send
   * @param {object} options - Additional options
   * @returns {string[]} Command arguments array
   */
  buildCommand(prompt, options = {}) {
    throw new Error('buildCommand() must be implemented by subclass');
  }

  /**
   * Return the prompt text to deliver via stdin, or null to use CLI args only.
   * Override in subclasses to pipe prompts through stdin instead of CLI args,
   * which avoids shell escaping issues on Windows (cmd.exe mangles quotes,
   * newlines, and has an ~8191 char limit).
   * @param {string} prompt - The prompt to send
   * @param {object} options - Additional options
   * @returns {string|null} Text to write to stdin, or null
   */
  getStdinInput(prompt, options = {}) {
    return null;
  }

  /**
   * Parse the raw output from the CLI agent.
   * Override in subclasses for agent-specific parsing.
   * @param {string} raw - Raw output string
   * @returns {object} Parsed output
   */
  parseOutput(raw) {
    // Try JSON parse first
    try {
      return { type: 'json', data: JSON.parse(raw) };
    } catch {
      return { type: 'text', data: raw };
    }
  }

  /**
   * Extract the final text content from parsed output.
   * Override in subclasses for agent-specific extraction.
   * @param {object} parsed - Parsed output from parseOutput
   * @returns {string} Plain text result
   */
  extractText(parsed) {
    if (parsed.type === 'json') {
      // Try common response fields
      const d = parsed.data;
      return d.result || d.response || d.content || d.text || d.message || JSON.stringify(d, null, 2);
    }
    return parsed.data;
  }

  /**
   * Execute a prompt and return the full result.
   * Spawns a CLI process, collects output, and returns when done.
   * @param {string} prompt - The prompt to execute
   * @param {object} options - { cwd, onData, onError, signal }
   * @returns {Promise<{success: boolean, output: string, raw: string, error?: string}>}
   */
  async execute(prompt, options = {}) {
    return new Promise((resolve, reject) => {
      const args = this.buildCommand(prompt, options);
      const cwd = options.cwd || process.cwd();

      let stdout = '';
      let stderr = '';

      const stdinInput = this.getStdinInput(prompt, options);

      this.process = spawn(this.cliPath, args, {
        cwd,
        env: { ...process.env },
        shell: true,
        windowsHide: true,
      });

      this.isRunning = true;

      this.process.stdin.on('error', () => {});

      if (stdinInput !== null) {
        try {
          this.process.stdin.write(stdinInput);
          this.process.stdin.end();
        } catch (e) {
          // Process may have exited before stdin write — close event will handle it
        }
      }

      this.process.stdout.on('data', (data) => {
        const chunk = data.toString();
        stdout += chunk;
        if (options.onData) {
          options.onData(chunk, 'stdout');
        }
      });

      this.process.stderr.on('data', (data) => {
        const chunk = data.toString();
        stderr += chunk;
        if (options.onData) {
          options.onData(chunk, 'stderr');
        }
      });

      this.process.on('close', (code) => {
        this.isRunning = false;
        this.process = null;

        if (code === 0 || stdout.trim().length > 0) {
          const parsed = this.parseOutput(stdout.trim());
          const text = this.extractText(parsed);
          resolve({
            success: true,
            output: text,
            raw: stdout.trim(),
            parsed,
          });
        } else {
          resolve({
            success: false,
            output: '',
            raw: stdout.trim(),
            error: stderr.trim() || `Process exited with code ${code}`,
          });
        }
      });

      this.process.on('error', (err) => {
        this.isRunning = false;
        this.process = null;
        resolve({
          success: false,
          output: '',
          raw: '',
          error: `Failed to start agent: ${err.message}`,
        });
      });

      // Handle abort signal
      if (options.signal) {
        options.signal.addEventListener('abort', () => {
          this.abort();
        });
      }
    });
  }

  /**
   * Check if the CLI agent is installed and accessible.
   * @returns {Promise<{available: boolean, version?: string, error?: string}>}
   */
  async healthCheck() {
    return new Promise((resolve) => {
      const proc = spawn(this.cliPath, ['--version'], {
        shell: true,
        windowsHide: true,
        timeout: 10000,
      });

      let output = '';

      proc.stdout.on('data', (data) => {
        output += data.toString();
      });

      proc.stderr.on('data', (data) => {
        output += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0 || output.trim().length > 0) {
          resolve({
            available: true,
            version: output.trim().split('\n')[0],
          });
        } else {
          resolve({
            available: false,
            error: `CLI not found or not working (exit code: ${code})`,
          });
        }
      });

      proc.on('error', (err) => {
        resolve({
          available: false,
          error: `CLI not found: ${err.message}`,
        });
      });
    });
  }

  /**
   * Abort the currently running process.
   */
  abort() {
    if (this.process && this.isRunning) {
      this.process.kill('SIGTERM');
      setTimeout(() => {
        if (this.process) {
          this.process.kill('SIGKILL');
        }
      }, 5000);
      this.isRunning = false;
    }
  }

  /**
   * Get serializable config for this agent.
   */
  toConfig() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      role: this.role,
      cliPath: this.cliPath,
      extraFlags: this.extraFlags,
      enabled: this.enabled,
    };
  }
}

module.exports = { BaseAgent };
