import React, { createContext, useContext, useReducer, useCallback, useEffect, useRef } from 'react';

const AppContext = createContext(null);

const initialState = {
  // Agents
  agents: [],
  agentHealthStatus: {}, // { agentId: { available, version, error } }

  // Orchestrator
  orchestratorStatus: 'idle', // idle | decomposing | executing | reviewing | revising | completed | failed | aborted
  currentPrompt: '',
  workingDirectory: '',

  // Tasks
  tasks: [],
  decomposition: null,

  // Output
  outputLines: [],
  activeOutputTab: 'all',

  // Review
  reviewResults: [],
  currentReviewRound: 0,

  // Session
  currentSession: null,
  sessions: [],

  // UI
  selectedAgent: null,
  showAgentModal: false,
  editingAgent: null,
  showTaskDetail: null,
  showSkillsModal: false,
  phase: 'idle', // idle | decomposing | decomposed | executing | reviewing | revising | completed | failed | aborted
  phaseMessage: '',

  // Skills (per-run, per-agent)
  claudeSkills: [], // cached scan of ~/.claude/skills/
  agentSkills: {}, // { agentId: [skillName, ...] }

  // Cost tracking (current run / loaded session)
  costSummary: { totalUsd: 0, byAgent: [] },

  // Permission requests (FIFO queue, oldest shown first)
  permissionRequests: [],
  // Auto-approve set: tool names auto-approved for the rest of the session
  permissionAutoApprove: new Set(),
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_AGENTS':
      return { ...state, agents: action.payload };

    case 'SET_AGENT_HEALTH':
      return {
        ...state,
        agentHealthStatus: {
          ...state.agentHealthStatus,
          [action.payload.id]: action.payload.status,
        },
      };

    case 'SET_ALL_HEALTH':
      return { ...state, agentHealthStatus: action.payload };

    case 'SET_STATUS':
      return { ...state, orchestratorStatus: action.payload };

    case 'SET_PROMPT':
      return { ...state, currentPrompt: action.payload };

    case 'SET_WORKING_DIR':
      return { ...state, workingDirectory: action.payload };

    case 'SET_TASKS':
      return { ...state, tasks: action.payload };

    case 'UPDATE_TASK': {
      const updated = state.tasks.map(t =>
        t.id === action.payload.id ? { ...t, ...action.payload } : t
      );
      return { ...state, tasks: updated };
    }

    case 'SET_DECOMPOSITION':
      return { ...state, decomposition: action.payload };

    case 'ADD_OUTPUT_LINE':
      return {
        ...state,
        outputLines: [...state.outputLines, action.payload].slice(-5000), // Keep last 5000 lines
      };

    case 'CLEAR_OUTPUT':
      return { ...state, outputLines: [] };

    case 'SET_ACTIVE_TAB':
      return { ...state, activeOutputTab: action.payload };

    case 'ADD_REVIEW_RESULT':
      return {
        ...state,
        reviewResults: [...state.reviewResults, action.payload],
        currentReviewRound: action.payload.round,
      };

    case 'SET_PHASE':
      return {
        ...state,
        phase: action.payload.phase,
        phaseMessage: action.payload.message || '',
      };

    case 'SET_SESSION':
      return { ...state, currentSession: action.payload };

    case 'SET_SESSIONS':
      return { ...state, sessions: action.payload };

    case 'SET_SELECTED_AGENT':
      return { ...state, selectedAgent: action.payload };

    case 'SHOW_AGENT_MODAL':
      return { ...state, showAgentModal: true, editingAgent: action.payload || null };

    case 'HIDE_AGENT_MODAL':
      return { ...state, showAgentModal: false, editingAgent: null };

    case 'SET_TASK_DETAIL':
      return { ...state, showTaskDetail: action.payload };

    case 'SHOW_SKILLS_MODAL':
      return { ...state, showSkillsModal: true };

    case 'HIDE_SKILLS_MODAL':
      return { ...state, showSkillsModal: false };

    case 'SET_CLAUDE_SKILLS':
      return { ...state, claudeSkills: action.payload };

    case 'SET_AGENT_SKILLS': {
      const { agentId, skills } = action.payload;
      const next = { ...state.agentSkills };
      if (!skills || skills.length === 0) {
        delete next[agentId];
      } else {
        next[agentId] = skills;
      }
      return { ...state, agentSkills: next };
    }

    case 'CLEAR_AGENT_SKILLS':
      return { ...state, agentSkills: {} };

    case 'SET_COST':
      return {
        ...state,
        costSummary: action.payload || { totalUsd: 0, byAgent: [] },
      };

    case 'PERMISSION_ENQUEUE':
      // Skip if already in queue (dedupe by id)
      if (state.permissionRequests.some(r => r.id === action.payload.id)) return state;
      return { ...state, permissionRequests: [...state.permissionRequests, action.payload] };

    case 'PERMISSION_DEQUEUE':
      return {
        ...state,
        permissionRequests: state.permissionRequests.filter(r => r.id !== action.payload),
      };

    case 'PERMISSION_AUTO_APPROVE_ADD': {
      const next = new Set(state.permissionAutoApprove);
      next.add(action.payload);
      return { ...state, permissionAutoApprove: next };
    }

    case 'PERMISSION_AUTO_APPROVE_CLEAR':
      return { ...state, permissionAutoApprove: new Set() };

    case 'RESET':
      return {
        ...initialState,
        agents: state.agents,
        agentHealthStatus: state.agentHealthStatus,
        workingDirectory: state.workingDirectory,
        sessions: state.sessions,
        claudeSkills: state.claudeSkills,
        agentSkills: state.agentSkills,
      };

    default:
      return state;
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const cleanupRef = useRef([]);

  // Load agents on mount
  useEffect(() => {
    loadAgents();
    loadSessions();
    loadClaudeSkills();

    // Set up IPC event listeners
    const api = window.electronAPI;
    if (!api) return;

    const cleanups = [];

    cleanups.push(api.on('orchestrator:progress', (data) => {
      dispatch({ type: 'SET_PHASE', payload: data });
      dispatch({
        type: 'ADD_OUTPUT_LINE',
        payload: {
          type: 'system',
          text: `[${data.phase}] ${data.message}`,
          timestamp: Date.now(),
        },
      });

      if (data.decomposition) {
        dispatch({ type: 'SET_DECOMPOSITION', payload: data.decomposition });
        dispatch({ type: 'SET_TASKS', payload: data.decomposition.tasks });
      }
    }));

    cleanups.push(api.on('orchestrator:taskUpdate', (task) => {
      dispatch({ type: 'UPDATE_TASK', payload: task });
    }));

    cleanups.push(api.on('orchestrator:output', (data) => {
      dispatch({
        type: 'ADD_OUTPUT_LINE',
        payload: {
          type: data.source || 'stdout',
          text: data.chunk,
          agentName: data.agentName || data.agent,
          taskId: data.taskId,
          phase: data.phase,
          timestamp: data.timestamp || Date.now(),
        },
      });
    }));

    cleanups.push(api.on('orchestrator:reviewResult', (data) => {
      dispatch({ type: 'ADD_REVIEW_RESULT', payload: data });
    }));

    cleanups.push(api.on('orchestrator:cost', (data) => {
      dispatch({
        type: 'SET_COST',
        payload: { totalUsd: data.totalUsd || 0, byAgent: data.byAgent || [] },
      });
    }));

    cleanups.push(api.on('permission:request', (req) => {
      dispatch({ type: 'PERMISSION_ENQUEUE', payload: req });
    }));

    cleanups.push(api.on('orchestrator:complete', (data) => {
      dispatch({ type: 'SET_PHASE', payload: { phase: 'completed', message: data.message } });
      dispatch({ type: 'SET_STATUS', payload: 'completed' });
      dispatch({ type: 'SET_SESSION', payload: data.session });
      if (data.session?.cost) {
        dispatch({
          type: 'SET_COST',
          payload: {
            totalUsd: data.session.cost.totalUsd || 0,
            byAgent: Object.values(data.session.cost.byAgent || {}),
          },
        });
      }
      loadSessions();
    }));

    cleanups.push(api.on('orchestrator:error', (data) => {
      dispatch({ type: 'SET_PHASE', payload: { phase: 'failed', message: data.message } });
      dispatch({ type: 'SET_STATUS', payload: 'failed' });
      dispatch({
        type: 'ADD_OUTPUT_LINE',
        payload: {
          type: 'error',
          text: `ERROR: ${data.message}`,
          timestamp: Date.now(),
        },
      });
    }));

    cleanupRef.current = cleanups;

    return () => {
      cleanups.forEach(cleanup => cleanup && cleanup());
    };
  }, []);

  // ─── Agent Actions ───
  const loadAgents = useCallback(async () => {
    if (!window.electronAPI) return;
    const agents = await window.electronAPI.agents.list();
    dispatch({ type: 'SET_AGENTS', payload: agents });
  }, []);

  const addAgent = useCallback(async (config) => {
    if (!window.electronAPI) return;
    await window.electronAPI.agents.add(config);
    await loadAgents();
  }, [loadAgents]);

  const updateAgent = useCallback(async (id, config) => {
    if (!window.electronAPI) return;
    await window.electronAPI.agents.update(id, config);
    await loadAgents();
  }, [loadAgents]);

  const removeAgent = useCallback(async (id) => {
    if (!window.electronAPI) return;
    await window.electronAPI.agents.remove(id);
    await loadAgents();
  }, [loadAgents]);

  const checkAgentHealth = useCallback(async (id) => {
    if (!window.electronAPI) return;
    dispatch({ type: 'SET_AGENT_HEALTH', payload: { id, status: { checking: true } } });
    const status = await window.electronAPI.agents.healthCheck(id);
    dispatch({ type: 'SET_AGENT_HEALTH', payload: { id, status } });
    return status;
  }, []);

  const checkAllHealth = useCallback(async () => {
    if (!window.electronAPI) return;
    // Set all to checking
    for (const agent of state.agents) {
      dispatch({ type: 'SET_AGENT_HEALTH', payload: { id: agent.id, status: { checking: true } } });
    }
    const results = await window.electronAPI.agents.healthCheckAll();
    dispatch({ type: 'SET_ALL_HEALTH', payload: results });
    return results;
  }, [state.agents]);

  // ─── Orchestrator Actions ───
  const startOrchestration = useCallback(async () => {
    if (!window.electronAPI) return;

    const masterAgent = state.agents.find(a => a.role === 'master' && a.enabled);
    const reviewerAgent = state.agents.find(a => a.role === 'reviewer' && a.enabled);

    if (!masterAgent) {
      dispatch({
        type: 'ADD_OUTPUT_LINE',
        payload: { type: 'error', text: 'ERROR: No master agent configured.', timestamp: Date.now() },
      });
      return;
    }

    // Reset state
    dispatch({ type: 'CLEAR_OUTPUT' });
    dispatch({ type: 'SET_TASKS', payload: [] });
    dispatch({ type: 'SET_STATUS', payload: 'running' });
    dispatch({ type: 'SET_PHASE', payload: { phase: 'decomposing', message: 'Starting orchestration...' } });

    const config = {
      prompt: state.currentPrompt,
      masterId: masterAgent.id,
      reviewerId: reviewerAgent?.id || null,
      cwd: state.workingDirectory || undefined,
      concurrent: true,
      maxRevisions: 3,
      agentSkills: state.agentSkills,
    };

    const result = await window.electronAPI.orchestrator.start(config);
    return result;
  }, [state.agents, state.currentPrompt, state.workingDirectory, state.agentSkills]);

  const abortOrchestration = useCallback(async () => {
    if (!window.electronAPI) return;
    await window.electronAPI.orchestrator.abort();
    dispatch({ type: 'SET_STATUS', payload: 'aborted' });
    dispatch({ type: 'SET_PHASE', payload: { phase: 'aborted', message: 'Aborted by user' } });
  }, []);

  const retryTask = useCallback(async (taskId) => {
    if (!window.electronAPI) return;
    dispatch({ type: 'SET_STATUS', payload: 'running' });
    dispatch({ type: 'SET_PHASE', payload: { phase: 'executing', message: `Retrying task T-${taskId}...` } });
    try {
      const result = await window.electronAPI.orchestrator.retryTask(taskId);
      if (result?.success) {
        dispatch({ type: 'SET_STATUS', payload: 'completed' });
      }
      return result;
    } catch (e) {
      dispatch({ type: 'SET_STATUS', payload: 'failed' });
      dispatch({ type: 'ADD_OUTPUT_LINE', payload: { type: 'error', text: `ERROR: ${e.message}`, timestamp: Date.now() } });
    }
  }, []);

  const retriggerReview = useCallback(async () => {
    if (!window.electronAPI) return;
    const reviewerAgent = state.agents.find(a => a.role === 'reviewer' && a.enabled);
    if (!reviewerAgent) {
      dispatch({
        type: 'ADD_OUTPUT_LINE',
        payload: { type: 'error', text: 'ERROR: No reviewer agent configured.', timestamp: Date.now() },
      });
      return;
    }
    dispatch({ type: 'SET_STATUS', payload: 'running' });
    dispatch({ type: 'SET_PHASE', payload: { phase: 'reviewing', message: 'Re-triggering review...' } });
    try {
      const result = await window.electronAPI.orchestrator.retriggerReview(reviewerAgent.id);
      if (result?.success) {
        dispatch({ type: 'SET_STATUS', payload: 'completed' });
      }
      return result;
    } catch (e) {
      dispatch({ type: 'SET_STATUS', payload: 'failed' });
      dispatch({ type: 'ADD_OUTPUT_LINE', payload: { type: 'error', text: `ERROR: ${e.message}`, timestamp: Date.now() } });
    }
  }, [state.agents]);

  // ─── Session Actions ───
  const loadSessions = useCallback(async () => {
    if (!window.electronAPI) return;
    const sessions = await window.electronAPI.sessions.list();
    dispatch({ type: 'SET_SESSIONS', payload: sessions });
  }, []);

  const loadSession = useCallback(async (sessionId) => {
    if (!window.electronAPI) return;
    const session = await window.electronAPI.sessions.get(sessionId);
    if (!session) return;

    dispatch({ type: 'CLEAR_OUTPUT' });
    dispatch({ type: 'SET_PROMPT', payload: session.prompt || '' });
    dispatch({ type: 'SET_SESSION', payload: session });
    dispatch({ type: 'SET_DECOMPOSITION', payload: session.decomposition || null });
    dispatch({ type: 'SET_TASKS', payload: session.tasks || [] });
    if (session.cost) {
      dispatch({
        type: 'SET_COST',
        payload: {
          totalUsd: session.cost.totalUsd || 0,
          byAgent: Object.values(session.cost.byAgent || {}),
        },
      });
    } else {
      dispatch({ type: 'SET_COST', payload: { totalUsd: 0, byAgent: [] } });
    }
    dispatch({
      type: 'SET_PHASE',
      payload: { phase: session.status || 'completed', message: `Loaded session from ${new Date(session.startTime).toLocaleString()}` },
    });
    dispatch({ type: 'SET_STATUS', payload: session.status || 'completed' });

    if (session.tasks) {
      for (const task of session.tasks) {
        if (task.output) {
          dispatch({
            type: 'ADD_OUTPUT_LINE',
            payload: {
              type: 'stdout',
              text: `[Task ${task.id}: ${task.title}]\n${task.output}`,
              agentName: task.assignedAgent?.name,
              timestamp: task.endTime || session.endTime,
            },
          });
        }
      }
    }
  }, []);

  // ─── Skills Actions ───
  const loadClaudeSkills = useCallback(async () => {
    if (!window.electronAPI || !window.electronAPI.skills) return;
    try {
      const skills = await window.electronAPI.skills.listClaude();
      dispatch({ type: 'SET_CLAUDE_SKILLS', payload: skills || [] });
    } catch {
      dispatch({ type: 'SET_CLAUDE_SKILLS', payload: [] });
    }
  }, []);

  const setAgentSkills = useCallback((agentId, skills) => {
    dispatch({ type: 'SET_AGENT_SKILLS', payload: { agentId, skills } });
  }, []);

  const clearAgentSkills = useCallback(() => {
    dispatch({ type: 'CLEAR_AGENT_SKILLS' });
  }, []);

  // ─── Permission Actions ───
  const decidePermission = useCallback(async (id, decision) => {
    if (!window.electronAPI?.permission) return;
    await window.electronAPI.permission.decide(id, decision);
    dispatch({ type: 'PERMISSION_DEQUEUE', payload: id });
  }, []);

  const allowAlwaysForTool = useCallback((toolName) => {
    dispatch({ type: 'PERMISSION_AUTO_APPROVE_ADD', payload: toolName });
  }, []);

  // ─── Utility ───
  const selectDirectory = useCallback(async () => {
    if (!window.electronAPI) return;
    const dir = await window.electronAPI.dialog.openDirectory();
    if (dir) {
      dispatch({ type: 'SET_WORKING_DIR', payload: dir });
    }
  }, []);

  const value = {
    state,
    dispatch,
    // Agent actions
    loadAgents,
    addAgent,
    updateAgent,
    removeAgent,
    checkAgentHealth,
    checkAllHealth,
    // Orchestrator actions
    startOrchestration,
    abortOrchestration,
    retryTask,
    retriggerReview,
    // Session actions
    loadSessions,
    loadSession,
    // Skills actions
    loadClaudeSkills,
    setAgentSkills,
    clearAgentSkills,
    // Permission actions
    decidePermission,
    allowAlwaysForTool,
    // Utility
    selectDirectory,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
}
