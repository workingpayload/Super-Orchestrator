import React from 'react';
import { motion } from 'framer-motion';
import { FolderOpen, Crown, Zap, ListChecks, Activity } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import CostTracker from './CostTracker';
import { cn } from '@/lib/utils';

const STATUS_LABEL = {
  idle: 'Ready',
  decomposing: 'Decomposing',
  decomposed: 'Decomposed',
  executing: 'Executing',
  reviewing: 'Reviewing',
  revising: 'Revising',
  completed: 'Completed',
  failed: 'Failed',
  aborted: 'Aborted',
  running: 'Running',
};

export default function StatusBar() {
  const { state } = useApp();
  const { orchestratorStatus, agents, tasks, phase, workingDirectory } = state;

  const masterAgent = agents.find((a) => a.role === 'master');
  const workerCount = agents.filter((a) => a.role === 'worker').length;
  const completedTasks = tasks.filter((t) => t.status === 'completed').length;
  const totalTasks = tasks.length;

  const isRunning =
    orchestratorStatus === 'running' ||
    ['decomposing', 'executing', 'reviewing', 'revising'].includes(phase);
  const isDone = phase === 'completed' || orchestratorStatus === 'completed';
  const isFailed = phase === 'failed' || orchestratorStatus === 'failed';

  const dotClass = isRunning
    ? 'bg-primary shadow-[0_0_10px_hsl(var(--primary))]'
    : isDone
    ? 'bg-success shadow-[0_0_10px_hsl(var(--success))]'
    : isFailed
    ? 'bg-destructive shadow-[0_0_10px_hsl(var(--destructive))]'
    : 'bg-muted-foreground/50';

  return (
    <footer className="h-7 px-4 flex items-center justify-between border-t border-border/40 bg-background/60 backdrop-blur-xl text-[10px] text-muted-foreground select-none">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <motion.span
            animate={isRunning ? { scale: [1, 1.4, 1] } : { scale: 1 }}
            transition={{ repeat: isRunning ? Infinity : 0, duration: 1.4 }}
            className={cn('h-1.5 w-1.5 rounded-full', dotClass)}
          />
          <span className="font-semibold uppercase tracking-wider text-foreground/80">
            {STATUS_LABEL[phase] || STATUS_LABEL[orchestratorStatus] || 'Ready'}
          </span>
        </div>
        {masterAgent && (
          <span className="flex items-center gap-1">
            <Crown className="h-3 w-3 text-accent" />
            {masterAgent.name}
          </span>
        )}
        <span className="flex items-center gap-1">
          <Zap className="h-3 w-3 text-primary" />
          {workerCount} workers
        </span>
        {totalTasks > 0 && (
          <span className="flex items-center gap-1">
            <ListChecks className="h-3 w-3 text-success" />
            {completedTasks}/{totalTasks}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        {isRunning && (
          <span className="flex items-center gap-1">
            <Activity className="h-3 w-3 animate-pulse text-primary" />
            live
          </span>
        )}
        <CostTracker />
        {workingDirectory && (
          <span className="flex items-center gap-1 max-w-[320px] truncate font-mono text-[10px]">
            <FolderOpen className="h-3 w-3" />
            {workingDirectory}
          </span>
        )}
      </div>
    </footer>
  );
}
