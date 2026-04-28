import React, { useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldAlert,
  Check,
  X,
  CheckCircle2,
  FileText,
  Terminal,
  Globe,
  Edit3,
  FolderTree,
  Search,
  Bot,
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
import { cn } from '@/lib/utils';

const TOOL_ICON = {
  Write: FileText,
  Edit: Edit3,
  MultiEdit: Edit3,
  Read: FileText,
  Bash: Terminal,
  Glob: FolderTree,
  Grep: Search,
  WebFetch: Globe,
  WebSearch: Globe,
  Task: Bot,
};

function formatInputPreview(input) {
  if (!input || typeof input !== 'object') return null;
  // Common fields
  if (input.file_path || input.path) return input.file_path || input.path;
  if (input.command) return input.command;
  if (input.url) return input.url;
  if (input.pattern) return input.pattern;
  return JSON.stringify(input).slice(0, 200);
}

export default function PermissionModal() {
  const { state, decidePermission, allowAlwaysForTool } = useApp();
  const { permissionRequests, permissionAutoApprove } = state;

  const current = permissionRequests[0] || null;

  // Auto-approve if tool is in always-allow set
  useEffect(() => {
    if (current && permissionAutoApprove.has(current.toolName)) {
      decidePermission(current.id, { behavior: 'allow', message: 'Auto-approved (always allow)' });
    }
  }, [current, permissionAutoApprove, decidePermission]);

  if (!current) return null;

  const Icon = TOOL_ICON[current.toolName] || ShieldAlert;
  const preview = formatInputPreview(current.input);

  const allow = () => decidePermission(current.id, { behavior: 'allow' });
  const deny = () => decidePermission(current.id, { behavior: 'deny', message: 'Denied by user' });
  const allowAlways = () => {
    allowAlwaysForTool(current.toolName);
    allow();
  };

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent
        className="max-w-lg p-0 gap-0 border-warning/40 shadow-[0_0_60px_hsl(var(--warning)/0.25)]"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="p-5 pb-3 border-b border-border/60 bg-gradient-to-br from-warning/15 via-transparent to-destructive/10">
          <div className="flex items-center gap-3 pr-8">
            <motion.div
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="h-10 w-10 rounded-xl bg-gradient-to-br from-warning to-destructive flex items-center justify-center shadow-lg shadow-warning/30"
            >
              <ShieldAlert className="h-5 w-5 text-white" />
            </motion.div>
            <div className="flex-1">
              <DialogTitle className="text-base">Permission requested</DialogTitle>
              <div className="text-xs text-muted-foreground mt-0.5">
                <Badge variant="accent" className="mr-1.5">{current.agentName || 'Claude'}</Badge>
                wants to run a tool
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="p-5 space-y-4">
          <div className="rounded-xl border border-border/60 bg-secondary/30 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Icon className="h-4 w-4 text-primary" />
              <span className="text-sm font-bold font-mono">{current.toolName}</span>
            </div>
            {preview && (
              <pre className="text-[11px] font-mono text-foreground/85 whitespace-pre-wrap break-all leading-relaxed bg-background/60 rounded-md p-2.5 max-h-40 overflow-auto scrollbar-thin">
                {preview}
              </pre>
            )}
          </div>

          {current.cwd && (
            <div className="text-[10px] font-mono text-muted-foreground">
              cwd: <span className="text-foreground/80">{current.cwd}</span>
            </div>
          )}

          <AnimatePresence>
            {permissionRequests.length > 1 && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-[10px] text-muted-foreground flex items-center gap-1"
              >
                <Badge variant="warning" className="font-mono">
                  +{permissionRequests.length - 1}
                </Badge>
                more queued behind this
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <DialogFooter className="p-5 pt-3 mt-0 flex flex-col gap-2 sm:flex-col">
          <div className="grid grid-cols-2 gap-2 w-full">
            <Button variant="outline" onClick={deny} className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10">
              <X className="h-4 w-4" />
              Deny
            </Button>
            <Button variant="gradient" onClick={allow} className="gap-1.5">
              <Check className="h-4 w-4" />
              Allow once
            </Button>
          </div>
          <Button variant="ghost" size="sm" onClick={allowAlways} className="gap-1.5 text-success hover:text-success hover:bg-success/10">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Always allow <span className="font-mono">{current.toolName}</span> this session
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
