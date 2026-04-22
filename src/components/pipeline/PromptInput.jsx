import React from 'react';
import { useApp } from '../../context/AppContext';

export default function PromptInput() {
  const { state, dispatch, startOrchestration, abortOrchestration, selectDirectory } = useApp();
  const { currentPrompt, orchestratorStatus, phase, workingDirectory, agents, agentSkills } = state;

  const isRunning = phase !== 'idle' && phase !== 'completed' && phase !== 'failed' && phase !== 'aborted';
  const hasMaster = agents.some(a => a.role === 'master' && a.enabled);
  const canStart = currentPrompt.trim().length > 0 && hasMaster && !isRunning;
  const totalSkills = Object.values(agentSkills || {}).reduce((n, arr) => n + (arr?.length || 0), 0);

  const handleSubmit = () => {
    if (canStart) {
      dispatch({ type: 'RESET' });
      startOrchestration();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && canStart) {
      handleSubmit();
    }
  };

  return (
    <div className="prompt-section">
      <div className="prompt-header">
        <h2>📋 Pipeline</h2>
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => dispatch({ type: 'SHOW_SKILLS_MODAL' })}
            disabled={isRunning}
            title="Select per-agent skills for this run"
          >
            🧩 Skills{totalSkills > 0 ? ` (${totalSkills})` : ''}
          </button>
          {isRunning ? (
            <button className="btn btn-danger btn-sm" onClick={abortOrchestration}>
              ⏹ Abort
            </button>
          ) : (
            <button
              className="btn btn-primary"
              onClick={handleSubmit}
              disabled={!canStart}
            >
              🚀 Orchestrate
            </button>
          )}
        </div>
      </div>

      <div className="prompt-textarea-wrapper">
        <textarea
          className="prompt-textarea"
          placeholder={hasMaster
            ? 'Describe what you want the agents to accomplish...\n\nExample: "Refactor the authentication module to use JWT tokens, add refresh token support, and write comprehensive unit tests."'
            : '⚠️ No master agent configured. Add a master agent in the sidebar first.'
          }
          value={currentPrompt}
          onChange={(e) => dispatch({ type: 'SET_PROMPT', payload: e.target.value })}
          onKeyDown={handleKeyDown}
          disabled={isRunning}
        />
        <div className="prompt-toolbar">
          <div className="prompt-toolbar-left">
            <div className="prompt-cwd" onClick={selectDirectory} title="Select working directory">
              <span>📁</span>
              <span className="prompt-cwd-path">
                {workingDirectory || 'Select directory...'}
              </span>
            </div>
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            Ctrl+Enter to run
          </div>
        </div>
      </div>
    </div>
  );
}
