import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RefreshCw,
  Plus,
  Crown,
  Zap,
  Search,
  History,
  CircleDot,
  Sparkles,
  ShieldOff,
  ShieldCheck,
  ShieldAlert,
  Eye,
  FilePlus,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

const TYPE_GRADIENT = {
  claude: 'from-amber-500 to-orange-600',
  gemini: 'from-blue-500 to-cyan-500',
  codex: 'from-emerald-500 to-green-600',
  custom: 'from-violet-500 to-purple-600',
};

const TYPE_LETTER = { claude: 'C', gemini: 'G', codex: 'X', custom: '⚙' };

function HealthDot({ status }) {
  const map = {
    available: 'bg-success shadow-[0_0_8px_hsl(var(--success))]',
    unavailable: 'bg-destructive shadow-[0_0_8px_hsl(var(--destructive))]',
    checking: 'bg-warning shadow-[0_0_8px_hsl(var(--warning))] animate-pulse',
    unknown: 'bg-muted-foreground/40',
  };
  return <span className={cn('h-2 w-2 rounded-full shrink-0', map[status])} />;
}

const PERM_BADGE = {
  'ui-prompt':   { Icon: ShieldCheck, cls: 'text-info bg-info/10 border-info/30',                      label: 'ui ask' },
  bypass:        { Icon: ShieldOff,   cls: 'text-destructive bg-destructive/10 border-destructive/30', label: 'bypass' },
  'accept-edits':{ Icon: ShieldCheck, cls: 'text-warning bg-warning/10 border-warning/30',             label: 'edits' },
  plan:          { Icon: Eye,         cls: 'text-info bg-info/10 border-info/30',                      label: 'plan' },
  default:       { Icon: ShieldAlert, cls: 'text-muted-foreground bg-secondary/40 border-border',      label: 'ask' },
};

function PermBadge({ agent }) {
  let mode = null;
  if (agent.type === 'claude') {
    mode = agent.permissionMode || 'bypass';
  } else if (agent.type === 'codex' || agent.type === 'gemini') {
    mode = agent.autoApprove === false ? 'default' : 'bypass';
  }
  if (!mode) return null;
  const { Icon, cls, label } = PERM_BADGE[mode] || PERM_BADGE.default;
  return (
    <span
      title={`Permission: ${label}`}
      className={cn('inline-flex items-center gap-0.5 rounded border px-1 py-0 text-[8px] font-semibold uppercase tracking-wider', cls)}
    >
      <Icon className="h-2 w-2" />
      {label}
    </span>
  );
}

function AgentRow({ agent, healthClass, selected, onClick }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -8 }}
      whileHover={{ x: 2 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      onClick={onClick}
      className={cn(
        'group flex items-center gap-2.5 rounded-lg p-2 cursor-pointer transition-all border',
        selected
          ? 'border-primary/50 bg-primary/10 shadow-md shadow-primary/10'
          : 'border-transparent hover:border-border hover:bg-secondary/40'
      )}
    >
      <div
        className={cn(
          'h-8 w-8 rounded-md bg-gradient-to-br flex items-center justify-center text-white text-sm font-bold shrink-0 shadow-md transition-transform group-hover:scale-110',
          TYPE_GRADIENT[agent.type] || TYPE_GRADIENT.custom
        )}
      >
        {TYPE_LETTER[agent.type] || '⚙'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold truncate">{agent.name}</div>
        <div className="text-[10px] text-muted-foreground capitalize flex items-center gap-1">
          <span>{agent.role}</span>
          <PermBadge agent={agent} />
        </div>
      </div>
      <HealthDot status={healthClass} />
    </motion.div>
  );
}

function Section({ icon: Icon, title, count, children, action }) {
  return (
    <div className="px-3 pt-3">
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-1.5">
          <Icon className="h-3 w-3 text-muted-foreground" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            {title}
          </span>
          <Badge variant="outline" className="h-4 px-1.5 text-[9px] font-mono">
            {count}
          </Badge>
        </div>
        {action}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

export default function Sidebar() {
  const { state, dispatch, checkAllHealth, loadSession, abortOrchestration } = useApp();
  const { agents, agentHealthStatus } = state;

  const handleNewSession = async () => {
    const running = ['decomposing', 'executing', 'reviewing', 'revising', 'running'].includes(
      state.orchestratorStatus
    );
    if (running) {
      const ok = window.confirm('A run is in progress. Abort and start a new session?');
      if (!ok) return;
      try { await abortOrchestration?.(); } catch {}
    }
    dispatch({ type: 'RESET' });
  };

  useEffect(() => {
    if (agents.length > 0 && window.electronAPI) checkAllHealth();
  }, [agents.length]);

  const masterAgents = agents.filter((a) => a.role === 'master');
  const workerAgents = agents.filter((a) => a.role === 'worker');
  const reviewerAgents = agents.filter((a) => a.role === 'reviewer');

  const getHealthClass = (id) => {
    const h = agentHealthStatus[id];
    if (!h) return 'unknown';
    if (h.checking) return 'checking';
    return h.available ? 'available' : 'unavailable';
  };

  const handleAddAgent = () => dispatch({ type: 'SHOW_AGENT_MODAL' });
  const handleEditAgent = (agent) => dispatch({ type: 'SHOW_AGENT_MODAL', payload: agent });

  const renderGroup = (icon, title, list, role) => (
    <Section icon={icon} title={title} count={list.length}>
      {list.length === 0 ? (
        <div className="px-2 py-3 text-[11px] text-muted-foreground/70 italic">
          No {role} configured
        </div>
      ) : (
        <AnimatePresence mode="popLayout">
          {list.map((agent) => (
            <AgentRow
              key={agent.id}
              agent={agent}
              healthClass={getHealthClass(agent.id)}
              selected={state.selectedAgent === agent.id}
              onClick={() => handleEditAgent(agent)}
            />
          ))}
        </AnimatePresence>
      )}
    </Section>
  );

  return (
    <aside className="w-[280px] shrink-0 border-r border-border/40 bg-background/40 backdrop-blur-xl flex flex-col overflow-hidden">
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="text-[11px] font-bold uppercase tracking-widest">Agents</h2>
        </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={(e) => {
              e.stopPropagation();
              checkAllHealth();
            }}
            title="Refresh health"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleAddAgent} title="Add agent">
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
        {renderGroup(Crown, 'Master', masterAgents, 'master')}
        <Separator className="my-2" />
        {renderGroup(Zap, 'Workers', workerAgents, 'worker')}
        <Separator className="my-2" />
        {renderGroup(Search, 'Reviewer', reviewerAgents, 'reviewer')}
        <Separator className="my-2" />

        <Section
          icon={History}
          title="Recent Sessions"
          count={state.sessions.length}
          action={
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={handleNewSession}
              title="New session (clears prompt, tasks, output)"
            >
              <FilePlus className="h-3.5 w-3.5" />
            </Button>
          }
        >
          {state.sessions.length === 0 ? (
            <div className="px-2 py-3 text-[11px] text-muted-foreground/70 italic">No sessions yet</div>
          ) : (
            <AnimatePresence mode="popLayout">
              {state.sessions.slice(0, 6).map((session) => (
                <motion.div
                  key={session.id}
                  layout
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  whileHover={{ x: 2 }}
                  onClick={() => loadSession(session.id)}
                  className={cn(
                    'group flex items-start gap-2 rounded-lg p-2 cursor-pointer transition-all border',
                    state.currentSession?.id === session.id
                      ? 'border-primary/40 bg-primary/10'
                      : 'border-transparent hover:border-border hover:bg-secondary/40'
                  )}
                >
                  <CircleDot
                    className={cn(
                      'h-3 w-3 mt-0.5 shrink-0',
                      session.status === 'completed'
                        ? 'text-success'
                        : session.status === 'failed'
                        ? 'text-destructive'
                        : 'text-muted-foreground'
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-medium line-clamp-2 leading-snug">
                      {session.prompt}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {session.taskCount} tasks · {session.status}
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </Section>
        <div className="h-4" />
      </div>
    </aside>
  );
}
