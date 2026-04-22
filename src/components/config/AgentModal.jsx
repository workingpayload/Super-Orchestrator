import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';

const AGENT_TYPES = [
  { value: 'claude', label: 'Claude', icon: 'C' },
  { value: 'gemini', label: 'Gemini', icon: 'G' },
  { value: 'codex', label: 'Codex', icon: 'X' },
  { value: 'custom', label: 'Custom', icon: '⚙' },
];

const AGENT_MODELS = {
  claude: [
    { value: '', label: 'CLI Default' },
    { value: 'claude-opus-4-7', label: 'Opus 4.7' },
    { value: 'claude-opus-4-6', label: 'Opus 4.6' },
    { value: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
    { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
  ],
  gemini: [
    { value: '', label: 'CLI Default' },
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
  ],
  codex: [
    { value: '', label: 'CLI Default' },
    { value: 'o4-mini', label: 'o4-mini' },
    { value: 'o3', label: 'o3' },
    { value: 'gpt-4.1', label: 'GPT-4.1' },
  ],
  custom: [],
};

const ROLES = [
  { value: 'master', label: '🎯 Master', description: 'Decomposes prompts into tasks' },
  { value: 'worker', label: '⚡ Worker', description: 'Executes assigned tasks' },
  { value: 'reviewer', label: '🔍 Reviewer', description: 'Reviews completed work' },
];

export default function AgentModal() {
  const { state, dispatch, addAgent, updateAgent, removeAgent, checkAgentHealth } = useApp();
  const { editingAgent } = state;

  const isEditing = !!editingAgent;

  const [form, setForm] = useState({
    name: '',
    type: 'claude',
    role: 'worker',
    cliPath: '',
    model: '',
    extraFlags: '',
    enabled: true,
  });

  const [healthResult, setHealthResult] = useState(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (editingAgent) {
      setForm({
        name: editingAgent.name || '',
        type: editingAgent.type || 'claude',
        role: editingAgent.role || 'worker',
        cliPath: editingAgent.cliPath || '',
        model: editingAgent.model || '',
        extraFlags: (editingAgent.extraFlags || []).join(' '),
        enabled: editingAgent.enabled !== false,
      });
    } else {
      setForm({
        name: '',
        type: 'claude',
        role: 'worker',
        cliPath: '',
        model: '',
        extraFlags: '',
        enabled: true,
      });
    }
    setHealthResult(null);
  }, [editingAgent]);

  const TYPE_DEFAULTS = {
    claude: { name: 'Claude', cliPath: 'claude' },
    gemini: { name: 'Gemini', cliPath: 'gemini' },
    codex:  { name: 'Codex',  cliPath: 'codex' },
    custom: { name: '',       cliPath: '' },
  };

  const handleTypeChange = (newType) => {
    const defaults = TYPE_DEFAULTS[newType] || { name: '', cliPath: '' };
    setForm(prev => ({
      ...prev,
      type: newType,
      name: defaults.name,
      cliPath: defaults.cliPath,
      model: '',
    }));
  };

  const close = () => dispatch({ type: 'HIDE_AGENT_MODAL' });

  const handleSave = async () => {
    const config = {
      name: form.name || AGENT_TYPES.find(t => t.value === form.type)?.label || 'Agent',
      type: form.type,
      role: form.role,
      cliPath: form.cliPath || form.type,
      model: form.model || '',
      extraFlags: form.extraFlags ? form.extraFlags.split(/\s+/).filter(Boolean) : [],
      enabled: form.enabled,
    };

    if (isEditing) {
      await updateAgent(editingAgent.id, config);
    } else {
      await addAgent(config);
    }
    close();
  };

  const handleDelete = async () => {
    if (isEditing && editingAgent) {
      await removeAgent(editingAgent.id);
      close();
    }
  };

  const handleHealthCheck = async () => {
    setChecking(true);
    setHealthResult(null);
    try {
      if (isEditing) {
        const result = await checkAgentHealth(editingAgent.id);
        setHealthResult(result);
      }
    } catch (e) {
      setHealthResult({ available: false, error: e.message });
    }
    setChecking(false);
  };

  return (
    <div className="modal-overlay" onClick={close}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{isEditing ? 'Edit Agent' : 'Add Agent'}</h2>
          <button className="btn-icon" onClick={close}>✕</button>
        </div>

        <div className="modal-body">
          {/* Agent Type */}
          <div className="form-group">
            <label className="form-label">Agent Type</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-2)' }}>
              {AGENT_TYPES.map(type => (
                <div
                  key={type.value}
                  className={`agent-card ${form.type === type.value ? 'selected' : ''}`}
                  onClick={() => handleTypeChange(type.value)}
                  style={{ justifyContent: 'center', flexDirection: 'column', padding: 'var(--space-3)', textAlign: 'center', cursor: 'pointer' }}
                >
                  <div className={`agent-card-icon ${type.value}`} style={{ width: 32, height: 32, margin: '0 auto var(--space-1)', fontSize: 'var(--text-sm)' }}>
                    {type.icon}
                  </div>
                  <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>{type.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Name */}
          <div className="form-group">
            <label className="form-label">Name</label>
            <input
              className="form-input"
              value={form.name}
              onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Agent name"
            />
          </div>

          {/* Role */}
          <div className="form-group">
            <label className="form-label">Role</label>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              {ROLES.map(role => (
                <div
                  key={role.value}
                  className={`agent-card ${form.role === role.value ? 'selected' : ''}`}
                  onClick={() => setForm(prev => ({ ...prev, role: role.value }))}
                  style={{ flex: 1, flexDirection: 'column', padding: 'var(--space-2)', cursor: 'pointer' }}
                >
                  <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>{role.label}</span>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{role.description}</span>
                </div>
              ))}
            </div>
          </div>

          {/* CLI Path */}
          <div className="form-group">
            <label className="form-label">CLI Command / Path</label>
            <input
              className="form-input"
              value={form.cliPath}
              onChange={e => setForm(prev => ({ ...prev, cliPath: e.target.value }))}
              placeholder="e.g. claude, gemini, or full path"
              style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}
            />
          </div>

          {/* Model */}
          {AGENT_MODELS[form.type]?.length > 0 && (
            <div className="form-group">
              <label className="form-label">Model</label>
              <select
                className="form-select"
                value={form.model}
                onChange={e => setForm(prev => ({ ...prev, model: e.target.value }))}
              >
                {AGENT_MODELS[form.type].map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Extra Flags */}
          <div className="form-group">
            <label className="form-label">Extra Flags (optional)</label>
            <input
              className="form-input"
              value={form.extraFlags}
              onChange={e => setForm(prev => ({ ...prev, extraFlags: e.target.value }))}
              placeholder="e.g. --bare --model gpt-4"
              style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}
            />
          </div>

          {/* Health Check */}
          {isEditing && (
            <div className="form-group">
              <label className="form-label">Health Check</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={handleHealthCheck}
                  disabled={checking}
                >
                  {checking ? '🔄 Checking...' : '🏥 Check Health'}
                </button>
                {healthResult && (
                  <span style={{
                    fontSize: 'var(--text-xs)',
                    color: healthResult.available ? 'var(--color-success)' : 'var(--color-error)',
                  }}>
                    {healthResult.available
                      ? `✅ Available (${healthResult.version})`
                      : `❌ ${healthResult.error}`
                    }
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Enabled toggle */}
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={e => setForm(prev => ({ ...prev, enabled: e.target.checked }))}
              />
              <span className="form-label" style={{ margin: 0 }}>Enabled</span>
            </label>
          </div>
        </div>

        <div className="modal-footer">
          {isEditing && (
            <button className="btn btn-danger btn-sm" onClick={handleDelete} style={{ marginRight: 'auto' }}>
              🗑️ Delete
            </button>
          )}
          <button className="btn btn-ghost" onClick={close}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave}>
            {isEditing ? 'Save Changes' : 'Add Agent'}
          </button>
        </div>
      </div>
    </div>
  );
}
