import React from 'react';
import { useApp } from '../../context/AppContext';

const PHASES = ['decomposing', 'executing', 'reviewing', 'completed'];
const PHASE_LABELS = {
  decomposing: '🎯 Decompose',
  executing: '⚡ Execute',
  reviewing: '🔍 Review',
  completed: '✅ Done',
};

export default function PhaseIndicator() {
  const { state } = useApp();
  const { phase } = state;

  const getPhaseStatus = (p) => {
    const currentIdx = PHASES.indexOf(phase);
    const phaseIdx = PHASES.indexOf(p);

    // Handle special states
    if (phase === 'decomposed') {
      if (p === 'decomposing') return 'completed';
      return 'pending';
    }
    if (phase === 'revising') {
      if (p === 'decomposing' || p === 'executing') return 'completed';
      if (p === 'reviewing') return 'active';
      return 'pending';
    }
    if (phase === 'failed' || phase === 'aborted') {
      if (phaseIdx < currentIdx) return 'completed';
      if (phaseIdx === currentIdx) return 'failed';
      return 'pending';
    }

    if (phaseIdx < currentIdx) return 'completed';
    if (phaseIdx === currentIdx) return 'active';
    return 'pending';
  };

  return (
    <div className="phase-indicator">
      {PHASES.map((p, i) => (
        <React.Fragment key={p}>
          <div className={`phase-step ${getPhaseStatus(p)}`}>
            <div className="phase-step-dot" />
            <span>{PHASE_LABELS[p]}</span>
          </div>
          {i < PHASES.length - 1 && (
            <div className={`phase-connector ${getPhaseStatus(p) === 'completed' ? 'completed' : ''}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}
