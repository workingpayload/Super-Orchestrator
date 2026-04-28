import React from 'react';
import { motion } from 'framer-motion';
import { Brain, Zap, Eye, CheckCircle2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { cn } from '@/lib/utils';

const PHASES = [
  { id: 'decomposing', label: 'Decompose', icon: Brain },
  { id: 'executing', label: 'Execute', icon: Zap },
  { id: 'reviewing', label: 'Review', icon: Eye },
  { id: 'completed', label: 'Done', icon: CheckCircle2 },
];

export default function PhaseIndicator() {
  const { state } = useApp();
  const { phase } = state;

  const getStatus = (p) => {
    const idx = PHASES.findIndex((x) => x.id === phase);
    const pIdx = PHASES.findIndex((x) => x.id === p);

    if (phase === 'decomposed') return p === 'decomposing' ? 'completed' : 'pending';
    if (phase === 'revising') {
      if (p === 'decomposing' || p === 'executing') return 'completed';
      if (p === 'reviewing') return 'active';
      return 'pending';
    }
    if (phase === 'failed' || phase === 'aborted') {
      if (pIdx < idx) return 'completed';
      if (pIdx === idx) return 'failed';
      return 'pending';
    }

    if (pIdx < idx) return 'completed';
    if (pIdx === idx) return 'active';
    return 'pending';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-5 my-4 px-4 py-3 rounded-xl border border-border/60 bg-card/40 backdrop-blur-xl flex items-center gap-2 shadow-lg shadow-black/10"
    >
      {PHASES.map((p, i) => {
        const status = getStatus(p.id);
        const Icon = p.icon;
        return (
          <React.Fragment key={p.id}>
            <motion.div
              layout
              className={cn(
                'flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition-all',
                status === 'active' && 'bg-primary/15 shadow-[0_0_16px_hsl(var(--primary)/0.3)]',
                status === 'completed' && 'bg-success/10',
                status === 'failed' && 'bg-destructive/10'
              )}
            >
              <motion.div
                animate={
                  status === 'active'
                    ? { scale: [1, 1.15, 1], rotate: [0, 5, -5, 0] }
                    : { scale: 1, rotate: 0 }
                }
                transition={{
                  repeat: status === 'active' ? Infinity : 0,
                  duration: 1.6,
                }}
                className={cn(
                  'h-7 w-7 rounded-md flex items-center justify-center transition-all',
                  status === 'active' &&
                    'bg-gradient-to-br from-primary to-accent text-white shadow-md shadow-primary/40',
                  status === 'completed' && 'bg-success/20 text-success',
                  status === 'failed' && 'bg-destructive/20 text-destructive',
                  status === 'pending' && 'bg-secondary text-muted-foreground/60'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
              </motion.div>
              <span
                className={cn(
                  'text-xs font-semibold',
                  status === 'active' && 'text-foreground',
                  status === 'completed' && 'text-success',
                  status === 'failed' && 'text-destructive',
                  status === 'pending' && 'text-muted-foreground/70'
                )}
              >
                {p.label}
              </span>
            </motion.div>
            {i < PHASES.length - 1 && (
              <div className="flex-1 h-px relative overflow-hidden min-w-[20px]">
                <div className="absolute inset-0 bg-border" />
                <motion.div
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: getStatus(p.id) === 'completed' ? 1 : 0 }}
                  style={{ transformOrigin: 'left' }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                  className="absolute inset-0 bg-gradient-to-r from-success via-success to-primary"
                />
              </div>
            )}
          </React.Fragment>
        );
      })}
    </motion.div>
  );
}
