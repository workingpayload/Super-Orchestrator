import React, { useEffect } from 'react';
import { useApp } from '../../context/AppContext';

export default function Sidebar() {
  const { state, dispatch, checkAgentHealth, checkAllHealth, loadSession } = useApp();
  const { agents, agentHealthStatus } = state;

  // Check health on mount
  useEffect(() => {
    if (agents.length > 0 && window.electronAPI) {
      checkAllHealth();
    }
  }, [agents.length]);

  const masterAgents = agents.filter(a => a.role === 'master');
  const workerAgents = agents.filter(a => a.role === 'worker');
  const reviewerAgents = agents.filter(a => a.role === 'reviewer');

  const getHealthClass = (agentId) => {
    const h = agentHealthStatus[agentId];
    if (!h) return 'unknown';
    if (h.checking) return 'checking';
    return h.available ? 'available' : 'unavailable';
  };

  const handleAddAgent = () => {
    dispatch({ type: 'SHOW_AGENT_MODAL' });
  };

  const handleEditAgent = (agent) => {
    dispatch({ type: 'SHOW_AGENT_MODAL', payload: agent });
  };

  const renderAgentGroup = (title, agentList, role) => (
    <div className="sidebar-section">
      <div className="sidebar-section-title">
        <span>{title}</span>
        <span className="task-column-count">{agentList.length}</span>
      </div>
      {agentList.length === 0 ? (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', padding: 'var(--space-2)' }}>
          No {role} agents configured
        </div>
      ) : (
        agentList.map(agent => (
          <div
            key={agent.id}
            className={`agent-card ${state.selectedAgent === agent.id ? 'selected' : ''}`}
            onClick={() => handleEditAgent(agent)}
          >
            <div className={`agent-card-icon ${agent.type}`}>
              {agent.type === 'claude' ? 'C' : agent.type === 'gemini' ? 'G' : agent.type === 'codex' ? 'X' : '⚙'}
            </div>
            <div className="agent-card-info">
              <div className="agent-card-name">{agent.name}</div>
              <div className="agent-card-role">
                <span className={`role-badge ${agent.role}`}>{agent.role}</span>
              </div>
            </div>
            <div className={`agent-card-status ${getHealthClass(agent.id)}`} />
          </div>
        ))
      )}
    </div>
  );

  return (
    <aside className="sidebar">
      <div className="sidebar-section" style={{ paddingBottom: 0 }}>
        <div className="sidebar-section-title">
          <span>AGENTS</span>
          <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
            <button
              className="btn-icon"
              title="Refresh health status"
              onClick={(e) => { e.stopPropagation(); checkAllHealth(); }}
              style={{ width: 24, height: 24, fontSize: 'var(--text-xs)' }}
            >
              🔄
            </button>
            <button
              className="btn-icon"
              title="Add agent"
              onClick={handleAddAgent}
              style={{ width: 24, height: 24, fontSize: 'var(--text-xs)' }}
            >
              ➕
            </button>
          </div>
        </div>
      </div>

      {renderAgentGroup('🎯 Master', masterAgents, 'master')}
      <div className="sidebar-divider" />
      {renderAgentGroup('⚡ Workers', workerAgents, 'worker')}
      <div className="sidebar-divider" />
      {renderAgentGroup('🔍 Reviewer', reviewerAgents, 'reviewer')}

      {/* Sessions */}
      <div className="sidebar-divider" />
      <div className="sidebar-section">
        <div className="sidebar-section-title">
          <span>RECENT SESSIONS</span>
          <span className="task-column-count">{state.sessions.length}</span>
        </div>
        {state.sessions.slice(0, 5).map(session => (
          <div
            key={session.id}
            className={`agent-card ${state.currentSession?.id === session.id ? 'selected' : ''}`}
            style={{ cursor: 'pointer' }}
            onClick={() => loadSession(session.id)}
          >
            <div className="agent-card-info">
              <div className="agent-card-name" style={{ fontSize: 'var(--text-xs)' }}>
                {session.prompt}
              </div>
              <div className="agent-card-role" style={{ fontSize: 'var(--text-xs)' }}>
                {session.taskCount} tasks • {session.status}
              </div>
            </div>
            <div className={`agent-card-status ${session.status === 'completed' ? 'available' : session.status === 'failed' ? 'unavailable' : 'unknown'}`} />
          </div>
        ))}
        {state.sessions.length === 0 && (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', padding: 'var(--space-2)' }}>
            No previous sessions
          </div>
        )}
      </div>
    </aside>
  );
}
