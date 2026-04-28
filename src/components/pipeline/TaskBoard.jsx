import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ClipboardList,
  Loader2,
  Eye,
  CheckCircle2,
  RotateCcw,
  AlertTriangle,
  XCircle,
  Sparkles,
  LayoutGrid,
  RefreshCw,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

const COLUMNS = [
  { id: 'queued', title: 'Queued', icon: ClipboardList, color: 'text-muted-foreground' },
  { id: 'running', title: 'Running', icon: Loader2, color: 'text-primary' },
  { id: 'review', title: 'Review', icon: Eye, color: 'text-warning' },
  { id: 'done', title: 'Done', icon: CheckCircle2, color: 'text-success' },
];

const TYPE_COLOR = {
  claude: 'bg-amber-500',
  gemini: 'bg-blue-500',
  codex: 'bg-emerald-500',
  custom: 'bg-violet-500',
};

const PRIORITY_DOT = {
  high: 'bg-destructive shadow-[0_0_6px_hsl(var(--destructive))]',
  medium: 'bg-warning shadow-[0_0_6px_hsl(var(--warning))]',
  low: 'bg-success shadow-[0_0_6px_hsl(var(--success))]',
};

const COMPLEXITY_LABEL = {
  complex: { label: 'complex', cls: 'text-destructive' },
  moderate: { label: 'moderate', cls: 'text-warning' },
  simple: { label: 'simple', cls: 'text-success' },
};

function TaskCard({ task, onClick, onRetry }) {
  const compl = COMPLEXITY_LABEL[task.estimated_complexity] || COMPLEXITY_LABEL.simple;

  return (
    <motion.div
      layout
      layoutId={`task-${task.id}`}
      initial={{ opacity: 0, scale: 0.92, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.85, y: -8 }}
      whileHover={{ y: -3, scale: 1.015 }}
      transition={{ type: 'spring', stiffness: 350, damping: 28 }}
      onClick={onClick}
      className={cn(
        'group relative cursor-pointer rounded-xl p-3 border bg-card/70 backdrop-blur shadow-sm hover:shadow-lg hover:shadow-primary/10 transition-shadow overflow-hidden',
        task.status === 'running' && 'border-primary/60 shadow-[0_0_20px_hsl(var(--primary)/0.25)]',
        task.status === 'failed' && 'border-destructive/40',
        task.reviewStatus === 'revision_needed' && 'border-warning/40',
        task.reviewStatus === 'approved' && 'border-success/40',
        !task.status === 'running' && 'border-border/60'
      )}
    >
      {task.status === 'running' && (
        <div className="absolute top-0 left-0 right-0 h-0.5 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary to-transparent animate-shimmer" />
        </div>
      )}

      <div className="flex items-start justify-between mb-2">
        <span className="text-[10px] font-bold font-mono text-primary tracking-wider">
          T-{task.id}
        </span>
        <span
          className={cn('h-1.5 w-1.5 rounded-full mt-1', PRIORITY_DOT[task.priority] || PRIORITY_DOT.low)}
          title={task.priority}
        />
      </div>

      <div className="text-sm font-semibold leading-snug line-clamp-2 mb-2">
        {task.title}
      </div>

      <div className="flex items-center justify-between text-[10px]">
        {task.assignedAgent ? (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <span
              className={cn('h-1.5 w-1.5 rounded-full', TYPE_COLOR[task.assignedAgent.type] || TYPE_COLOR.custom)}
            />
            <span className="truncate max-w-[100px]">{task.assignedAgent.name}</span>
          </div>
        ) : (
          <span className="text-muted-foreground/50">unassigned</span>
        )}
        <span className={cn('font-mono uppercase tracking-wider', compl.cls)}>
          {compl.label}
        </span>
      </div>

      {task.status === 'failed' && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="mt-2 flex items-center justify-between gap-1 text-[10px] text-destructive"
        >
          <span className="flex items-center gap-1 truncate">
            <XCircle className="h-3 w-3 shrink-0" />
            <span className="truncate">{task.error}</span>
          </span>
          <Button
            variant="ghost"
            size="xs"
            className="h-5 px-1.5 shrink-0 text-destructive hover:bg-destructive/10"
            onClick={(e) => {
              e.stopPropagation();
              onRetry(task.id);
            }}
          >
            <RotateCcw className="h-3 w-3" />
          </Button>
        </motion.div>
      )}
      {task.reviewStatus === 'revision_needed' && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="mt-2 flex items-center justify-between gap-1 text-[10px] text-warning"
        >
          <span className="flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            Revision needed
          </span>
          <Button
            variant="ghost"
            size="xs"
            className="h-5 px-1.5 text-warning hover:bg-warning/10"
            onClick={(e) => {
              e.stopPropagation();
              onRetry(task.id);
            }}
          >
            <RotateCcw className="h-3 w-3" />
          </Button>
        </motion.div>
      )}
      {task.reviewStatus === 'approved' && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="mt-2 flex items-center gap-1 text-[10px] text-success"
        >
          <CheckCircle2 className="h-3 w-3" />
          Approved
        </motion.div>
      )}
    </motion.div>
  );
}

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className="flex-1 flex flex-col items-center justify-center px-10 py-16 text-center"
    >
      <motion.div
        animate={{ y: [0, -10, 0] }}
        transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}
        className="relative mb-6"
      >
        <div className="absolute inset-0 bg-primary/30 blur-3xl rounded-full" />
        <div className="relative h-20 w-20 rounded-2xl bg-gradient-to-br from-primary via-accent to-info flex items-center justify-center shadow-2xl shadow-primary/40">
          <Sparkles className="h-10 w-10 text-white" />
        </div>
      </motion.div>
      <h3 className="text-2xl font-bold mb-2 gradient-text">Ready to Orchestrate</h3>
      <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
        Drop a prompt above and your agents will decompose it into tasks, run them in parallel, and review the work — all
        automatically.
      </p>
    </motion.div>
  );
}

export default function TaskBoard() {
  const { state, dispatch, retryTask, retriggerReview } = useApp();
  const { tasks } = state;

  const colTasks = (id) => {
    switch (id) {
      case 'queued':
        return tasks.filter((t) => t.status === 'queued');
      case 'running':
        return tasks.filter((t) => t.status === 'running');
      case 'review':
        return tasks.filter((t) => t.status === 'completed' && t.reviewStatus === 'revision_needed');
      case 'done':
        return tasks.filter(
          (t) => (t.status === 'completed' && t.reviewStatus !== 'revision_needed') || t.status === 'failed'
        );
      default:
        return [];
    }
  };

  if (tasks.length === 0) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <EmptyState />
      </div>
    );
  }

  const completed = tasks.filter((t) => t.status === 'completed').length;
  const canReview = tasks.some((t) => t.status === 'completed') && state.orchestratorStatus !== 'running';

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <LayoutGrid className="h-4 w-4 text-primary" />
          <h2 className="text-base font-bold tracking-tight">Task Board</h2>
          <Badge variant="outline" className="ml-2 font-mono">
            {completed}/{tasks.length}
          </Badge>
        </div>
        {canReview && (
          <Button variant="outline" size="sm" onClick={retriggerReview} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            Re-review
          </Button>
        )}
      </div>

      <div className="grid grid-cols-4 gap-3 flex-1 min-h-0">
        {COLUMNS.map((col) => {
          const colData = colTasks(col.id);
          const Icon = col.icon;
          return (
            <motion.div
              key={col.id}
              layout
              className="rounded-xl border border-border/60 bg-card/30 backdrop-blur-md flex flex-col min-h-0 overflow-hidden"
            >
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/50 bg-secondary/30">
                <div className="flex items-center gap-1.5">
                  <Icon className={cn('h-3.5 w-3.5', col.color, col.id === 'running' && 'animate-spin')} />
                  <span className="text-[11px] font-bold uppercase tracking-wider">{col.title}</span>
                </div>
                <Badge variant="secondary" className="h-4 px-1.5 text-[9px] font-mono">
                  {colData.length}
                </Badge>
              </div>
              <ScrollArea className="flex-1">
                <div className="p-2 space-y-2 min-h-[120px]">
                  <AnimatePresence mode="popLayout">
                    {colData.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        onClick={() => dispatch({ type: 'SET_TASK_DETAIL', payload: task })}
                        onRetry={retryTask}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              </ScrollArea>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
