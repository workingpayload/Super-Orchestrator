import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Crown,
  Zap,
  Search,
  Settings,
  HeartPulse,
  Trash2,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  ShieldCheck,
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

const AGENT_TYPES = [
  { value: 'claude', label: 'Claude', letter: 'C', gradient: 'from-amber-500 to-orange-600' },
  { value: 'gemini', label: 'Gemini', letter: 'G', gradient: 'from-blue-500 to-cyan-500' },
  { value: 'codex', label: 'Codex', letter: 'X', gradient: 'from-emerald-500 to-green-600' },
  { value: 'custom', label: 'Custom', letter: '⚙', gradient: 'from-violet-500 to-purple-600' },
];

const AGENT_MODELS = {
  claude: [
    { value: '__default__', label: 'CLI Default' },
    { value: 'claude-opus-4-7', label: 'Opus 4.7' },
    { value: 'claude-opus-4-6', label: 'Opus 4.6' },
    { value: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
    { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
  ],
  gemini: [
    { value: '__default__', label: 'CLI Default' },
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
  ],
  codex: [
    { value: '__default__', label: 'CLI Default' },
    { value: 'o4-mini', label: 'o4-mini' },
    { value: 'o3', label: 'o3' },
    { value: 'gpt-4.1', label: 'GPT-4.1' },
  ],
  custom: [],
};

const ROLES = [
  { value: 'master', label: 'Master', desc: 'Decomposes prompts', icon: Crown },
  { value: 'worker', label: 'Worker', desc: 'Executes tasks', icon: Zap },
  { value: 'reviewer', label: 'Reviewer', desc: 'Reviews work', icon: Search },
];

const TYPE_DEFAULTS = {
  claude: { name: 'Claude', cliPath: 'claude' },
  gemini: { name: 'Gemini', cliPath: 'gemini' },
  codex: { name: 'Codex', cliPath: 'codex' },
  custom: { name: '', cliPath: '' },
};

export default function AgentModal() {
  const { state, dispatch, addAgent, updateAgent, removeAgent, checkAgentHealth } = useApp();
  const { editingAgent } = state;
  const isEditing = !!editingAgent;

  const deriveClaudeMode = (a) => {
    if (a?.permissionMode) return a.permissionMode;
    if (a?.autoApprove === false) return 'default';
    return 'bypass';
  };

  const [form, setForm] = useState({
    name: '',
    type: 'claude',
    role: 'worker',
    cliPath: '',
    model: '',
    extraFlags: '',
    enabled: true,
    autoApprove: true,
    permissionMode: 'bypass',
  });
  const [healthResult, setHealthResult] = useState(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (editingAgent) {
      setForm({
        name: editingAgent.name || '',
        type: editingAgent.type || 'claude',
        role: editingAgent.role || 'worker',
        cliPath: editingAgent.cliPath || '',
        model: editingAgent.model || '',
        extraFlags: (editingAgent.extraFlags || []).join(' '),
        enabled: editingAgent.enabled !== false,
        autoApprove: editingAgent.autoApprove !== false,
        permissionMode: deriveClaudeMode(editingAgent),
      });
    } else {
      setForm({
        name: '',
        type: 'claude',
        role: 'worker',
        cliPath: '',
        model: '',
        extraFlags: '',
        enabled: true,
        autoApprove: true,
        permissionMode: 'bypass',
      });
    }
    setHealthResult(null);
  }, [editingAgent]);

  const handleTypeChange = (newType) => {
    const defaults = TYPE_DEFAULTS[newType] || { name: '', cliPath: '' };
    setForm((prev) => ({ ...prev, type: newType, name: defaults.name, cliPath: defaults.cliPath, model: '' }));
  };

  const supportsAutoApprove = ['codex', 'gemini'].includes(form.type);
  const autoApproveLabel = {
    codex: '--full-auto',
    gemini: '--sandbox=none',
  }[form.type] || '';

  const PERMISSION_MODES = [
    {
      value: 'ui-prompt',
      label: 'Ask via Orchestrator UI (recommended)',
      desc: 'Each tool request pops a modal in this app — click Allow / Deny / Always allow.',
      tone: 'info',
    },
    {
      value: 'bypass',
      label: 'Bypass all (silent)',
      desc: '--dangerously-skip-permissions. Auto-approves every tool. Fastest, least safe.',
      tone: 'destructive',
    },
    {
      value: 'accept-edits',
      label: 'Accept edits',
      desc: '--permission-mode acceptEdits. File reads/writes auto-approved. Bash still asks (will hang on those).',
      tone: 'warning',
    },
    {
      value: 'plan',
      label: 'Plan only',
      desc: '--permission-mode plan. Read-only planning, no writes.',
      tone: 'info',
    },
    {
      value: 'default',
      label: 'Default (no UI grant)',
      desc: '--permission-mode default. Will hang in non-interactive runs. Use only with allowed-tools list.',
      tone: 'muted',
    },
  ];

  const TONE_CLASS = {
    destructive: 'border-destructive/40 bg-destructive/10 hover:bg-destructive/15',
    warning: 'border-warning/40 bg-warning/10 hover:bg-warning/15',
    info: 'border-info/40 bg-info/10 hover:bg-info/15',
    muted: 'border-border bg-secondary/30 hover:bg-secondary/50',
  };

  const TONE_ICON = {
    destructive: 'text-destructive',
    warning: 'text-warning',
    info: 'text-info',
    muted: 'text-foreground/80',
  };

  const close = () => dispatch({ type: 'HIDE_AGENT_MODAL' });

  const handleSave = async () => {
    const config = {
      name: form.name || AGENT_TYPES.find((t) => t.value === form.type)?.label || 'Agent',
      type: form.type,
      role: form.role,
      cliPath: form.cliPath || form.type,
      model: form.model || '',
      extraFlags: form.extraFlags ? form.extraFlags.split(/\s+/).filter(Boolean) : [],
      enabled: form.enabled,
      autoApprove: form.autoApprove,
      permissionMode: form.permissionMode,
    };
    if (isEditing) await updateAgent(editingAgent.id, config);
    else await addAgent(config);
    close();
  };

  const handleDelete = async () => {
    if (isEditing && editingAgent) {
      await removeAgent(editingAgent.id);
      close();
    }
  };

  const handleHealthCheck = async () => {
    setChecking(true);
    setHealthResult(null);
    try {
      if (isEditing) {
        const result = await checkAgentHealth(editingAgent.id);
        setHealthResult(result);
      }
    } catch (e) {
      setHealthResult({ available: false, error: e.message });
    }
    setChecking(false);
  };

  const modelList = AGENT_MODELS[form.type] || [];

  return (
    <Dialog open onOpenChange={(v) => !v && close()}>
      <DialogContent className="max-w-xl max-h-[88vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-5 pb-3 border-b border-border/60">
          <div className="flex items-center gap-2 pr-8">
            <Settings className="h-5 w-5 text-primary" />
            <DialogTitle>{isEditing ? 'Edit Agent' : 'Add Agent'}</DialogTitle>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-5">
          <div className="py-4 space-y-5">
            <div className="space-y-2">
              <Label>Agent Type</Label>
              <div className="grid grid-cols-4 gap-2">
                {AGENT_TYPES.map((t) => (
                  <motion.button
                    key={t.value}
                    type="button"
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => handleTypeChange(t.value)}
                    className={cn(
                      'flex flex-col items-center gap-2 p-3 rounded-xl border transition-all',
                      form.type === t.value
                        ? 'border-primary/60 bg-primary/10 shadow-md shadow-primary/20'
                        : 'border-border/60 bg-secondary/30 hover:border-border'
                    )}
                  >
                    <div
                      className={cn(
                        'h-10 w-10 rounded-lg bg-gradient-to-br flex items-center justify-center text-white font-bold text-base shadow-md',
                        t.gradient
                      )}
                    >
                      {t.letter}
                    </div>
                    <span className="text-xs font-semibold">{t.label}</span>
                  </motion.button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Agent name"
              />
            </div>

            <div className="space-y-2">
              <Label>Role</Label>
              <div className="grid grid-cols-3 gap-2">
                {ROLES.map((r) => {
                  const Icon = r.icon;
                  const active = form.role === r.value;
                  return (
                    <motion.button
                      key={r.value}
                      type="button"
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setForm((p) => ({ ...p, role: r.value }))}
                      className={cn(
                        'flex flex-col items-start gap-1 p-3 rounded-xl border transition-all text-left',
                        active
                          ? 'border-accent/60 bg-accent/10 shadow-md shadow-accent/20'
                          : 'border-border/60 bg-secondary/30 hover:border-border'
                      )}
                    >
                      <div className={cn('flex items-center gap-1.5 text-sm font-semibold', active && 'text-accent')}>
                        <Icon className="h-3.5 w-3.5" />
                        {r.label}
                      </div>
                      <span className="text-[10px] text-muted-foreground">{r.desc}</span>
                    </motion.button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label>CLI Command / Path</Label>
              <Input
                value={form.cliPath}
                onChange={(e) => setForm((p) => ({ ...p, cliPath: e.target.value }))}
                placeholder="e.g. claude, gemini, or full path"
                className="font-mono text-xs"
              />
            </div>

            {modelList.length > 0 && (
              <div className="space-y-2">
                <Label>Model</Label>
                <Select
                  value={form.model || '__default__'}
                  onValueChange={(v) => setForm((p) => ({ ...p, model: v === '__default__' ? '' : v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {modelList.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Extra Flags (optional)</Label>
              <Input
                value={form.extraFlags}
                onChange={(e) => setForm((p) => ({ ...p, extraFlags: e.target.value }))}
                placeholder="e.g. --bare --model gpt-4"
                className="font-mono text-xs"
              />
            </div>

            {isEditing && (
              <div className="space-y-2">
                <Label>Health Check</Label>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={handleHealthCheck} disabled={checking} className="gap-1.5">
                    {checking ? <Spinner size={14} /> : <HeartPulse className="h-3.5 w-3.5" />}
                    {checking ? 'Checking…' : 'Check Health'}
                  </Button>
                  {healthResult && (
                    <motion.span
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={cn(
                        'flex items-center gap-1.5 text-xs',
                        healthResult.available ? 'text-success' : 'text-destructive'
                      )}
                    >
                      {healthResult.available ? (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Available {healthResult.version && `(${healthResult.version})`}
                        </>
                      ) : (
                        <>
                          <XCircle className="h-3.5 w-3.5" />
                          {healthResult.error}
                        </>
                      )}
                    </motion.span>
                  )}
                </div>
              </div>
            )}

            {form.type === 'claude' && (
              <div className="space-y-2">
                <Label>Permission Mode</Label>
                <div className="space-y-1.5">
                  {PERMISSION_MODES.map((m) => {
                    const active = form.permissionMode === m.value;
                    return (
                      <button
                        key={m.value}
                        type="button"
                        onClick={() => setForm((p) => ({ ...p, permissionMode: m.value }))}
                        className={cn(
                          'w-full flex items-start gap-3 p-3 rounded-xl border transition-all text-left',
                          active ? TONE_CLASS[m.tone] : 'border-border/60 bg-secondary/20 hover:bg-secondary/40'
                        )}
                      >
                        {active ? (
                          <ShieldCheck className={cn('h-4 w-4 mt-0.5 shrink-0', TONE_ICON[m.tone])} />
                        ) : (
                          <ShieldAlert className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                        )}
                        <div className="flex-1">
                          <div className="text-sm font-semibold">{m.label}</div>
                          <div className="text-[10px] text-muted-foreground mt-0.5 leading-snug font-mono">
                            {m.desc}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {supportsAutoApprove && (
              <div className="space-y-2">
                <Label>Permissions</Label>
                <button
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, autoApprove: !p.autoApprove }))}
                  className={cn(
                    'w-full flex items-start gap-3 p-3 rounded-xl border transition-all text-left',
                    form.autoApprove
                      ? 'border-warning/40 bg-warning/10 hover:bg-warning/15'
                      : 'border-success/40 bg-success/10 hover:bg-success/15'
                  )}
                >
                  {form.autoApprove ? (
                    <ShieldAlert className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                  ) : (
                    <ShieldCheck className="h-4 w-4 text-success mt-0.5 shrink-0" />
                  )}
                  <div className="flex-1">
                    <div className="text-sm font-semibold flex items-center gap-2">
                      {form.autoApprove ? 'Auto-approve all actions' : 'Ask for permission'}
                      <Checkbox checked={form.autoApprove} className="ml-auto pointer-events-none" />
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5 leading-snug">
                      {form.autoApprove
                        ? `CLI runs with ${autoApproveLabel}. File writes happen without prompts.`
                        : 'CLI streams permission prompts to the output console. Disables file writes that need approval.'}
                    </div>
                  </div>
                </button>
              </div>
            )}

            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={form.enabled} onCheckedChange={(v) => setForm((p) => ({ ...p, enabled: !!v }))} />
              <span className="text-sm font-medium">Enabled</span>
            </label>
          </div>
        </div>

        <DialogFooter className="p-5 pt-3 mt-0 flex items-center">
          {isEditing && (
            <Button variant="destructive" size="sm" onClick={handleDelete} className="mr-auto gap-1.5">
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
          )}
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button variant="gradient" onClick={handleSave}>
            {isEditing ? 'Save Changes' : 'Add Agent'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
