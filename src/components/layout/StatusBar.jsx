import React from 'react';
import { useApp } from '../../context/AppContext';

export default function StatusBar() {
  const { state } = useApp();
  const { orchestratorStatus, agents, tasks, phase, workingDirectory } = state;

  const masterAgent = agents.find(a => a.role === 'master');
  const workerCount = agents.filter(a => a.role === 'worker').length;
  const completedTasks = tasks.filter(t => t.status === 'completed').length;
  const totalTasks = tasks.length;

  const statusMap = {
    idle: 'Ready',
    decomposing: 'Decomposing...',
    executing: 'Executing...',
    reviewing: 'Reviewing...',
    revising: 'Revising...',
    completed: 'Completed',
    failed: 'Failed',
    aborted: 'Aborted',
    running: 'Running...',
  };

  return (
    <footer className="status-bar">
      <div className="status-bar-left">
        <div className="status-indicator">
          <div className={`status-dot ${orchestratorStatus === 'running' || phase === 'decomposing' || phase === 'executing' || phase === 'reviewing' ? 'running' : orchestratorStatus === 'completed' || phase === 'completed' ? 'completed' : orchestratorStatus === 'failed' ? 'failed' : 'idle'}`} />
          <span>{statusMap[phase] || statusMap[orchestratorStatus] || 'Ready'}</span>
        </div>
        {masterAgent && (
          <span>Master: {masterAgent.name}</span>
        )}
        <span>Workers: {workerCount}</span>
        {totalTasks > 0 && (
          <span>Tasks: {completedTasks}/{totalTasks}</span>
        )}
      </div>
      <div className="status-bar-right">
        {workingDirectory && (
          <span className="truncate" style={{ maxWidth: 300 }}>
            📁 {workingDirectory}
          </span>
        )}
      </div>
    </footer>
  );
}
