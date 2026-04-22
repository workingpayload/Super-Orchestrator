# Master Orchestrator

Multi-agent CLI orchestrator for AI coding agents. Desktop application (Electron + React) that manages a Master-Worker-Reviewer pipeline for coordinated AI-powered software development tasks.

## Features

- **Multi-Agent Pipeline**: Master agent coordinates Worker agents with Reviewer oversight
- **Task Management**: Visualize and monitor agent tasks with real-time progress tracking
- **Agent Configuration**: Add, configure, and health-check multiple AI agents
- **Skills System**: Extensible skills framework for agent capabilities
- **Desktop UI**: Rich React interface with task boards, phase indicators, and output console
- **Persistent State**: Configuration and session storage via Electron Store
- **IPC Communication**: Seamless main/renderer process integration

## Quick Start

### Prerequisites
- Node.js 16+
- npm or yarn

### Installation

```bash
npm install
```

### Development

Run both Vite dev server and Electron in parallel:

```bash
npm run dev
```

Or run separately:
```bash
npm run dev:vite      # React frontend on localhost:5173
npm run dev:electron  # Electron app
```

### Build

Create production builds:

```bash
npm run build         # Full build (Vite + Electron)
npm run build:vite    # Frontend only
```

Output: `release/` directory with platform-specific installers.

## Project Structure

```
master_orcha/
├── electron/
│   ├── main.js                 # Electron entry point
│   ├── preload.js              # Preload script (IPC bridge)
│   ├── ipc-handlers.js         # Main process IPC handlers
│   ├── agents/                 # Agent management
│   ├── orchestrator/           # Task orchestration
│   ├── skills/                 # Skills system
│   ├── store/                  # Config/session persistence
│   └── ...
├── src/
│   ├── App.jsx                 # Main React component
│   ├── components/
│   │   ├── layout/             # Header, Sidebar, StatusBar
│   │   ├── pipeline/           # PromptInput, TaskBoard, PhaseIndicator
│   │   ├── output/             # OutputConsole
│   │   └── config/             # AgentModal
│   ├── context/                # AppContext (global state)
│   └── styles/                 # CSS
├── package.json
└── vite.config.js
```

## Architecture

### IPC Handlers (Electron Main)
Core functionality exposed via IPC:

- **Agents**: `agents:list`, `agents:add`, `agents:update`, `agents:remove`, `agents:healthCheck`
- **Orchestrator**: `orchestrator:start`, `orchestrator:abort`, `orchestrator:pause`, `orchestrator:resume`
- **Tasks**: `tasks:list`, `tasks:detail`, `tasks:update`
- **Skills**: `skills:list`
- **Session**: `session:get`, `session:set`

### React Components

| Component | Purpose |
|-----------|---------|
| **PromptInput** | User input for orchestration tasks |
| **TaskBoard** | Displays tasks from Master/Worker/Reviewer phases |
| **PhaseIndicator** | Current orchestration phase status |
| **OutputConsole** | Real-time output logs from agents |
| **AgentModal** | Configure and manage agents |
| **TaskDetailModal** | View task details and execution trace |
| **SkillsModal** | Browse available agent skills |

### State Management

Global app state (AppContext) manages:
- Agent configurations
- Current orchestration phase
- Task list and selection
- Output logs
- Modal visibility

## Configuration

Configurations stored in Electron Store:
- Agent definitions and API keys
- Session history
- UI preferences
- Pipeline settings

## Development Notes

- **Electron**: Window management and file system access
- **Vite**: Fast HMR for React development
- **Concurrently**: Runs dev server and Electron together
- **IPC**: Secure communication between processes (preload.js bridges)

## Building for Distribution

```bash
npm run build
```

Creates Windows NSIS installer (configurable for macOS/Linux in electron-builder config).

## License

MIT
