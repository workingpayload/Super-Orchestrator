const http = require('http');
const { v4: uuidv4 } = require('uuid');

/**
 * PermissionBridge
 * ────────────────
 * In-process HTTP server (loopback only) that bridges Claude Code's
 * `--permission-prompt-tool` MCP server with the Electron renderer's
 * permission modal.
 *
 * Flow:
 *   1. ClaudeAgent (when permissionMode='ui-prompt') writes an MCP
 *      config that spawns `mcp-permission-server.js` with env var
 *      ORCHA_BRIDGE_PORT pointing at this server.
 *   2. The MCP server receives `tools/call approval` from Claude,
 *      POSTs `{toolName, input, cwd}` to /request and long-polls.
 *   3. This bridge enqueues the request, calls `onRequest` callback
 *      so the orchestrator can forward it to the renderer over IPC,
 *      and waits for a corresponding `decide(id, decision)`.
 *   4. When the user clicks Allow/Deny in the renderer, IPC handler
 *      calls `decide()` which releases the held HTTP response.
 */
class PermissionBridge {
  constructor() {
    this.server = null;
    this.port = null;
    this.pending = new Map(); // id → { req, res, payload }
    this.onRequest = null;    // callback (request) — called when new request arrives
  }

  setRequestHandler(fn) {
    this.onRequest = fn;
  }

  async start() {
    if (this.server) return this.port;

    this.server = http.createServer((req, res) => {
      // CORS not needed (loopback only) but keep simple.
      if (req.method === 'POST' && req.url === '/request') {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
          let payload;
          try { payload = JSON.parse(body); }
          catch { res.writeHead(400); return res.end('bad json'); }

          const id = uuidv4();
          this.pending.set(id, { res, payload });

          if (this.onRequest) {
            try {
              this.onRequest({
                id,
                toolName: payload.tool_name || payload.toolName,
                input: payload.input || payload.tool_input || {},
                cwd: payload.cwd || null,
                agentName: payload.agentName || 'Claude',
              });
            } catch (e) {
              console.error('[PermissionBridge] onRequest threw:', e);
            }
          }
        });
        return;
      }
      res.writeHead(404);
      res.end();
    });

    return new Promise((resolve, reject) => {
      this.server.listen(0, '127.0.0.1', () => {
        this.port = this.server.address().port;
        console.log(`[PermissionBridge] listening on 127.0.0.1:${this.port}`);
        resolve(this.port);
      });
      this.server.on('error', reject);
    });
  }

  /**
   * Settle a pending request from the renderer.
   * decision: { behavior: 'allow' | 'deny', message?: string, updatedInput?: object }
   */
  decide(id, decision) {
    const slot = this.pending.get(id);
    if (!slot) return false;
    this.pending.delete(id);

    // Claude Code validates the MCP approval reply against a Zod union:
    //   allow → { behavior: "allow", updatedInput: <record>, message?: string }
    //   deny  → { behavior: "deny",  message: <string> }
    // updatedInput is REQUIRED on allow. If the renderer didn't supply one,
    // echo back the original tool input the MCP server forwarded.
    const isAllow = decision.behavior === 'allow';
    const originalInput =
      (slot.payload && (slot.payload.input || slot.payload.tool_input)) || {};

    const reply = isAllow
      ? {
          behavior: 'allow',
          updatedInput:
            decision.updatedInput && typeof decision.updatedInput === 'object'
              ? decision.updatedInput
              : originalInput,
          message: decision.message || 'Approved by user',
        }
      : {
          behavior: 'deny',
          message: decision.message || 'Denied by user',
        };

    const body = JSON.stringify(reply);
    try {
      slot.res.writeHead(200, { 'Content-Type': 'application/json' });
      slot.res.end(body);
    } catch (e) {
      console.error('[PermissionBridge] decide write failed:', e);
    }
    return true;
  }

  /** Auto-deny everything still pending (used on abort/shutdown). */
  flushPending(reason = 'Cancelled') {
    for (const id of Array.from(this.pending.keys())) {
      this.decide(id, { behavior: 'deny', message: reason });
    }
  }

  stop() {
    this.flushPending('Bridge shutdown');
    if (this.server) {
      this.server.close();
      this.server = null;
      this.port = null;
    }
  }
}

let singleton = null;
function getBridge() {
  if (!singleton) singleton = new PermissionBridge();
  return singleton;
}

module.exports = { PermissionBridge, getBridge };
