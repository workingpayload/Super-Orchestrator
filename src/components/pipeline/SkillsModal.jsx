import React, { useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';

export default function SkillsModal() {
  const { state, dispatch, setAgentSkills, clearAgentSkills, loadClaudeSkills } = useApp();
  const { agents, claudeSkills, agentSkills } = state;

  const close = () => dispatch({ type: 'HIDE_SKILLS_MODAL' });

  const enabledAgents = useMemo(
    () => agents.filter(a => a.enabled !== false),
    [agents]
  );

  const [expandedAgentId, setExpandedAgentId] = useState(
    enabledAgents[0]?.id || null
  );
  const [filter, setFilter] = useState('');
  const [customInput, setCustomInput] = useState({});

  const toggleClaudeSkill = (agentId, skillName) => {
    const current = agentSkills[agentId] || [];
    const next = current.includes(skillName)
      ? current.filter(s => s !== skillName)
      : [...current, skillName];
    setAgentSkills(agentId, next);
  };

  const addCustomSkill = (agentId) => {
    const raw = (customInput[agentId] || '').trim();
    if (!raw) return;
    const names = raw.split(',').map(s => s.trim()).filter(Boolean);
    const current = agentSkills[agentId] || [];
    const merged = Array.from(new Set([...current, ...names]));
    setAgentSkills(agentId, merged);
    setCustomInput(prev => ({ ...prev, [agentId]: '' }));
  };

  const removeCustomSkill = (agentId, skillName) => {
    const current = agentSkills[agentId] || [];
    setAgentSkills(agentId, current.filter(s => s !== skillName));
  };

  const filteredSkills = useMemo(() => {
    if (!filter.trim()) return claudeSkills;
    const q = filter.toLowerCase();
    return claudeSkills.filter(s =>
      (s.name || '').toLowerCase().includes(q) ||
      (s.description || '').toLowerCase().includes(q) ||
      (s.displayName || '').toLowerCase().includes(q)
    );
  }, [claudeSkills, filter]);

  const totalSelected = Object.values(agentSkills).reduce((sum, arr) => sum + (arr?.length || 0), 0);

  return (
    <div className="modal-overlay" onClick={close}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 720, maxHeight: '80vh' }}>
        <div className="modal-header">
          <h2>🧩 Skills (per run)</h2>
          <button className="btn-icon" onClick={close}>✕</button>
        </div>

        <div className="modal-body" style={{ overflow: 'auto' }}>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 'var(--space-3)' }}>
            Select skills for each agent. Selections apply to this orchestration run only.
            Claude agents show detected skills from <code>~/.claude/skills/</code> and plugin caches.
            Other agents accept freeform skill names (hinted in the prompt).
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
            <button className="btn btn-ghost btn-sm" onClick={loadClaudeSkills}>🔄 Rescan</button>
            {totalSelected > 0 && (
              <button className="btn btn-ghost btn-sm" onClick={clearAgentSkills}>🗑 Clear all</button>
            )}
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginLeft: 'auto' }}>
              {claudeSkills.length} skills detected · {totalSelected} selected
            </span>
          </div>

          {enabledAgents.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-title">No enabled agents</div>
              <div className="empty-state-description">Add and enable agents first.</div>
            </div>
          )}

          {enabledAgents.map(agent => {
            const selected = agentSkills[agent.id] || [];
            const isExpanded = expandedAgentId === agent.id;
            const isClaude = agent.type === 'claude';

            return (
              <div key={agent.id} style={{
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                marginBottom: 'var(--space-2)',
                overflow: 'hidden',
              }}>
                <div
                  onClick={() => setExpandedAgentId(isExpanded ? null : agent.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)',
                    padding: 'var(--space-2) var(--space-3)',
                    cursor: 'pointer',
                    background: 'var(--bg-elevated)',
                  }}
                >
                  <div className={`agent-card-icon ${agent.type}`} style={{ width: 24, height: 24, fontSize: 'var(--text-xs)' }}>
                    {agent.type === 'claude' ? 'C' : agent.type === 'gemini' ? 'G' : agent.type === 'codex' ? 'X' : '⚙'}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>{agent.name}</div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                      {agent.role} · {selected.length} skill{selected.length === 1 ? '' : 's'} selected
                    </div>
                  </div>
                  <span style={{ fontSize: 'var(--text-sm)' }}>{isExpanded ? '▾' : '▸'}</span>
                </div>

                {isExpanded && (
                  <div style={{ padding: 'var(--space-3)' }}>
                    {selected.length > 0 && (
                      <div style={{ marginBottom: 'var(--space-3)', display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)' }}>
                        {selected.map(name => (
                          <span
                            key={name}
                            className="role-badge worker"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                          >
                            {name}
                            <button
                              className="btn-icon"
                              style={{ padding: 0, marginLeft: 4, fontSize: 'var(--text-xs)' }}
                              onClick={() => removeCustomSkill(agent.id, name)}
                              title="Remove"
                            >✕</button>
                          </span>
                        ))}
                      </div>
                    )}

                    {isClaude ? (
                      <>
                        <input
                          className="form-input"
                          placeholder="Filter skills..."
                          value={filter}
                          onChange={e => setFilter(e.target.value)}
                          style={{ marginBottom: 'var(--space-2)' }}
                        />
                        <div style={{
                          maxHeight: 280,
                          overflow: 'auto',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 'var(--radius-sm)',
                          padding: 'var(--space-2)',
                        }}>
                          {filteredSkills.length === 0 && (
                            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                              {claudeSkills.length === 0
                                ? 'No skills detected. Place skills under ~/.claude/skills/<name>/SKILL.md'
                                : 'No matches for filter.'}
                            </div>
                          )}
                          {filteredSkills.map(skill => {
                            const isChecked = selected.includes(skill.name);
                            return (
                              <label
                                key={`${skill.source}|${skill.name}`}
                                style={{
                                  display: 'flex',
                                  alignItems: 'flex-start',
                                  gap: 'var(--space-2)',
                                  padding: 'var(--space-1) var(--space-2)',
                                  cursor: 'pointer',
                                  borderRadius: 'var(--radius-sm)',
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => toggleClaudeSkill(agent.id, skill.name)}
                                  style={{ marginTop: 4 }}
                                />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>
                                    {skill.name}
                                    <span style={{
                                      marginLeft: 'var(--space-2)',
                                      fontSize: 'var(--text-xs)',
                                      color: 'var(--text-muted)',
                                      fontWeight: 400,
                                    }}>
                                      {skill.source}
                                    </span>
                                  </div>
                                  {skill.description && (
                                    <div style={{
                                      fontSize: 'var(--text-xs)',
                                      color: 'var(--text-muted)',
                                      lineHeight: 1.4,
                                      marginTop: 2,
                                    }}>
                                      {skill.description}
                                    </div>
                                  )}
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </>
                    ) : (
                      <>
                        <label className="form-label">Add skill names (comma-separated)</label>
                        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                          <input
                            className="form-input"
                            placeholder="e.g. code-review, tdd, refactor"
                            value={customInput[agent.id] || ''}
                            onChange={e => setCustomInput(prev => ({ ...prev, [agent.id]: e.target.value }))}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomSkill(agent.id); } }}
                          />
                          <button className="btn btn-primary btn-sm" onClick={() => addCustomSkill(agent.id)}>
                            Add
                          </button>
                        </div>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 'var(--space-1)' }}>
                          Gemini/Codex/Custom CLIs — skill names are injected as prompt hints.
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="modal-footer">
          <button className="btn btn-primary" onClick={close}>Done</button>
        </div>
      </div>
    </div>
  );
}
