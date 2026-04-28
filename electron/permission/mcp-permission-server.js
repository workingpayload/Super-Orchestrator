#!/usr/bin/env node
/**
 * Minimal MCP stdio server exposing one tool: `approval`.
 *
 * Claude Code launches this as a subprocess when `--permission-prompt-tool
 * mcp__orcha-perm__approval` is set on the parent claude command. When
 * Claude needs permission to run a tool, it calls `tools/call` with
 * `name: "approval"` and `arguments: { tool_name, input }`.
 *
 * This server forwards each call to the Electron main-process bridge over
 * loopback HTTP (port from env ORCHA_BRIDGE_PORT) and returns the user's
 * decision back to Claude.
 *
 * Speaks JSON-RPC 2.0 over newline-delimited stdin/stdout (the MCP stdio
 * transport).  Implementation is intentionally dependency-free.
 */
const http = require('http');

const PORT = parseInt(process.env.ORCHA_BRIDGE_PORT || '0', 10);
const CWD = process.env.ORCHA_CWD || process.cwd();
const AGENT_NAME = process.env.ORCHA_AGENT_NAME || 'Claude';

if (!PORT) {
  process.stderr.write('mcp-permission-server: ORCHA_BRIDGE_PORT not set\n');
  process.exit(1);
}

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

function postToBridge(payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: '/request',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(e); }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function handle(msg) {
  const { id, method, params } = msg;

  if (method === 'initialize') {
    return send({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'orcha-perm', version: '1.0.0' },
      },
    });
  }

  if (method === 'tools/list') {
    return send({
      jsonrpc: '2.0',
      id,
      result: {
        tools: [
          {
            name: 'approval',
            description: 'Ask the human operator for permission to run a tool.',
            inputSchema: {
              type: 'object',
              properties: {
                tool_name: { type: 'string' },
                input: { type: 'object' },
              },
              required: ['tool_name'],
            },
          },
        ],
      },
    });
  }

  if (method === 'tools/call') {
    const args = params?.arguments || {};
    try {
      const decision = await postToBridge({
        tool_name: args.tool_name || 'unknown',
        input: args.input || {},
        cwd: CWD,
        agentName: AGENT_NAME,
      });
      // Claude expects content[0].text to be a JSON string of the decision payload.
      return send({
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            { type: 'text', text: JSON.stringify(decision) },
          ],
        },
      });
    } catch (e) {
      return send({
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            { type: 'text', text: JSON.stringify({ behavior: 'deny', message: 'Bridge error: ' + e.message }) },
          ],
        },
      });
    }
  }

  if (method === 'notifications/initialized') {
    return; // no response for notifications
  }

  // Default: method not found
  if (id != null) {
    send({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found: ' + method } });
  }
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let idx;
  while ((idx = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line);
      handle(msg);
    } catch (e) {
      process.stderr.write('mcp-permission-server: parse error ' + e.message + '\n');
    }
  }
});

process.stdin.on('end', () => process.exit(0));
