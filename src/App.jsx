import React from 'react';
import { useApp } from './context/AppContext';
import Header from './components/layout/Header';
import Sidebar from './components/layout/Sidebar';
import StatusBar from './components/layout/StatusBar';
import PromptInput from './components/pipeline/PromptInput';
import PhaseIndicator from './components/pipeline/PhaseIndicator';
import TaskBoard from './components/pipeline/TaskBoard';
import OutputConsole from './components/output/OutputConsole';
import AgentModal from './components/config/AgentModal';
import TaskDetailModal from './components/pipeline/TaskDetailModal';

export default function App() {
  const { state } = useApp();

  return (
    <div className="app-container">
      <Header />
      <div className="app-body">
        <Sidebar />
        <div className="main-content">
          <div className="content-area">
            <div className="pipeline-panel">
              <PromptInput />
              {state.phase !== 'idle' && <PhaseIndicator />}
              <TaskBoard />
            </div>
            <div className="output-panel">
              <OutputConsole />
            </div>
          </div>
        </div>
      </div>
      <StatusBar />
      {state.showAgentModal && <AgentModal />}
      {state.showTaskDetail && <TaskDetailModal />}
    </div>
  );
}
