# Codemap
> Auto-generated 2026-04-29. Checkpoint: on-demand (`/codemap`). Git SHA: `d3d53da`.

## Project
- **Name**: master-orchestrator (a.k.a. Super-Orchestrator / Master Orcha)
- **Description**: Multi-agent CLI orchestrator — Master / Worker / Reviewer pipeline that wraps `claude`, `gemini`, `codex` CLIs.
- **Stack**: Electron 33 (main process, Node) + React 19 + Vite 6 (renderer) + Tailwind CSS + Radix UI + Framer Motion.
- **Language**: JavaScript (CommonJS in `electron/`, ESM/JSX in `src/`).
- **Package manager**: npm.
- **Monorepo**: no (single package).
- **Build**: `vite build` → `dist/`, then `electron-builder` → Windows NSIS installer in `release/`.
- **Entry point** (Electron `main`): `electron/main.js`.

## Directory Map
```
.
├── electron/                       # 🖥️ Main process (Node, CommonJS)
│   ├── main.js                     # [entry]   BrowserWindow bootstrap, window IPC
│   ├── preload.js                  # [entry]   contextBridge → window.electronAPI
│   ├── ipc-handlers.js             # [route]   Wires ipcMain channels to managers
│   ├── agents/                     # 🤖 CLI agent adapters
│   │   ├── base-agent.js           # [service] Abstract spawn/stream/parse/healthcheck
│   │   ├── claude-agent.js         # [service] Claude Code CLI adapter
│   │   ├── gemini-agent.js         # [service] Gemini CLI adapter
│   │   ├── codex-agent.js          # [service] OpenAI Codex CLI adapter
│   │   ├── custom-agent.js         # [service] Generic CLI adapter
│   │   └── agent-manager.js        # [service] CRUD + health-check across agents
│   ├── orchestrator/               # 🎼 Pipeline engine
│   │   ├── orchestrator.js         # [service] Master→Worker→Reviewer state machine
│   │   ├── task-decomposer.js      # [service] Builds Master meta-prompt; parses tasks
│   │   ├── task-runner.js          # [service] Concurrent/sequential task execution
│   │   └── review-manager.js       # [service] Builds review prompt; applies feedback
│   ├── permission/                 # 🔐 Claude permission bridge
│   │   ├── permission-bridge.js    # [service] Loopback HTTP server for MCP approvals
│   │   └── mcp-permission-server.js# [service] MCP shim invoked by Claude CLI
│   ├── pricing/
│   │   └── pricing.js              # [util]    Per-1M-token cost table + computeCost
│   ├── skills/
│   │   └── skill-scanner.js        # [service] Scans ~/.claude/skills/**/SKILL.md
│   └── store/
│       ├── config-store.js         # [repo]    JSON file at userData/config.json
│       └── session-store.js        # [repo]    JSON sessions index + per-session files
│
├── src/                            # ⚛️ Renderer (React 19 + Vite)
│   ├── main.jsx                    # [entry]   ReactDOM.createRoot
│   ├── App.jsx                     # [entry]   Root layout, modals, AuroraBackdrop
│   ├── index.css                   #          Tailwind layers + custom CSS
│   ├── context/
│   │   └── AppContext.jsx          # [service] Global useReducer store + IPC wiring
│   ├── lib/
│   │   └── utils.js                # [util]    cn() classname helper
│   └── components/
│       ├── layout/                 # [ui]      Header, Sidebar, StatusBar, CostTracker
│       ├── pipeline/               # [ui]      PromptInput, PhaseIndicator, TaskBoard,
│       │                           #          TaskDetailModal, SkillsModal
│       ├── output/OutputConsole.jsx# [ui]      Streamed stdout/stderr console
│       ├── config/AgentModal.jsx   # [ui]      Add/edit agent
│       ├── permission/PermissionModal.jsx # [ui] Allow/Deny Claude tool prompts
│       └── ui/                     # [ui]      Radix-based primitives (button, card,
│                                   #          dialog, select, tabs, tooltip, …)
│
├── assets/icon.png                 #          App icon
├── dist/                           # [generated — do not edit] Vite production build
├── index.html                      # [entry]   Vite HTML shell
├── vite.config.js                  # [config]
├── tailwind.config.js              # [config]
├── postcss.config.js               # [config]
├── jsconfig.json                   # [config]  Path aliases (@/* → src/*)
├── package.json                    # [config]  Scripts + electron-builder block
└── README.md
```

## Entry Points
| File | Role | Description |
|---|---|---|
| `electron/main.js` | entry | Electron app bootstrap; creates BrowserWindow, wires window-control IPC, calls `registerIpcHandlers()`. |
| `electron/preload.js` | entry | Exposes the typed `window.electronAPI` surface (agents, orchestrator, config, sessions, skills, permission, IPC `on`). |
| `electron/ipc-handlers.js` | route | Single point that constructs `ConfigStore`, `SessionStore`, `AgentManager`, `Orchestrator`, `PermissionBridge` and registers all `ipcMain.handle(...)` channels. |
| `src/main.jsx` | entry | React root; mounts `<App/>` inside `<AppProvider>`. |
| `src/App.jsx` | entry | Top-level layout: Header / Sidebar / main pipeline column / OutputConsole / StatusBar / modals. |
| `index.html` | entry | Vite HTML shell loaded by both `vite` dev server and Electron file:// in production. |

## Module Map

### electron/orchestrator/orchestrator.js [service]
- **Does**: Drives the full Master→Worker→Reviewer→Revise pipeline. Owns the current session, status, cost accumulator, and IPC sender. Public methods: `start`, `abort`, `retryTask`, `retriggerReview`, `getStatus`.
- **Depends on**: `task-decomposer`, `task-runner`, `review-manager`, `pricing/pricing`, `permission/permission-bridge`, `uuid`.
- **Emits IPC**: `orchestrator:progress`, `orchestrator:taskUpdate`, `orchestrator:output`, `orchestrator:reviewResult`, `orchestrator:cost`, `orchestrator:complete`, `orchestrator:error`.

### electron/orchestrator/task-runner.js [service]
- **Does**: Resolves task DAG dependencies, fans tasks out across worker agents (concurrent or sequential), streams stdout chunks back, detects deadlocks, supports `executeRevision` for single-task reruns and an `abort()` controller.
- **Depends on**: `agent-manager` (via `getAgentsByRole('worker')`).

### electron/orchestrator/task-decomposer.js [service]
- **Does**: Builds the JSON-only meta-prompt sent to the Master agent and parses its decomposition into `{refined_prompt, summary, tasks[]}`. Also builds revision prompts.

### electron/orchestrator/review-manager.js [service]
- **Does**: Builds the Reviewer JSON meta-prompt, parses `{overall_status, task_reviews[]}`, applies review verdicts back onto tasks, and identifies tasks needing revision.

### electron/agents/base-agent.js [service]
- **Does**: Abstract base. `execute()` spawns the CLI via `child_process.spawn` (shell=true, windowsHide=true), pipes stdin, streams `stdout`/`stderr` to `onData` callbacks, parses JSON-or-text on close, extracts text + token usage. `healthCheck()` runs `<cli> --version`. `abort()` SIGTERMs then SIGKILLs.
- **Subclasses must implement**: `buildCommand`, optionally override `getStdinInput`, `parseOutput`, `extractText`, `extractUsage`.

### electron/agents/agent-manager.js [service]
- **Does**: Loads agent configs from `ConfigStore`, instantiates `ClaudeAgent`/`GeminiAgent`/`CodexAgent`/`CustomAgent`, runs one-shot migrations (Claude `permissionMode=bypass`, Codex/Gemini `autoApprove=true`), seeds defaults on first run. CRUD + `getAgentsByRole(role)` + `healthCheckAll`.

### electron/permission/permission-bridge.js + mcp-permission-server.js [service]
- **Does**: When a Claude agent runs in `ui-prompt` permission mode, Claude spawns the MCP shim with `ORCHA_BRIDGE_PORT` set. The shim POSTs `/request` to the in-process loopback HTTP server and long-polls; the bridge fires the registered `onRequest` callback so `ipc-handlers.js` can `webContents.send('permission:request', req)`. Renderer's `PermissionModal` calls back via `permission:decide` IPC, which resolves the held HTTP response.

### electron/pricing/pricing.js [util]
- **Does**: Static USD-per-1M-token table for Claude / Gemini / OpenAI models and a `computeCost(usage, agentType, model)` helper. Used by `Orchestrator._recordCost` to roll per-call cost into `currentSession.cost.{totalUsd, byAgent}` and emit `orchestrator:cost`.

### electron/skills/skill-scanner.js [service]
- **Does**: Walks `~/.claude/skills/**/SKILL.md` (and plugin caches), parses YAML frontmatter, returns `[{name, description, source, path}]` for the renderer's SkillsModal. Per-run, per-agent skill selections are prefixed onto prompts via `prefixWithSkills()` in `orchestrator.js` and `task-runner.js`.

### electron/store/{config-store,session-store}.js [repo]
- **Does**: Plain-JSON file-backed stores rooted at Electron `app.getPath('userData')`. `ConfigStore` holds `agents` and arbitrary key/value app config. `SessionStore` lists/saves/deletes orchestration sessions (prompt, decomposition, tasks, review history, cost).

### electron/ipc-handlers.js [route]
- **Does**: The IPC routing table. Registers handlers for `agents:*`, `orchestrator:*`, `config:*`, `sessions:*`, `skills:*`, `permission:decide`. Mirrors the namespaces exposed in `preload.js`.

### src/context/AppContext.jsx [service]
- **Does**: The renderer's single source of truth. `useReducer` over a large state object (agents, tasks, outputLines, phase, costSummary, permissionRequests, agentSkills, …). Subscribes to all `orchestrator:*` and `permission:request` IPC events on mount. Exposes action creators (`startOrchestration`, `retryTask`, `retriggerReview`, `loadSession`, `decidePermission`, `setAgentSkills`, …) consumed via `useApp()`.

### src/components/pipeline/* [ui]
- `PromptInput.jsx` — task prompt textarea + Master/Reviewer pickers + Start/Abort.
- `PhaseIndicator.jsx` — current pipeline phase chip.
- `TaskBoard.jsx` — column board of tasks with status/agent/output preview; opens `TaskDetailModal`.
- `TaskDetailModal.jsx` — full task prompt, output, review feedback, retry button.
- `SkillsModal.jsx` — pick `~/.claude/skills` to inject per agent for the current run.

### src/components/{layout,output,config,permission,ui}/* [ui]
- `layout/` — `Header`, `Sidebar` (sessions list, agents list), `StatusBar`, `CostTracker`.
- `output/OutputConsole.jsx` — streaming console (stdout / stderr / system / agent tabs).
- `config/AgentModal.jsx` — add/edit agent (type, role, cliPath, flags, permission mode).
- `permission/PermissionModal.jsx` — Allow / Deny / Always-allow handler for Claude `ui-prompt` requests.
- `ui/` — Radix-based primitives wired to Tailwind tokens.

## Dependency Flow

```
[renderer]
  src/main.jsx
   └─ src/App.jsx ─ AppProvider (AppContext) ──── window.electronAPI ───┐
        ├─ components/pipeline/PromptInput  → orchestrator.start         │
        ├─ components/pipeline/TaskBoard    ← orchestrator:taskUpdate    │
        ├─ components/output/OutputConsole  ← orchestrator:output        │
        ├─ components/permission/Permission ← permission:request         │
        └─ components/layout/CostTracker    ← orchestrator:cost          │
                                                                         │ [IPC]
[main]                                                                   ▼
  electron/main.js → electron/preload.js
  electron/ipc-handlers.js
   ├─ store/config-store ─┐
   ├─ store/session-store ─┤
   ├─ agents/agent-manager ─→ agents/{claude,gemini,codex,custom}-agent → base-agent → spawn(cli)
   ├─ orchestrator/orchestrator
   │    ├─ orchestrator/task-decomposer
   │    ├─ orchestrator/task-runner ──→ agent-manager.getAgentsByRole('worker')
   │    ├─ orchestrator/review-manager
   │    └─ pricing/pricing
   ├─ permission/permission-bridge ←──HTTP loopback── permission/mcp-permission-server (spawned by ClaudeAgent)
   └─ skills/skill-scanner → ~/.claude/skills/**/SKILL.md
```

## Hot Files (full git history — repo has 4 commits)
| File | Touches | Notes |
|---|---|---|
| `src/context/AppContext.jsx` | 3 | Central renderer state; almost every feature lands here. |
| `src/components/pipeline/PromptInput.jsx` | 3 | Primary user-input surface. |
| `src/App.jsx` | 3 | Top-level layout / modal wiring. |
| `electron/preload.js` | 3 | IPC contract — change here cascades to AppContext + ipc-handlers. |
| `electron/orchestrator/task-runner.js` | 3 | Concurrency & retry behavior. |
| `electron/orchestrator/orchestrator.js` | 3 | Pipeline state machine. |
| `electron/ipc-handlers.js` | 3 | Channel registry. |

History is shallow (4 commits, last is `d3d53da "Many changes"` which touched ~50 files). Treat almost the entire tree as **active work area** until more granular history accumulates.

## Active Work Area (last 5 commits)
- `d3d53da Many changes` — broad sweep: added `permission/`, `pricing/`, `CostTracker`, `PermissionModal`, `SkillsModal`, all `components/ui/*` Radix primitives, `lib/utils.js`, `tailwind.config.js`, postcss/jsconfig.
- `eca2f7d Updated readme` — docs only.
- `3e00e77 Added skills and updated the readme` — introduced `skills/skill-scanner.js`, `SkillsModal`, agent-skill plumbing through orchestrator + task-runner.
- `97994d6 first commit` — initial Master/Worker/Reviewer scaffolding (agents, orchestrator, stores, base UI).

## IPC Channel Reference (preload.js ↔ ipc-handlers.js)
| Namespace | Channels |
|---|---|
| `window` | `window:minimize`, `window:maximize`, `window:close`, `window:isMaximized` |
| `dialog` | `dialog:openDirectory` |
| `agents` | `agents:list`, `agents:add`, `agents:update`, `agents:remove`, `agents:healthCheck`, `agents:healthCheckAll` |
| `orchestrator` | `orchestrator:start`, `orchestrator:abort`, `orchestrator:retryTask`, `orchestrator:retriggerReview`, `orchestrator:getStatus` |
| `config` | `config:get`, `config:set`, `config:getAll` |
| `sessions` | `sessions:list`, `sessions:get`, `sessions:delete` |
| `skills` | `skills:listClaude` |
| `permission` | `permission:decide` |
| events (main → renderer) | `orchestrator:progress`, `orchestrator:taskUpdate`, `orchestrator:output`, `orchestrator:reviewResult`, `orchestrator:cost`, `orchestrator:complete`, `orchestrator:error`, `permission:request`, `agent:output` |

## Notes / Edge Cases
- **No tests** in repo — no `__tests__/`, `*.spec.*`, or test runner in `package.json`.
- **Generated**: `dist/` is the Vite build artifact; do not edit.
- **Prompt portability**: `BaseAgent` defaults `shell: true` on `spawn` — Windows-friendly but means CLI args are subject to cmd.exe escaping; subclasses can override `getStdinInput()` to bypass via stdin.
- **Permission flow** is non-obvious: Claude in `ui-prompt` mode talks to a sibling MCP process over HTTP loopback, not directly to Electron IPC. See `permission-bridge.js` header comment.
- **Path aliases**: `jsconfig.json` maps `@/*` → `src/*` (used by Radix UI primitives).
```
