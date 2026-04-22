import React from 'react';

export default function Header() {
  return (
    <header className="header">
      <div className="header-left">
        <div className="header-logo">
          <div className="header-logo-icon">⚡</div>
          <span>Master Orchestrator</span>
        </div>
      </div>
      <div className="header-center" />
      <div className="header-right" />
    </header>
  );
}
