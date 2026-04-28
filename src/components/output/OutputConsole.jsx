import React, { useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, Trash2, Eye, CheckCircle2, AlertTriangle, Sparkles } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

const LINE_COLOR = {
  stdout: 'text-foreground/85',
  stderr: 'text-warning',
  system: 'text-primary font-medium',
  error: 'text-destructive',
};

export default function OutputConsole() {
  const { state, dispatch } = useApp();
  const { outputLines, activeOutputTab, tasks, reviewResults } = state;
  const bodyRef = useRef(null);
  const autoScrollRef = useRef(true);

  useEffect(() => {
    if (bodyRef.current && autoScrollRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [outputLines.length]);

  const handleScroll = () => {
    if (!bodyRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = bodyRef.current;
    autoScrollRef.current = scrollHeight - scrollTop - clientHeight < 50;
  };

  const tabs = useMemo(() => {
    const t = [{ id: 'all', label: 'All' }];
    tasks.forEach((task) => t.push({ id: `task-${task.id}`, label: `T-${task.id}` }));
    return t;
  }, [tasks]);

  const filteredLines = useMemo(() => {
    if (activeOutputTab === 'all') return outputLines;
    const taskId = parseInt(activeOutputTab.replace('task-', ''));
    return outputLines.filter((l) => l.taskId === taskId || l.type === 'system');
  }, [outputLines, activeOutputTab]);

  const formatTimestamp = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const latestReview = reviewResults.length > 0 ? reviewResults[reviewResults.length - 1] : null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-secondary/20">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold tracking-tight">Live Output</h3>
          <Badge variant="outline" className="font-mono">
            {outputLines.length}
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => dispatch({ type: 'CLEAR_OUTPUT' })}
          title="Clear output"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {tabs.length > 1 && (
        <div className="px-3 py-2 border-b border-border/40 bg-secondary/10">
          <Tabs value={activeOutputTab} onValueChange={(v) => dispatch({ type: 'SET_ACTIVE_TAB', payload: v })}>
            <TabsList className="h-8">
              {tabs.map((tab) => (
                <TabsTrigger key={tab.id} value={tab.id}>
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      )}

      <div
        ref={bodyRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto scrollbar-thin px-3 py-2 font-mono text-[11px] leading-relaxed bg-background/60 min-h-0"
      >
        {filteredLines.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground/60 text-xs gap-3">
            <motion.div
              animate={{ y: [0, -6, 0] }}
              transition={{ repeat: Infinity, duration: 3 }}
              className="h-12 w-12 rounded-xl bg-secondary/40 border border-border/60 flex items-center justify-center"
            >
              <Terminal className="h-5 w-5 opacity-60" />
            </motion.div>
            <span>Agent output streams here</span>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {filteredLines.map((line, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.12 }}
                className={cn('whitespace-pre-wrap break-words py-px', LINE_COLOR[line.type] || LINE_COLOR.stdout)}
              >
                <span className="text-muted-foreground/50 mr-2 select-none">{formatTimestamp(line.timestamp)}</span>
                {line.agentName && (
                  <span className="text-accent font-semibold mr-1">[{line.agentName}]</span>
                )}
                {line.text}
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {latestReview && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="border-t border-border/40 bg-secondary/20"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-info" />
              <h3 className="text-sm font-bold tracking-tight">Review</h3>
              {latestReview.result?.overall_status === 'approved' ? (
                <Badge variant="success" className="gap-1">
                  <CheckCircle2 className="h-2.5 w-2.5" />
                  Approved
                </Badge>
              ) : (
                <Badge variant="warning" className="gap-1">
                  <AlertTriangle className="h-2.5 w-2.5" />
                  Revisions Needed
                </Badge>
              )}
            </div>
            <Badge variant="outline" className="font-mono text-[10px]">
              Round {latestReview.round}
            </Badge>
          </div>
          <ScrollArea className="max-h-56">
            <div className="p-3 space-y-2">
              {latestReview.result?.overall_feedback && (
                <div className="text-xs text-foreground/80 leading-relaxed mb-3 px-1">
                  {latestReview.result.overall_feedback}
                </div>
              )}
              {latestReview.result?.tasks?.map((rt) => (
                <motion.div
                  key={rt.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-lg p-2.5 border border-border/40 bg-card/50"
                >
                  <div className="flex items-center justify-between mb-1">
                    <Badge variant="default" className="font-mono text-[9px]">
                      T-{rt.id}
                    </Badge>
                    <Badge
                      variant={rt.status === 'approved' ? 'success' : 'warning'}
                      className="text-[9px]"
                    >
                      {rt.status === 'approved' ? (
                        <CheckCircle2 className="h-2.5 w-2.5" />
                      ) : (
                        <AlertTriangle className="h-2.5 w-2.5" />
                      )}
                      {rt.status}
                      {rt.quality_score && ` ${rt.quality_score}/10`}
                    </Badge>
                  </div>
                  <div className="text-[11px] text-foreground/75 leading-relaxed">{rt.feedback}</div>
                </motion.div>
              ))}
            </div>
          </ScrollArea>
        </motion.div>
      )}
    </div>
  );
}
