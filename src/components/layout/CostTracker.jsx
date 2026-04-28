import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DollarSign, TrendingUp, Crown, Zap, Search, Wallet } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

const TYPE_GRADIENT = {
  claude: 'from-amber-500 to-orange-600',
  gemini: 'from-blue-500 to-cyan-500',
  codex: 'from-emerald-500 to-green-600',
  custom: 'from-violet-500 to-purple-600',
};

const TYPE_LETTER = { claude: 'C', gemini: 'G', codex: 'X', custom: '⚙' };

const ROLE_ICON = { master: Crown, worker: Zap, reviewer: Search };

function fmtUsd(n) {
  if (n == null || isNaN(n)) return '$0.0000';
  if (n >= 100) return `$${n.toFixed(2)}`;
  if (n >= 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(4)}`;
}

function fmtTokens(n) {
  if (!n) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export default function CostTracker() {
  const { state } = useApp();
  const { costSummary } = state;
  const total = costSummary?.totalUsd || 0;
  const agents = costSummary?.byAgent || [];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <motion.button
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.96 }}
          className={cn(
            'flex items-center gap-1.5 px-2 py-0.5 rounded border transition-all text-[10px] font-mono',
            total > 0
              ? 'border-success/40 bg-success/10 text-success hover:bg-success/15 hover:shadow-[0_0_10px_hsl(var(--success)/0.3)]'
              : 'border-border/60 bg-secondary/40 text-muted-foreground hover:border-border'
          )}
          title="Run cost — click for breakdown"
        >
          <DollarSign className="h-3 w-3" />
          <AnimatePresence mode="wait">
            <motion.span
              key={total.toFixed(4)}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.18 }}
              className="font-bold tabular-nums"
            >
              {fmtUsd(total)}
            </motion.span>
          </AnimatePresence>
        </motion.button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-96">
        <div className="p-4 border-b border-border/60 bg-gradient-to-br from-primary/10 via-transparent to-accent/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-success to-emerald-700 flex items-center justify-center shadow-md shadow-success/30">
                <Wallet className="h-4 w-4 text-white" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
                  Run total
                </div>
                <div className="text-2xl font-bold tabular-nums gradient-text leading-tight">
                  {fmtUsd(total)}
                </div>
              </div>
            </div>
            <Badge variant="outline" className="font-mono">
              <TrendingUp className="h-2.5 w-2.5" />
              {agents.length} agent{agents.length === 1 ? '' : 's'}
            </Badge>
          </div>
        </div>

        <ScrollArea className="max-h-72">
          <div className="p-2 space-y-1">
            {agents.length === 0 ? (
              <div className="px-3 py-8 text-center text-xs text-muted-foreground">
                <DollarSign className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <div>No spend yet this run.</div>
                <div className="text-[10px] mt-1">
                  Cost appears once an agent reports usage.
                </div>
              </div>
            ) : (
              agents
                .slice()
                .sort((a, b) => (b.totalUsd || 0) - (a.totalUsd || 0))
                .map((a) => {
                  const RoleIcon = ROLE_ICON[a.role] || Zap;
                  const pct = total > 0 ? (a.totalUsd / total) * 100 : 0;
                  return (
                    <motion.div
                      key={a.agentId}
                      layout
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="relative rounded-lg p-2.5 border border-border/40 bg-card/40 hover:bg-secondary/30 transition-colors overflow-hidden"
                    >
                      <div
                        className="absolute inset-y-0 left-0 bg-gradient-to-r from-success/20 to-transparent"
                        style={{ width: `${pct}%` }}
                      />
                      <div className="relative flex items-center gap-2.5">
                        <div
                          className={cn(
                            'h-8 w-8 rounded-md bg-gradient-to-br flex items-center justify-center text-white font-bold text-xs shadow-md shrink-0',
                            TYPE_GRADIENT[a.agentType] || TYPE_GRADIENT.custom
                          )}
                        >
                          {TYPE_LETTER[a.agentType] || '⚙'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold truncate">{a.agentName}</span>
                            <Badge variant="outline" className="h-3.5 px-1 text-[8px] gap-0.5">
                              <RoleIcon className="h-2 w-2" />
                              {a.role}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5 font-mono">
                            <span>{a.calls} call{a.calls === 1 ? '' : 's'}</span>
                            <span>·</span>
                            <span title="input tokens">↓{fmtTokens(a.inputTokens)}</span>
                            <span title="output tokens">↑{fmtTokens(a.outputTokens)}</span>
                            {a.cacheReadTokens > 0 && (
                              <>
                                <span>·</span>
                                <span title="cache read" className="text-info">
                                  cache {fmtTokens(a.cacheReadTokens)}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm font-bold text-success font-mono tabular-nums">
                            {fmtUsd(a.totalUsd)}
                          </div>
                          <div className="text-[9px] text-muted-foreground font-mono">
                            {pct.toFixed(1)}%
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })
            )}
          </div>
        </ScrollArea>

        <div className="px-4 py-2 border-t border-border/60 bg-secondary/20 text-[10px] text-muted-foreground">
          Pricing tracked per model from CLI usage data. Codex / Custom CLIs report tokens only when JSON usage is exposed.
        </div>
      </PopoverContent>
    </Popover>
  );
}
