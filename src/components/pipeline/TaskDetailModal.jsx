import React from 'react';
import { motion } from 'framer-motion';
import {
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Lightbulb,
  RotateCcw,
  Bot,
  FileText,
  Terminal,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

const TYPE_GRADIENT = {
  claude: 'from-amber-500 to-orange-600',
  gemini: 'from-blue-500 to-cyan-500',
  codex: 'from-emerald-500 to-green-600',
  custom: 'from-violet-500 to-purple-600',
};

const TYPE_LETTER = { claude: 'C', gemini: 'G', codex: 'X', custom: '⚙' };

const STATUS_VARIANT = {
  completed: 'success',
  failed: 'destructive',
  running: 'default',
  queued: 'secondary',
};

const PRIORITY_VARIANT = { high: 'destructive', medium: 'warning', low: 'success' };

function CodeBlock({ children, className }) {
  return (
    <pre
      className={cn(
        'text-xs font-mono whitespace-pre-wrap break-words leading-relaxed bg-secondary/40 border border-border/60 rounded-lg p-3 max-h-72 overflow-auto scrollbar-thin',
        className
      )}
    >
      {children}
    </pre>
  );
}

function Section({ icon: Icon, label, children }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Icon className="h-3 w-3 text-muted-foreground" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</span>
      </div>
      {children}
    </div>
  );
}

export default function TaskDetailModal() {
  const { state, dispatch, retryTask } = useApp();
  const task = state.showTaskDetail;
  if (!task) return null;

  const open = Boolean(task);
  const close = () => dispatch({ type: 'SET_TASK_DETAIL', payload: null });

  const duration =
    task.startTime && task.endTime
      ? `${((task.endTime - task.startTime) / 1000).toFixed(1)}s`
      : task.startTime
      ? 'Running…'
      : '—';

  return (
    <Dialog open={open} onOpenChange={(v) => !v && close()}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-5 pb-3 border-b border-border/60">
          <div className="flex items-center gap-3 pr-8">
            <Badge variant="default" className="font-mono">
              T-{task.id}
            </Badge>
            <DialogTitle className="text-lg leading-tight">{task.title}</DialogTitle>
          </div>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <Badge variant={STATUS_VARIANT[task.status] || 'secondary'}>{task.status}</Badge>
            <Badge variant={PRIORITY_VARIANT[task.priority] || 'secondary'}>{task.priority} priority</Badge>
            <span className="flex items-center gap-1 text-xs text-muted-foreground ml-auto">
              <Clock className="h-3 w-3" />
              {duration}
            </span>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-5">
          <div className="space-y-5 py-4">
            {task.description && (
              <Section icon={FileText} label="Description">
                <p className="text-sm text-foreground/85 leading-relaxed">{task.description}</p>
              </Section>
            )}

            <Section icon={Terminal} label="Prompt">
              <CodeBlock>{task.prompt}</CodeBlock>
            </Section>

            {task.output && (
              <Section icon={Terminal} label="Output">
                <CodeBlock>{task.output}</CodeBlock>
              </Section>
            )}

            {task.error && (
              <Section icon={XCircle} label="Error">
                <pre className="text-xs font-mono whitespace-pre-wrap break-words leading-relaxed bg-destructive/10 border border-destructive/30 text-destructive rounded-lg p-3">
                  {task.error}
                </pre>
              </Section>
            )}

            {task.reviewFeedback && (
              <Section
                icon={task.reviewStatus === 'approved' ? CheckCircle2 : AlertTriangle}
                label="Review Feedback"
              >
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    'rounded-lg p-3 border text-sm leading-relaxed space-y-2',
                    task.reviewStatus === 'approved'
                      ? 'bg-success/10 border-success/30 text-success-foreground'
                      : 'bg-warning/10 border-warning/30 text-warning-foreground'
                  )}
                >
                  <div className="flex items-center gap-1.5 font-bold text-sm">
                    {task.reviewStatus === 'approved' ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-success" />
                        <span className="text-success">Approved</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="h-4 w-4 text-warning" />
                        <span className="text-warning">Revision Needed</span>
                      </>
                    )}
                    {task.qualityScore && (
                      <Badge variant="outline" className="ml-1 font-mono">
                        {task.qualityScore}/10
                      </Badge>
                    )}
                  </div>
                  <div className="text-foreground/90">{task.reviewFeedback}</div>
                  {task.reviewSuggestion && (
                    <div className="flex items-start gap-2 italic text-foreground/80">
                      <Lightbulb className="h-3.5 w-3.5 mt-0.5 shrink-0 text-warning" />
                      {task.reviewSuggestion}
                    </div>
                  )}
                </motion.div>
              </Section>
            )}

            {task.assignedAgent && (
              <>
                <Separator />
                <Section icon={Bot} label="Assigned Agent">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        'h-9 w-9 rounded-lg bg-gradient-to-br flex items-center justify-center text-white font-bold shadow-md',
                        TYPE_GRADIENT[task.assignedAgent.type] || TYPE_GRADIENT.custom
                      )}
                    >
                      {TYPE_LETTER[task.assignedAgent.type] || '⚙'}
                    </div>
                    <div>
                      <div className="text-sm font-semibold">{task.assignedAgent.name}</div>
                      <div className="text-[10px] text-muted-foreground capitalize">
                        {task.assignedAgent.type}
                      </div>
                    </div>
                  </div>
                </Section>
              </>
            )}
          </div>
        </div>

        <DialogFooter className="p-5 pt-3 mt-0">
          {(task.status === 'failed' || task.reviewStatus === 'revision_needed') && (
            <Button
              variant="default"
              className="mr-auto gap-1.5"
              onClick={() => {
                retryTask(task.id);
                close();
              }}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {task.status === 'failed' ? 'Retry Task' : 'Re-run Task'}
            </Button>
          )}
          <Button variant="outline" onClick={close}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
