import React from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Minus, Square, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

const winCtl = (action) => () => window.electronAPI?.window?.[action]?.();

export default function Header() {
  return (
    <header className="titlebar-drag fixed top-0 left-0 right-0 z-50 h-10 flex items-center justify-between px-4 border-b border-border/40 bg-background/70 backdrop-blur-2xl">
      <div className="no-drag flex items-center gap-2">
        <motion.div
          initial={{ rotate: -180, scale: 0 }}
          animate={{ rotate: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15 }}
          className="relative h-6 w-6 rounded-md bg-gradient-to-br from-primary via-accent to-info flex items-center justify-center shadow-lg shadow-primary/40"
        >
          <Sparkles className="h-3.5 w-3.5 text-white" />
          <div className="absolute inset-0 rounded-md bg-gradient-to-br from-primary via-accent to-info opacity-50 blur-md -z-10" />
        </motion.div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-sm font-bold tracking-tight gradient-text">Master</span>
          <span className="text-sm font-semibold text-muted-foreground">Orchestrator</span>
        </div>
        <span className="ml-2 text-[10px] font-mono text-muted-foreground/60 px-1.5 py-0.5 rounded border border-border/40">
          v1.0
        </span>
      </div>

      <div className="no-drag flex items-center gap-1">
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded" onClick={winCtl('minimize')}>
          <Minus className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded" onClick={winCtl('maximize')}>
          <Square className="h-3 w-3" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded hover:bg-destructive/20 hover:text-destructive" onClick={winCtl('close')}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
