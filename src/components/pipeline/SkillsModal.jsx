import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Puzzle,
  RefreshCw,
  Trash2,
  ChevronDown,
  ChevronRight,
  Plus,
  X,
  Search,
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

const TYPE_GRADIENT = {
  claude: 'from-amber-500 to-orange-600',
  gemini: 'from-blue-500 to-cyan-500',
  codex: 'from-emerald-500 to-green-600',
  custom: 'from-violet-500 to-purple-600',
};

const TYPE_LETTER = { claude: 'C', gemini: 'G', codex: 'X', custom: '⚙' };

export default function SkillsModal() {
  const { state, dispatch, setAgentSkills, clearAgentSkills, loadClaudeSkills } = useApp();
  const { agents, claudeSkills, agentSkills } = state;

  const close = () => dispatch({ type: 'HIDE_SKILLS_MODAL' });

  const enabledAgents = useMemo(() => agents.filter((a) => a.enabled !== false), [agents]);
  const [expandedAgentId, setExpandedAgentId] = useState(enabledAgents[0]?.id || null);
  const [filter, setFilter] = useState('');
  const [customInput, setCustomInput] = useState({});

  const toggleClaudeSkill = (agentId, skillName) => {
    const current = agentSkills[agentId] || [];
    const next = current.includes(skillName)
      ? current.filter((s) => s !== skillName)
      : [...current, skillName];
    setAgentSkills(agentId, next);
  };

  const addCustomSkill = (agentId) => {
    const raw = (customInput[agentId] || '').trim();
    if (!raw) return;
    const names = raw.split(',').map((s) => s.trim()).filter(Boolean);
    const merged = Array.from(new Set([...(agentSkills[agentId] || []), ...names]));
    setAgentSkills(agentId, merged);
    setCustomInput((prev) => ({ ...prev, [agentId]: '' }));
  };

  const removeSkill = (agentId, name) => {
    const current = agentSkills[agentId] || [];
    setAgentSkills(agentId, current.filter((s) => s !== name));
  };

  const filteredSkills = useMemo(() => {
    if (!filter.trim()) return claudeSkills;
    const q = filter.toLowerCase();
    return claudeSkills.filter(
      (s) =>
        (s.name || '').toLowerCase().includes(q) ||
        (s.description || '').toLowerCase().includes(q) ||
        (s.displayName || '').toLowerCase().includes(q)
    );
  }, [claudeSkills, filter]);

  const totalSelected = Object.values(agentSkills).reduce((sum, arr) => sum + (arr?.length || 0), 0);

  return (
    <Dialog open onOpenChange={(v) => !v && close()}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-5 pb-3 border-b border-border/60">
          <div className="flex items-center gap-2 pr-8">
            <Puzzle className="h-5 w-5 text-accent" />
            <DialogTitle>Skills · per run</DialogTitle>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Select skills per agent. Applies to this run only. Claude reads <code className="font-mono text-foreground/80">~/.claude/skills/</code>;
            others accept freeform names hinted in the prompt.
          </p>
        </DialogHeader>

        <div className="px-5 py-3 flex items-center gap-2 border-b border-border/60 bg-secondary/20">
          <Button variant="outline" size="sm" onClick={() => loadClaudeSkills({ force: true })} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            Rescan
          </Button>
          {totalSelected > 0 && (
            <Button variant="ghost" size="sm" onClick={clearAgentSkills} className="gap-1.5 text-destructive hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
              Clear all
            </Button>
          )}
          <span className="ml-auto text-xs text-muted-foreground">
            <Badge variant="outline" className="font-mono mr-1">{claudeSkills.length}</Badge>
            detected ·
            <Badge variant="accent" className="font-mono ml-2">{totalSelected}</Badge>
            selected
          </span>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-5">
          <div className="py-4 space-y-2">
            {enabledAgents.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Puzzle className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <div className="text-sm font-semibold">No enabled agents</div>
                <div className="text-xs mt-1">Add and enable agents first.</div>
              </div>
            ) : (
              enabledAgents.map((agent) => {
                const selected = agentSkills[agent.id] || [];
                const isExpanded = expandedAgentId === agent.id;
                const isClaude = agent.type === 'claude';

                return (
                  <motion.div
                    key={agent.id}
                    layout
                    className="rounded-xl border border-border/60 bg-card/40 backdrop-blur-sm overflow-hidden"
                  >
                    <button
                      onClick={() => setExpandedAgentId(isExpanded ? null : agent.id)}
                      className="w-full flex items-center gap-3 p-3 hover:bg-secondary/30 transition-colors"
                    >
                      <div
                        className={cn(
                          'h-8 w-8 rounded-md bg-gradient-to-br flex items-center justify-center text-white font-bold text-sm shadow-md',
                          TYPE_GRADIENT[agent.type] || TYPE_GRADIENT.custom
                        )}
                      >
                        {TYPE_LETTER[agent.type] || '⚙'}
                      </div>
                      <div className="flex-1 text-left">
                        <div className="text-sm font-semibold">{agent.name}</div>
                        <div className="text-[10px] text-muted-foreground capitalize">
                          {agent.role} · {selected.length} skill{selected.length === 1 ? '' : 's'}
                        </div>
                      </div>
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </button>

                    <AnimatePresence initial={false}>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="p-3 pt-0 border-t border-border/40 space-y-3">
                            {selected.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {selected.map((name) => (
                                  <motion.span
                                    key={name}
                                    layout
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.8 }}
                                    className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/15 text-accent px-2 py-0.5 text-[10px] font-semibold"
                                  >
                                    {name}
                                    <button
                                      onClick={() => removeSkill(agent.id, name)}
                                      className="hover:text-destructive"
                                    >
                                      <X className="h-2.5 w-2.5" />
                                    </button>
                                  </motion.span>
                                ))}
                              </div>
                            )}

                            {isClaude ? (
                              <div className="space-y-2">
                                <div className="relative">
                                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                                  <Input
                                    placeholder="Filter skills…"
                                    value={filter}
                                    onChange={(e) => setFilter(e.target.value)}
                                    className="pl-8 h-9"
                                  />
                                </div>
                                <div className="rounded-lg border border-border/60 bg-secondary/20 max-h-72 overflow-auto scrollbar-thin">
                                  {filteredSkills.length === 0 ? (
                                    <div className="p-4 text-center text-xs text-muted-foreground">
                                      {claudeSkills.length === 0
                                        ? 'No skills detected. Place at ~/.claude/skills/<name>/SKILL.md'
                                        : 'No matches for filter.'}
                                    </div>
                                  ) : (
                                    filteredSkills.map((skill) => {
                                      const checked = selected.includes(skill.name);
                                      return (
                                        <label
                                          key={`${skill.source}|${skill.name}`}
                                          className="flex items-start gap-2.5 px-3 py-2 cursor-pointer hover:bg-secondary/40 transition-colors border-b border-border/30 last:border-0"
                                        >
                                          <Checkbox
                                            checked={checked}
                                            onCheckedChange={() => toggleClaudeSkill(agent.id, skill.name)}
                                            className="mt-0.5"
                                          />
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-baseline gap-2">
                                              <span className="text-sm font-medium">{skill.name}</span>
                                              <span className="text-[10px] text-muted-foreground font-mono">
                                                {skill.source}
                                              </span>
                                            </div>
                                            {skill.description && (
                                              <div className="text-[11px] text-muted-foreground leading-snug mt-0.5">
                                                {skill.description}
                                              </div>
                                            )}
                                          </div>
                                        </label>
                                      );
                                    })
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                <Label>Add skill names (comma-separated)</Label>
                                <div className="flex gap-2">
                                  <Input
                                    placeholder="e.g. code-review, tdd, refactor"
                                    value={customInput[agent.id] || ''}
                                    onChange={(e) =>
                                      setCustomInput((prev) => ({ ...prev, [agent.id]: e.target.value }))
                                    }
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        addCustomSkill(agent.id);
                                      }
                                    }}
                                  />
                                  <Button size="sm" onClick={() => addCustomSkill(agent.id)} className="gap-1">
                                    <Plus className="h-3.5 w-3.5" />
                                    Add
                                  </Button>
                                </div>
                                <p className="text-[10px] text-muted-foreground">
                                  Gemini/Codex/Custom — names are injected as prompt hints.
                                </p>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })
            )}
          </div>
        </div>

        <DialogFooter className="p-5 pt-3 mt-0">
          <Button variant="gradient" onClick={close}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
