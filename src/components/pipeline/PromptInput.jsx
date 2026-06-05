import React, { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Rocket, Square, FolderOpen, Puzzle, Cpu, AlertTriangle, KeyRound, GitBranch } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export default function PromptInput() {
  const { state, dispatch, startOrchestration, abortOrchestration, selectDirectory } = useApp();
  const { currentPrompt, phase, workingDirectory, agents, agentSkills, concurrent, maxConcurrency } = state;
  const textareaRef = useRef(null);

  const isRunning = phase !== 'idle' && phase !== 'completed' && phase !== 'failed' && phase !== 'aborted';
  const hasMaster = agents.some((a) => a.role === 'master' && a.enabled);
  const hasCwd = !!workingDirectory;
  const canStart = currentPrompt.trim().length > 0 && hasMaster && hasCwd && !isRunning;
  const totalSkills = Object.values(agentSkills || {}).reduce((n, arr) => n + (arr?.length || 0), 0);

  const handleSubmit = () => {
    if (canStart) {
      dispatch({ type: 'RESET' });
      startOrchestration();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && canStart) handleSubmit();
  };

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 220)}px`;
  }, [currentPrompt]);

  return (
    <div className="p-5 border-b border-border/40">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Cpu className="h-4 w-4 text-primary" />
          <h2 className="text-base font-bold tracking-tight">Pipeline</h2>
          {!hasMaster && (
            <Badge variant="warning" className="ml-2">
              <AlertTriangle className="h-2.5 w-2.5" />
              No master
            </Badge>
          )}
          {hasMaster && !hasCwd && (
            <Badge variant="warning" className="ml-2">
              <AlertTriangle className="h-2.5 w-2.5" />
              No working dir
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1 rounded-md border border-border/60 bg-card/50 px-2 py-1 text-[11px]">
                <GitBranch className={`h-3.5 w-3.5 ${concurrent ? 'text-primary' : 'text-muted-foreground'}`} />
                <button
                  type="button"
                  onClick={() => dispatch({ type: 'SET_CONCURRENT', payload: !concurrent })}
                  disabled={isRunning}
                  className="font-semibold disabled:opacity-50"
                >
                  {concurrent ? 'Parallel' : 'Sequential'}
                </button>
                {concurrent && (
                  <>
                    <span className="text-muted-foreground/60 mx-0.5">·</span>
                    <input
                      type="number"
                      min={1}
                      max={32}
                      value={maxConcurrency}
                      disabled={isRunning}
                      onChange={(e) =>
                        dispatch({ type: 'SET_MAX_CONCURRENCY', payload: e.target.value })
                      }
                      className="w-10 bg-transparent text-center font-mono text-[11px] outline-none focus:text-primary disabled:opacity-50"
                    />
                  </>
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent>
              {concurrent
                ? `Run up to ${maxConcurrency} task(s) at once (DAG-aware). Click to disable.`
                : 'Run tasks one at a time. Click to enable parallel execution.'}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={() => dispatch({ type: 'SHOW_SKILLS_MODAL' })}
                disabled={isRunning}
                className="gap-1.5"
              >
                <Puzzle className="h-3.5 w-3.5" />
                Skills
                {totalSkills > 0 && (
                  <Badge variant="accent" className="h-4 px-1.5 text-[9px] ml-0.5">
                    {totalSkills}
                  </Badge>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Per-agent skills for this run</TooltipContent>
          </Tooltip>

          <AnimatePresence mode="wait" initial={false}>
            {isRunning ? (
              <motion.div
                key="abort"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
              >
                <Button variant="destructive" size="sm" onClick={abortOrchestration} className="gap-1.5">
                  <Square className="h-3.5 w-3.5 fill-current" />
                  Abort
                </Button>
              </motion.div>
            ) : (
              <motion.div
                key="run"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
              >
                <Button
                  variant="gradient"
                  size="default"
                  onClick={handleSubmit}
                  disabled={!canStart}
                  className="gap-1.5 group"
                >
                  <Rocket className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  Orchestrate
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <motion.div
        whileHover={{ scale: 1.005 }}
        className="relative rounded-xl border border-border/60 bg-card/50 backdrop-blur-xl overflow-hidden focus-within:border-primary/60 focus-within:shadow-[0_0_24px_hsl(var(--primary)/0.2)] transition-all"
      >
        <Textarea
          ref={textareaRef}
          className="border-0 bg-transparent shadow-none rounded-none resize-none focus-visible:ring-0 px-4 py-3 min-h-[120px] max-h-[220px] text-sm leading-relaxed"
          placeholder={
            hasMaster
              ? 'Describe what you want the agents to accomplish...\n\nExample: "Refactor the authentication module to use JWT tokens, add refresh token support, and write comprehensive unit tests."'
              : 'No master agent. Add one in the sidebar to get started.'
          }
          value={currentPrompt}
          onChange={(e) => dispatch({ type: 'SET_PROMPT', payload: e.target.value })}
          onKeyDown={handleKeyDown}
          disabled={isRunning}
        />
        <div className="flex items-center justify-between px-3 py-2 bg-secondary/40 border-t border-border/40">
          <button
            onClick={selectDirectory}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-secondary"
            title="Select working directory"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            <span className="font-mono max-w-[300px] truncate" dir="rtl" style={{ textAlign: 'left' }}>
              {workingDirectory || 'Select directory…'}
            </span>
          </button>
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground/70">
            <KeyRound className="h-3 w-3" />
            <kbd className="px-1.5 py-0.5 rounded bg-secondary border border-border text-[9px] font-mono">
              Ctrl
            </kbd>
            +
            <kbd className="px-1.5 py-0.5 rounded bg-secondary border border-border text-[9px] font-mono">
              Enter
            </kbd>
          </span>
        </div>
      </motion.div>
    </div>
  );
}
