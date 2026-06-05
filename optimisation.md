# Performance Optimisation Plan

> Audit of `Super-Orchestrator` performed 2026-04-30 against `git rev-parse HEAD = d3d53da` (plus the in-flight changes in this session: parallel scheduler, permission-bridge fix, new-session button).
>
> Findings are ordered roughly by **impact × ease**: the items at the top are the ones that will move the needle most for the smallest amount of code.

---

## TL;DR — top 7 wins

| # | Where | Win | Effort |
|---|---|---|---|
| 1 | `AppContext.jsx:519` | Memoise context value + split context into 2-3 channels (state vs. callbacks vs. hot streams) | Medium |
| 2 | `AppContext.jsx:92` `ADD_OUTPUT_LINE` | Stop re-allocating the whole `outputLines` array on every CLI chunk; switch to a ring buffer + batched flush | Medium |
| 3 | `OutputConsole.jsx:108` | Virtualise the console (react-window) and drop per-line `<motion.div>` + `AnimatePresence` | Medium |
| 4 | `electron/store/session-store.js:37-58` | Stop reading every session file on `listSessions()`; keep an index | Easy |
| 5 | `electron/store/*.js` | Move all `fs.writeFileSync`/`readFileSync` off the main thread (async) and debounce frequent writes | Easy |
| 6 | `electron/agents/agent-manager.js:188-194` | `healthCheckAll` runs serially — parallelise with `Promise.all` | Trivial |
| 7 | `electron/skills/skill-scanner.js:95-133` | Cache the scan result + `fs.watch` `~/.claude/skills` invalidation, instead of re-walking on every IPC call | Easy |

The first three alone will erase ~90% of the renderer jank when an agent is streaming verbose output.

---

## 1. Renderer (React) hot paths

### 1.1 Single context = whole-tree re-renders [HIGH]

`src/context/AppContext.jsx:519`

```jsx
const value = {
  state,
  dispatch,
  loadAgents, addAgent, updateAgent, removeAgent,
  checkAgentHealth, checkAllHealth,
  startOrchestration, abortOrchestration, retryTask, retriggerReview,
  loadSessions, loadSession,
  loadClaudeSkills, setAgentSkills, clearAgentSkills,
  decidePermission, allowAlwaysForTool,
  selectDirectory,
};
return <AppContext.Provider value={value}>…</AppContext.Provider>;
```

Two compounding problems:

1. **`value` is a fresh object every render**, so even consumers that destructure `{ dispatch }` re-render whenever any state field changes.
2. **Every CLI chunk `dispatch({ ADD_OUTPUT_LINE })` re-renders every `useApp()` consumer** — Header, Sidebar, StatusBar, TaskBoard, every TaskCard, CostTracker, OutputConsole, modals — even though only OutputConsole cares.

**Fix.** Either:
- Split into three contexts:
  - `AppStateContext` — state (read-only).
  - `AppActionsContext` — stable callbacks (created once with `useCallback` + `useMemo`).
  - `OutputStreamContext` — high-frequency stream channel (use `useSyncExternalStore` with an external store, *not* `useReducer`, for outputLines and per-task chunk counts).
- Or adopt `zustand` / `jotai`: subscribe by selector. The fix here is one ~30-line file and a `useStore(selector)` per consumer.

Expected impact: cuts render count during a streaming run from 100s/sec to <10/sec.

### 1.2 `ADD_OUTPUT_LINE` reallocates everything [HIGH]

`src/context/AppContext.jsx:92`

```js
case 'ADD_OUTPUT_LINE':
  return {
    ...state,
    outputLines: [...state.outputLines, action.payload].slice(-5000),
  };
```

For every stdout chunk Claude/Gemini emits (potentially every few ms in `stream-json` mode):

- New `state` object (full shallow copy).
- New `outputLines` array (full copy + new entry + slice).
- `slice(-5000)` allocates *another* array of length 5000 once you exceed the cap.

At 50 chunks/sec on a long task this is ~250k allocations/min per task — and N tasks if running in parallel.

**Fix.** Two-step:
1. **Batch** chunks at the IPC layer. In `electron/orchestrator/orchestrator.js` and `task-runner.js`, accumulate `onData` chunks for ~50ms then flush a single `orchestrator:output` event with `chunks: string[]`.
2. **Ring-buffer** in renderer. Replace `outputLines: []` with a fixed-capacity circular buffer (just an index + a fixed-length array). Don't store it in reducer state — keep it in a `useRef` / external store and notify subscribers via `useSyncExternalStore`. Reducer only carries a counter.

Expected impact: GC pressure drops by an order of magnitude; smooth scrolling under fast streams.

### 1.3 OutputConsole renders 5000 nodes with motion + bad keys [HIGH]

`src/components/output/OutputConsole.jsx:108-124`

```jsx
<AnimatePresence initial={false}>
  {filteredLines.map((line, i) => (
    <motion.div key={i} initial=... animate=... transition={{ duration: 0.12 }} ...
```

Three issues:
- **`key={i}`** on a growing/truncating array breaks reconciliation: every item shifts a slot when the buffer hits 5000, causing React to re-mount every visible line.
- **`<motion.div>` + `AnimatePresence`** on every single line. Each new line spins up a Framer animation worker.
- **No virtualisation** — at 5000 lines the DOM has 5000 nodes, and Framer keeps WAAPI handles for all of them.

**Fix.**
1. Drop AnimatePresence here. A console doesn't need fade-in per line.
2. Use a stable `key` (line id from a counter, or `${timestamp}-${seq}`).
3. Use `react-window` (or `@tanstack/react-virtual`) to only render the visible 30-50 rows.
4. Replace `motion.div` with a plain `<div>`; CSS transition is enough if you really want one.
5. While there: the empty-state `<motion.div>` floats forever; restrict animations with `prefers-reduced-motion`.

Expected impact: console FPS goes from drops-into-the-teens at 5k lines to 60fps with hundreds of thousands of lines buffered.

### 1.4 TaskBoard re-filters tasks four times per render [MEDIUM]

`src/components/pipeline/TaskBoard.jsx:196-211`

```js
const colTasks = (id) => {
  switch (id) {
    case 'queued': return tasks.filter(...);
    case 'running': return tasks.filter(...);
    case 'review': return tasks.filter(...);
    case 'done': return tasks.filter(...);
  }
};
…
{COLUMNS.map((col) => { const colData = colTasks(col.id); … })}
```

Each column does a fresh filter; with N tasks that's 4·N comparisons per render, and TaskBoard re-renders on every chunk because of (1.1).

**Fix.**
```js
const grouped = useMemo(() => {
  const g = { queued: [], running: [], review: [], done: [] };
  for (const t of tasks) {
    if (t.status === 'queued') g.queued.push(t);
    else if (t.status === 'running') g.running.push(t);
    else if (t.status === 'completed' && t.reviewStatus === 'revision_needed') g.review.push(t);
    else g.done.push(t);
  }
  return g;
}, [tasks]);
```

One pass over `tasks`, memoised by reference.

### 1.5 Sidebar runs N serial health checks on every agent count change [MEDIUM]

`src/components/layout/Sidebar.jsx:132-134`

```js
useEffect(() => {
  if (agents.length > 0 && window.electronAPI) checkAllHealth();
}, [agents.length]);
```

And `agent-manager.js:188-194`:

```js
async healthCheckAll() {
  const results = {};
  for (const [id, agent] of this.agents) {
    results[id] = await agent.healthCheck();   // SERIAL
  }
  return results;
}
```

With 4 agents this is 4 sequential `--version` spawns (~80-300ms each → 1.2s blocking). And the effect re-runs every time `agents.length` changes (add/remove agent).

**Fix.** Parallel:
```js
async healthCheckAll() {
  const ids = Array.from(this.agents.keys());
  const results = await Promise.all(
    ids.map(id => this.agents.get(id).healthCheck()
      .then(r => [id, r])
      .catch(e => [id, { available: false, error: e.message }]))
  );
  return Object.fromEntries(results);
}
```

While here, debounce the renderer effect (e.g., only check once after agents stabilise for 500ms).

### 1.6 Aurora backdrop animates forever [LOW]

`src/App.jsx:17-26` — three large blurred gradient blobs animating with `animate-aurora-1/2/float`. Pretty, but the GPU compositor wakes every frame even when the user is mid-thought.

**Fix.**
```js
@media (prefers-reduced-motion: reduce) { .animate-aurora-1, .animate-aurora-2, .animate-float { animation: none; } }
```
Plus pause via `document.visibilityState === 'hidden'` listener (sets `body[data-paused]` → CSS `animation-play-state: paused`). When the Electron window is hidden, no point burning cycles.

### 1.7 Framer motion everywhere [LOW]

`Sparkles` rotation on header, `whileHover` on every TaskCard, layout animations on every motion.div in CostTracker rows, etc. Framer is ~150kB gzip and adds a render hook per `motion.*`.

**Fix.**
- Keep Framer for big set-pieces (PhaseIndicator, the empty TaskBoard hero).
- Replace `motion.button whileHover={{y:-1}}` with CSS `:hover { transform: translateY(-1px); transition: transform .15s; }` — equivalent visual, ~0 JS cost.
- Removes Framer from list rendering hotspots: TaskCard, CostTracker rows, AgentRow, sidebar session items, OutputConsole lines, permission queue badges.

### 1.8 React.StrictMode double-effects [LOW, dev-only]

`src/main.jsx` wraps in `<React.StrictMode>`. In dev this fires every effect twice on mount, which means:
- `loadAgents`, `loadSessions`, `loadClaudeSkills` each invoked twice on first mount.
- IPC listeners attached twice (the cleanup in `AppContext.jsx:298` runs once on the throwaway double, fine).
- `Sidebar`'s `checkAllHealth` runs twice → 2× process spawns just to start dev.

Not a prod issue (StrictMode is a no-op there), but if local dev feels sluggish, remove it from the dev wrapper or guard the IPC listeners so attach is idempotent.

---

## 2. Main process (Electron) hot paths

### 2.1 `SessionStore.listSessions` reads every session file [HIGH]

`electron/store/session-store.js:37-58`

```js
listSessions() {
  const files = fs.readdirSync(this.sessionDir).filter(f => f.endsWith('.json'));
  return files.map(f => {
    const raw = fs.readFileSync(path.join(this.sessionDir, f), 'utf-8');
    const session = JSON.parse(raw);
    return { id, prompt: …slice(0,100), status, startTime, endTime, taskCount };
  })…
}
```

Every IPC call to `sessions:list` (mount, post-completion, sidebar refresh) reads and parses **every** session file from disk synchronously. A session can be megabytes (task outputs accumulate). With 100 sessions × 500 KB avg = 50 MB read + parse, on the main thread, blocking IPC.

**Fix.**
- Maintain `sessions/index.json` with one row per session: `{id, prompt, status, startTime, endTime, taskCount}`. Update it inside `saveSession` and `deleteSession`.
- `listSessions()` becomes a single read + parse.
- Migration: on first run, regenerate `index.json` if missing.

While at it: `getSession(id)` is called for the active session — fine — but `loadSession` in renderer pushes every task's `output` into `outputLines` (`AppContext.jsx:463-477`). For a giant session this hangs the UI. Stream the lines in batches (or just don't replay output history on session load — show it in `TaskDetailModal` instead).

### 2.2 All disk I/O is sync on the main thread [MEDIUM]

`electron/store/config-store.js:29-39` and `session-store.js:25-32`:

```js
fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
```

`ConfigStore.set` writes the entire config every key change. `SessionStore.saveSession` writes after every retry, completion, error.

Sync writes on the main process block IPC, child-process spawns, and window paints. With a session of a few MB the write itself can take 50-150ms on Windows.

**Fix.**
1. Switch to async (`fs.promises.writeFile`).
2. Debounce config writes (~500ms trailing). The user changing an agent flag doesn't need the file flushed instantly.
3. For sessions, write atomically: `writeFile(tmp); rename(tmp, final)`. Avoids torn JSON if Electron exits mid-write.
4. For very large sessions, consider per-task output to separate `.txt` files and keep only metadata in the JSON.

### 2.3 `BaseAgent.execute` accumulates raw stdout into a string [MEDIUM]

`electron/agents/base-agent.js:104-180`

```js
let stdout = '';
…
proc.stdout.on('data', (data) => {
  const chunk = data.toString();
  stdout += chunk;
  if (options.onData) options.onData(chunk, 'stdout');
});
```

For Claude in `stream-json` mode this is fine for typical sessions. But:
- Each `+=` on a large string forces V8 to materialise a flat string (cons-string flattening) periodically.
- The parser at the end (`parseOutput(stdout.trim())`) splits the accumulated string on `\n` and re-parses each line — for a 5MB stream this is 5MB of trim + split + re-walk.

**Fix.** Stream-parse on the way in:
- Maintain a line buffer; on `data` chunks, slice on `\n`, push complete line objects into an `events: []` array, retain the trailing partial.
- `parseOutput` becomes a no-op (or just hands back `{ type: 'stream-json', events }`).
- For non-streaming agents (Codex/Gemini text), keep `stdout` but cap or chunk it.

Bonus: this lets `extractUsage` find the result event without re-walking 5MB.

### 2.4 `shell: true` on every spawn [LOW]

`base-agent.js:117-122`. `shell: true` introduces a `cmd.exe /d /s /c <cli> <args>` wrapper on Windows. Two costs:
- ~30-80ms extra per spawn.
- Args are subject to cmd.exe escaping rules — risky for prompts with `&`, `<`, `>`, `^`, `%`, `"` (the existing `getStdinInput()` workaround sidesteps the prompt itself, but flag values like `--allowedTools=Bash(npm test)` could still break).

**Fix.** Resolve the absolute path once (e.g., on first health check), cache it, and spawn with `shell: false`. Keep the shell-mode escape hatch for `CustomAgent` where users may type compound commands.

### 2.5 Per-task `extractUsage` on Claude walks the whole tree [LOW]

`electron/agents/claude-agent.js:177-251`. `collect()` is recursive over the parsed JSON; for streaming it walks every event. Fine for normal runs, but when combined with §2.3 you can fold this into the streaming line parser and accumulate `usage` as you go (since stream-json emits incremental usage on assistant deltas).

### 2.6 Pricing lookup [TRIVIAL]

`electron/pricing/pricing.js:38-45`

```js
const exact = Object.keys(PRICE_TABLE).find(k => model.startsWith(k));
```

`Object.keys` allocates a new array on every cost calculation. Build the prefix index once at module load, cache lookups in a `Map<string, price>`. Negligible CPU but cleanup-cheap.

---

## 3. IPC

### 3.1 Per-chunk IPC traffic [HIGH]

Every CLI chunk fires `orchestrator:output` → renderer dispatches → React reconciles → 1.1's broadcast hits every consumer. Combine with §1.2.

**Fix.** In the orchestrator/task-runner, wrap `onData` with a coalescer per source:

```js
function coalesce(target, intervalMs = 50) {
  let buf = [];
  let timer = null;
  return (chunk, source) => {
    buf.push({ chunk, source });
    if (timer) return;
    timer = setTimeout(() => { target(buf); buf = []; timer = null; }, intervalMs);
  };
}
```

Renderer accumulates the array into the ring buffer in one dispatch.

### 3.2 `orchestrator:cost` rebuilds full payload per call [LOW]

`electron/orchestrator/orchestrator.js:_recordCost` emits `byAgent: Object.values(cost.byAgent)` on every CLI completion. `Object.values` is cheap, but the renderer's `SET_COST` then triggers AppContext's whole-tree re-render (back to §1.1). With cost-context split off this is a no-op.

### 3.3 `permission:request` fanout [TRIVIAL]

`electron/ipc-handlers.js:23-27` loops `BrowserWindow.getAllWindows()`. Fine for one window; if you ever add a secondary window or DevTools window, this still works but should target `webContents.fromId(...)` of the main window.

---

## 4. Skill scanner

`electron/skills/skill-scanner.js:95-133`. Every renderer mount and Skills-modal "Rescan" walks:
- `~/.claude/skills/` (one level)
- `~/.claude/plugins/cache/<plugin>/**` (BFS, max depth 5) for every plugin

The user clearly has hundreds of plugins (the system reminder lists ~1000 skill names). Each `fs.readdirSync` is sync and blocks IPC.

**Fix.**
- **Cache** the result in memory; serve subsequent IPC calls from the cache.
- **Invalidate** on `fs.watch(homedir+'/.claude/skills', { recursive: true })` and the plugins cache root. Coalesce events with a 500ms debounce.
- Make scanning **async** (`fs.promises.readdir`) so it doesn't block.
- Add a hard cap on results (e.g., 2000) and a load-more pattern in the modal — but the underlying issue is that the modal renders all skills in a single scrollable div without virtualisation (also see §1.3).

---

## 5. Vite / bundle

### 5.1 No code-splitting [LOW]

`vite.config.js` is minimal. `dist/` ships a single `index-*.js`. Modal code (AgentModal, TaskDetailModal, SkillsModal, PermissionModal) is loaded on first paint even when never opened.

**Fix.**
```js
// App.jsx
const AgentModal = React.lazy(() => import('./components/config/AgentModal'));
const TaskDetailModal = React.lazy(() => import('./components/pipeline/TaskDetailModal'));
const SkillsModal = React.lazy(() => import('./components/pipeline/SkillsModal'));
// wrap in Suspense, fallback={null}
```

Plus in vite config:
```js
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        radix: ['@radix-ui/react-dialog', '@radix-ui/react-popover', /*…*/],
        motion: ['framer-motion'],
        icons: ['lucide-react'],
      },
    },
  },
},
```

For an Electron app you don't pay network cost for the bundle, but you do pay parse-and-eval time on cold start. Splitting + lazy modals cuts initial JS parse by ~30-40%.

### 5.2 `lucide-react` tree-shaking [TRIVIAL]

The codebase imports lucide as `import { X, Y, Z } from 'lucide-react'`. Lucide ESM is tree-shakeable, but if you ever upgrade past v0.300 the package layout changed. Verify the current `dist/index-*.js` doesn't contain hundreds of unused icon SVGs (`grep -o 'lucide' dist/*.js | wc -l`).

### 5.3 Production bundle profiling [TRIVIAL]

Add `rollup-plugin-visualizer` to one-off-inspect what ships. Sets the priority for §5.1.

---

## 6. Electron startup

### 6.1 `sandbox: false` [LOW]

`electron/main.js:28`. The preload script only uses `contextBridge` + `ipcRenderer.invoke/send/on` — none of which require a node-integrated preload. Setting `sandbox: true` is faster (preload runs in V8 isolate without Node bootstrap) and safer.

### 6.2 DevTools auto-open in dev [TRIVIAL]

`main.js:37` opens DevTools detached on every dev launch. That's ~300ms of startup cost. Make it gated by `process.env.DEVTOOLS=1` instead.

### 6.3 Window shows after `ready-to-show` [GOOD] — keep it.

### 6.4 No app-level cache for `app.getPath('userData')` [TRIVIAL]

`config-store.js:11` calls `app.getPath('userData')` in the constructor (once). Fine. But sessions and config both call it; one shared module would do.

---

## 7. Concurrency / orchestrator

These were largely fixed in this session (parallel scheduler, re-entrant `BaseAgent`), but a few residuals:

### 7.1 No back-pressure on workers [MEDIUM]

The new scheduler in `task-runner.js` round-robins workers without considering whether a given worker is already saturated. Two heavy tasks pinned to the same worker can degrade — even though processes are independent, they share CPU.

**Fix.** Track per-worker inflight count; assign next task to the worker with min inflight.
```js
const load = new Map(workers.map(w => [w.id, 0]));
…
const worker = workers.reduce((a, b) =>
  load.get(a.id) <= load.get(b.id) ? a : b);
load.set(worker.id, load.get(worker.id) + 1);
// decrement on finally
```

### 7.2 Permission bridge has no auto-deny timeout [LOW]

`electron/permission/permission-bridge.js`. If the renderer crashes between `request` enqueue and `decide`, the held HTTP response sits forever; the worker Claude blocks. Add a per-request timeout (e.g., 10 min) → auto-deny.

### 7.3 `flushPending` only fires on `bridge.stop()` [LOW]

If you ever want session-level abort to also reject pending permissions, call `flushPending('Run aborted')` from `Orchestrator.abort()`.

### 7.4 `Orchestrator._emit` over a destroyed sender silently swallows [TRIVIAL]

Fine, but it means a full pipeline can complete and you never get the `complete` event if the user reloads the renderer mid-run. Persist final session to disk before sending the IPC (already done).

---

## 8. Observability

None right now. Adding lightweight tracing makes future tuning much easier:

- `console.time`/`timeEnd` around `executeTasks`, `worker.execute`, `parseOutput`, `extractUsage`.
- `app:on('render-process-gone' | 'child-process-gone', …)` for crash diagnostics.
- Persist a `metrics.json` per session: spawn count, total CLI ms, peak memory.

Optional: ship `electron-log` or wire structured logs to a rolling file in `userData/logs`.

---

## 9. Code quality smells (perf-adjacent)

- `OutputConsole.jsx:41` recomputes `tabs` from `tasks` on every output line because `tasks` reference changes (new task array on every UPDATE_TASK). Either memoise on `tasks.map(t=>t.id).join(',')` or move tabs derivation into a selector.
- `App.jsx:36-39` — `state.phase !== 'idle' && <PhaseIndicator />` — fine, but PhaseIndicator unmounts/remounts on every idle→active transition; the layout animation thrash is small but unnecessary. Keep mounted with `style.opacity:0/1`.
- `formatTimestamp` in `OutputConsole.jsx:48` calls `new Date(ts).toLocaleTimeString` per line render. With a virtualised list this becomes 30-50 calls per scroll instead of 5000. With virtualisation, this is fine. Without, it isn't.
- `extractText` in `claude-agent.js:147` uses `findLast` if available, else `[...arr].reverse().find` — the spread reverses an array of potentially thousands of stream-json events on every invocation. Just iterate from the end with a for-loop.
- `parseFrontmatter` in `skill-scanner.js:10` reads the entire file even if frontmatter ends in the first 200 bytes. With thousands of skills this is wasted I/O — use a stream and stop at the second `---`.

---

## 10. Quick wins ordered for a one-day pass

If you only have a day, do these in this order:

1. **Add session index** (§2.1) — 30 min. Removes a per-mount disk storm.
2. **Parallelise `healthCheckAll`** (§1.5) — 5 min. Snappy startup.
3. **Memoise TaskBoard groups** (§1.4) — 5 min.
4. **Cache + watch skill scanner** (§4) — 30 min.
5. **Async + debounce config writes** (§2.2 part 1) — 20 min.
6. **Code-split modals** (§5.1) — 20 min.
7. **Pause aurora when window hidden + reduced-motion** (§1.6) — 10 min.

That's ~2 hours and removes most of the sluggishness without touching the AppContext refactor.

If you have a second day, tackle context splitting (§1.1) + ring-buffer outputLines (§1.2) + virtualised console (§1.3) together — they're a single conceptual change and reinforce each other.

---

## 11. Don't bother

For completeness, here are things that look like perf issues but aren't:

- **Multiple `stripPrefix` / `JSON.parse` in `extractUsage`** — sub-millisecond on realistic payloads.
- **`computeCost` per-event** — pure arithmetic, fine.
- **`uuid.v4` calls** — fast in node-uuid v9.
- **IPC over loopback HTTP for the permission bridge** — Node http on 127.0.0.1 is plenty fast for human-paced approvals; don't over-engineer it (e.g., into a Unix socket / named pipe).
- **`framer-motion` for the empty-state hero** — you mount it once. Keep the polish.
