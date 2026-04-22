import React, { useRef, useEffect, useMemo } from 'react';
import { useApp } from '../../context/AppContext';

export default function OutputConsole() {
  const { state, dispatch } = useApp();
  const { outputLines, activeOutputTab, tasks, reviewResults } = state;
  const bodyRef = useRef(null);
  const autoScrollRef = useRef(true);

  // Auto-scroll to bottom on new output
  useEffect(() => {
    if (bodyRef.current && autoScrollRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [outputLines.length]);

  // Handle scroll — disable auto-scroll when user scrolls up
  const handleScroll = () => {
    if (!bodyRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = bodyRef.current;
    autoScrollRef.current = scrollHeight - scrollTop - clientHeight < 50;
  };

  // Build tabs from tasks
  const tabs = useMemo(() => {
    const t = [{ id: 'all', label: 'All Output' }];
    tasks.forEach(task => {
      t.push({ id: `task-${task.id}`, label: `T-${task.id}` });
    });
    return t;
  }, [tasks]);

  // Filter output lines based on active tab
  const filteredLines = useMemo(() => {
    if (activeOutputTab === 'all') return outputLines;
    const taskId = parseInt(activeOutputTab.replace('task-', ''));
    return outputLines.filter(l => l.taskId === taskId || l.type === 'system');
  }, [outputLines, activeOutputTab]);

  const formatTimestamp = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  // Get latest review
  const latestReview = reviewResults.length > 0 ? reviewResults[reviewResults.length - 1] : null;

  return (
    <>
      {/* Output Header */}
      <div className="output-header">
        <h3>📟 Output</h3>
        <button
          className="btn-icon"
          title="Clear output"
          onClick={() => dispatch({ type: 'CLEAR_OUTPUT' })}
          style={{ fontSize: 'var(--text-xs)' }}
        >
          🗑️
        </button>
      </div>

      {/* Output Tabs */}
      {tabs.length > 1 && (
        <div className="output-tabs">
          {tabs.map(tab => (
            <div
              key={tab.id}
              className={`output-tab ${activeOutputTab === tab.id ? 'active' : ''}`}
              onClick={() => dispatch({ type: 'SET_ACTIVE_TAB', payload: tab.id })}
            >
              {tab.label}
            </div>
          ))}
        </div>
      )}

      {/* Output Body */}
      <div className="output-body" ref={bodyRef} onScroll={handleScroll}>
        {filteredLines.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: 'var(--text-muted)',
            fontSize: 'var(--text-xs)',
            gap: 'var(--space-2)',
          }}>
            <span style={{ fontSize: 20 }}>📟</span>
            <span>Agent output will appear here</span>
          </div>
        ) : (
          filteredLines.map((line, i) => (
            <div key={i} className={`output-line ${line.type}`}>
              <span className="output-timestamp">
                {formatTimestamp(line.timestamp)}
              </span>
              {line.agentName && (
                <span className="output-agent-label">[{line.agentName}]</span>
              )}
              {line.text}
            </div>
          ))
        )}
      </div>

      {/* Review Panel */}
      {latestReview && (
        <div className="review-panel">
          <div className="review-header">
            <h3>
              🔍 Review
              <span className={`review-status ${latestReview.result?.overall_status || 'approved'}`} style={{ marginLeft: 8 }}>
                {latestReview.result?.overall_status === 'approved' ? '✅ Approved' : '⚠️ Revisions Needed'}
              </span>
            </h3>
            <span className="text-xs text-muted">Round {latestReview.round}</span>
          </div>
          <div className="review-body">
            {latestReview.result?.overall_feedback && (
              <div style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--text-secondary)',
                marginBottom: 'var(--space-3)',
                lineHeight: 1.6,
              }}>
                {latestReview.result.overall_feedback}
              </div>
            )}
            {latestReview.result?.tasks?.map(rt => (
              <div key={rt.id} className="review-task-item">
                <div className="review-task-item-header">
                  <span className="task-card-id">T-{rt.id}</span>
                  <span className={`review-status ${rt.status}`}>
                    {rt.status === 'approved' ? '✅' : '⚠️'} {rt.status}
                    {rt.quality_score && ` (${rt.quality_score}/10)`}
                  </span>
                </div>
                <div className="review-task-item-feedback">{rt.feedback}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
