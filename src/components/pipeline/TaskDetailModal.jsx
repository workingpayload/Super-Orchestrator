import React from 'react';
import { useApp } from '../../context/AppContext';

export default function TaskDetailModal() {
  const { state, dispatch, retryTask } = useApp();
  const task = state.showTaskDetail;

  if (!task) return null;

  const close = () => dispatch({ type: 'SET_TASK_DETAIL', payload: null });

  const duration = task.startTime && task.endTime
    ? `${((task.endTime - task.startTime) / 1000).toFixed(1)}s`
    : task.startTime ? 'Running...' : '—';

  return (
    <div className="modal-overlay" onClick={close}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 640 }}>
        <div className="modal-header">
          <h2>
            <span className="task-card-id" style={{ marginRight: 8 }}>T-{task.id}</span>
            {task.title}
          </h2>
          <button className="btn-icon" onClick={close}>✕</button>
        </div>
        <div className="modal-body">
          {/* Status badges */}
          <div className="flex gap-2 items-center" style={{ marginBottom: 'var(--space-4)' }}>
            <span className={`role-badge ${task.status === 'completed' ? 'worker' : task.status === 'failed' ? 'master' : 'reviewer'}`}>
              {task.status}
            </span>
            <span className={`role-badge ${task.priority === 'high' ? 'master' : task.priority === 'medium' ? 'reviewer' : 'worker'}`}>
              {task.priority} priority
            </span>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
              ⏱ {duration}
            </span>
          </div>

          {/* Description */}
          {task.description && (
            <div className="form-group">
              <label className="form-label">Description</label>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                {task.description}
              </div>
            </div>
          )}

          {/* Prompt */}
          <div className="form-group">
            <label className="form-label">Prompt</label>
            <div style={{
              background: 'var(--bg-elevated)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-3)',
              fontSize: 'var(--text-xs)',
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-secondary)',
              lineHeight: 1.7,
              maxHeight: 200,
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
            }}>
              {task.prompt}
            </div>
          </div>

          {/* Output */}
          {task.output && (
            <div className="form-group">
              <label className="form-label">Output</label>
              <div style={{
                background: 'var(--bg-elevated)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-3)',
                fontSize: 'var(--text-xs)',
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-secondary)',
                lineHeight: 1.7,
                maxHeight: 300,
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
              }}>
                {task.output}
              </div>
            </div>
          )}

          {/* Error */}
          {task.error && (
            <div className="form-group">
              <label className="form-label" style={{ color: 'var(--color-error)' }}>Error</label>
              <div style={{
                background: 'var(--color-error-muted)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-3)',
                fontSize: 'var(--text-xs)',
                fontFamily: 'var(--font-mono)',
                color: 'var(--color-error)',
                lineHeight: 1.7,
              }}>
                {task.error}
              </div>
            </div>
          )}

          {/* Review feedback */}
          {task.reviewFeedback && (
            <div className="form-group">
              <label className="form-label">Review Feedback</label>
              <div style={{
                background: task.reviewStatus === 'approved' ? 'var(--color-success-muted)' : 'var(--color-warning-muted)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-3)',
                fontSize: 'var(--text-sm)',
                color: 'var(--text-secondary)',
                lineHeight: 1.6,
              }}>
                <div style={{ fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                  {task.reviewStatus === 'approved' ? '✅ Approved' : '⚠️ Revision Needed'}
                  {task.qualityScore && ` (${task.qualityScore}/10)`}
                </div>
                {task.reviewFeedback}
                {task.reviewSuggestion && (
                  <div style={{ marginTop: 'var(--space-2)', fontStyle: 'italic' }}>
                    💡 {task.reviewSuggestion}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Assigned agent */}
          {task.assignedAgent && (
            <div className="form-group">
              <label className="form-label">Assigned Agent</label>
              <div className="flex gap-2 items-center">
                <div className={`agent-card-icon ${task.assignedAgent.type}`} style={{ width: 28, height: 28, fontSize: 'var(--text-sm)' }}>
                  {task.assignedAgent.type === 'claude' ? 'C' : task.assignedAgent.type === 'gemini' ? 'G' : task.assignedAgent.type === 'codex' ? 'X' : '⚙'}
                </div>
                <span style={{ fontSize: 'var(--text-sm)' }}>{task.assignedAgent.name}</span>
              </div>
            </div>
          )}
        </div>
        <div className="modal-footer">
          {task.status === 'failed' && (
            <button
              className="btn btn-primary btn-sm"
              onClick={() => { retryTask(task.id); close(); }}
              style={{ marginRight: 'auto' }}
            >
              🔄 Retry Task
            </button>
          )}
          {task.reviewStatus === 'revision_needed' && (
            <button
              className="btn btn-primary btn-sm"
              onClick={() => { retryTask(task.id); close(); }}
              style={{ marginRight: 'auto' }}
            >
              🔄 Re-run Task
            </button>
          )}
          <button className="btn btn-ghost" onClick={close}>Close</button>
        </div>
      </div>
    </div>
  );
}
