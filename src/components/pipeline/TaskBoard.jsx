import React from 'react';
import { useApp } from '../../context/AppContext';

const COLUMNS = [
  { id: 'queued', title: '📋 Queued', icon: '⏳' },
  { id: 'running', title: '⚡ Running', icon: '🔄' },
  { id: 'review', title: '🔍 Review', icon: '👁' },
  { id: 'done', title: '✅ Done', icon: '✓' },
];

export default function TaskBoard() {
  const { state, dispatch, retryTask, retriggerReview } = useApp();
  const { tasks } = state;

  const getColumnTasks = (columnId) => {
    switch (columnId) {
      case 'queued':
        return tasks.filter(t => t.status === 'queued');
      case 'running':
        return tasks.filter(t => t.status === 'running');
      case 'review':
        return tasks.filter(t => t.status === 'completed' && t.reviewStatus === 'revision_needed');
      case 'done':
        return tasks.filter(t =>
          (t.status === 'completed' && t.reviewStatus !== 'revision_needed') ||
          t.status === 'failed'
        );
      default:
        return [];
    }
  };

  const handleTaskClick = (task) => {
    dispatch({ type: 'SET_TASK_DETAIL', payload: task });
  };

  if (tasks.length === 0) {
    return (
      <div className="task-board">
        <div className="empty-state">
          <div className="empty-state-icon">🤖</div>
          <div className="empty-state-title">Ready to Orchestrate</div>
          <div className="empty-state-description">
            Enter a prompt above and click "Orchestrate" to break it into tasks and distribute them across your AI agents.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="task-board">
      <div className="task-board-header">
        <h2>📊 Task Board</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <span className="text-xs text-muted">
            {tasks.filter(t => t.status === 'completed').length}/{tasks.length} completed
          </span>
          {tasks.some(t => t.status === 'completed') && state.orchestratorStatus !== 'running' && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={retriggerReview}
              title="Re-run review on completed tasks"
            >
              🔍 Re-review
            </button>
          )}
        </div>
      </div>
      <div className="task-columns">
        {COLUMNS.map(col => {
          const columnTasks = getColumnTasks(col.id);
          return (
            <div key={col.id} className="task-column">
              <div className="task-column-header">
                <span className="task-column-title">{col.title}</span>
                <span className="task-column-count">{columnTasks.length}</span>
              </div>
              <div className="task-column-body">
                {columnTasks.map(task => (
                  <div
                    key={task.id}
                    className={`task-card ${task.status}`}
                    onClick={() => handleTaskClick(task)}
                    style={{ position: 'relative', overflow: 'hidden' }}
                  >
                    <div className="task-card-header">
                      <span className="task-card-id">T-{task.id}</span>
                      <span className={`task-card-priority ${task.priority}`} title={task.priority} />
                    </div>
                    <div className="task-card-title">{task.title}</div>
                    <div className="task-card-footer">
                      <div className="task-card-agent">
                        {task.assignedAgent && (
                          <>
                            <span
                              className="task-card-agent-dot"
                              style={{
                                background: task.assignedAgent.type === 'claude' ? '#f59e0b'
                                  : task.assignedAgent.type === 'gemini' ? '#3b82f6'
                                  : task.assignedAgent.type === 'codex' ? '#10b981'
                                  : '#8b5cf6',
                              }}
                            />
                            <span>{task.assignedAgent.name}</span>
                          </>
                        )}
                      </div>
                      <span className="task-card-complexity">
                        {task.estimated_complexity === 'complex' ? '🔴' : task.estimated_complexity === 'moderate' ? '🟡' : '🟢'}
                      </span>
                    </div>
                    {task.status === 'failed' && (
                      <div style={{
                        fontSize: 'var(--text-xs)',
                        color: 'var(--color-error)',
                        marginTop: 'var(--space-1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 'var(--space-1)',
                      }}>
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          ❌ {task.error}
                        </span>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={(e) => { e.stopPropagation(); retryTask(task.id); }}
                          style={{ padding: '2px 6px', fontSize: 'var(--text-xs)', flexShrink: 0 }}
                        >
                          🔄
                        </button>
                      </div>
                    )}
                    {task.reviewStatus === 'revision_needed' && (
                      <div style={{
                        fontSize: 'var(--text-xs)',
                        color: 'var(--color-warning)',
                        marginTop: 'var(--space-1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}>
                        <span>⚠️ Revision needed</span>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={(e) => { e.stopPropagation(); retryTask(task.id); }}
                          style={{ padding: '2px 6px', fontSize: 'var(--text-xs)' }}
                        >
                          🔄
                        </button>
                      </div>
                    )}
                    {task.reviewStatus === 'approved' && (
                      <div style={{
                        fontSize: 'var(--text-xs)',
                        color: 'var(--color-success)',
                        marginTop: 'var(--space-1)',
                      }}>
                        ✅ Approved
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
