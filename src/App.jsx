import React, { Suspense, lazy, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useApp } from './context/AppContext';
import Header from './components/layout/Header';
import Sidebar from './components/layout/Sidebar';
import StatusBar from './components/layout/StatusBar';
import PromptInput from './components/pipeline/PromptInput';
import PhaseIndicator from './components/pipeline/PhaseIndicator';
import TaskBoard from './components/pipeline/TaskBoard';
import OutputConsole from './components/output/OutputConsole';
// PermissionModal is always mounted (returns null when no pending request)
// so it stays eager — Suspense fallbacks aren't useful for it.
import PermissionModal from './components/permission/PermissionModal';
import { TooltipProvider } from '@/components/ui/tooltip';

// Modal code is lazy-loaded — only fetched the first time the user opens
// the corresponding modal. Cuts initial JS parse on cold start.
const AgentModal = lazy(() => import('./components/config/AgentModal'));
const TaskDetailModal = lazy(() => import('./components/pipeline/TaskDetailModal'));
const SkillsModal = lazy(() => import('./components/pipeline/SkillsModal'));

function AuroraBackdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full bg-primary/20 blur-3xl animate-aurora-1" />
      <div className="absolute -bottom-40 -right-40 h-[500px] w-[500px] rounded-full bg-accent/20 blur-3xl animate-aurora-2" />
      <div className="absolute top-1/2 left-1/2 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-info/10 blur-3xl animate-float" />
      <div className="absolute inset-0 bg-grid opacity-[0.04]" />
    </div>
  );
}

function useVisibilityPause() {
  useEffect(() => {
    const apply = () => {
      document.body.dataset.paused = document.visibilityState === 'hidden' ? '1' : '';
    };
    apply();
    document.addEventListener('visibilitychange', apply);
    window.addEventListener('blur', apply);
    window.addEventListener('focus', apply);
    return () => {
      document.removeEventListener('visibilitychange', apply);
      window.removeEventListener('blur', apply);
      window.removeEventListener('focus', apply);
    };
  }, []);
}

export default function App() {
  const { state } = useApp();
  useVisibilityPause();

  return (
    <TooltipProvider delayDuration={200}>
      <AuroraBackdrop />
      <div className="flex flex-col h-screen overflow-hidden">
        <Header />
        <div className="flex flex-1 overflow-hidden pt-10">
          <Sidebar />
          <main className="flex-1 flex flex-col overflow-hidden min-w-0">
            <div className="flex-1 flex overflow-hidden">
              <motion.section
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
                className="flex-1 flex flex-col overflow-hidden min-w-0"
              >
                <PromptInput />
                {state.phase !== 'idle' && <PhaseIndicator />}
                <TaskBoard />
              </motion.section>
              <motion.aside
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, ease: 'easeOut', delay: 0.1 }}
                className="w-[420px] min-w-[340px] max-w-[520px] flex flex-col border-l border-border/40 bg-background/30 backdrop-blur-xl"
              >
                <OutputConsole />
              </motion.aside>
            </div>
          </main>
        </div>
        <StatusBar />
        <Suspense fallback={null}>
          {state.showAgentModal && <AgentModal />}
          {state.showTaskDetail && <TaskDetailModal />}
          {state.showSkillsModal && <SkillsModal />}
        </Suspense>
        <PermissionModal />
      </div>
    </TooltipProvider>
  );
}
