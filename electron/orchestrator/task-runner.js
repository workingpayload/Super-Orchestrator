/**
 * TaskRunner — manages concurrent/sequential execution of tasks across worker agents.
 * Handles dependency resolution, parallel execution, streaming output, and retries.
 */
function prefixWithSkills(prompt, skills) {
  if (!skills || skills.length === 0) return prompt;
  const list = skills.map(s => (typeof s === 'string' ? s : s.name)).filter(Boolean);
  if (list.length === 0) return prompt;
  const header = `[Active skills for this run: ${list.join(', ')}]\nPrioritize these skills when applicable. Invoke them by name (e.g. /${list[0]}) if supported by the CLI.\n\n`;
  return header + prompt;
}

class TaskRunner {
  constructor(agentManager) {
    this.agentManager = agentManager;
    this.abortController = null;
  }

  /**
   * Execute all tasks respecting dependencies.
   *
   * Scheduler: pull-based, DAG-aware, parallel.
   *   - Maintain a pool of in-flight task promises (one entry per task).
   *   - Whenever a task settles, mark it complete and re-evaluate readiness.
   *   - Launch every newly-ready task up to `maxConcurrency`, round-robin
   *     over available worker agents.
   *   - Each agent supports concurrent execute() calls (BaseAgent tracks
   *     spawned processes in a Set), so two parallel tasks on one worker
   *     spawn two CLI processes.
   *
   * @param {object[]} tasks
   * @param {object} options
   *   - cwd, bridgePort, agentSkills
   *   - concurrent (bool, default true) — when false, serializes to 1.
   *   - maxConcurrency (number) — cap on simultaneous tasks. Defaults to
   *     `tasks.length` when concurrent, else 1.
   *   - onTaskUpdate, onOutput, onAgentResult
   * @returns {Promise<object[]>}
   */
  async executeTasks(tasks, options = {}) {
    const {
      cwd, bridgePort, onTaskUpdate, onOutput,
      concurrent = true,
      maxConcurrency,
      agentSkills = {},
      onAgentResult,
    } = options;
    this.abortController = new AbortController();

    const workers = this.agentManager.getAgentsByRole('worker');
    if (workers.length === 0) {
      throw new Error('No worker agents configured. Please add at least one worker agent.');
    }

    const limit = concurrent
      ? Math.max(1, Number(maxConcurrency) || tasks.length)
      : 1;

    const completedIds = new Set();
    const results = new Map();
    // taskId → in-flight promise resolving to the updated task
    const inflight = new Map();
    let rrCursor = 0;

    const launchReady = () => {
      if (this.abortController.signal.aborted) return;
      while (inflight.size < limit) {
        const next = tasks.find(t =>
          !completedIds.has(t.id) &&
          !inflight.has(t.id) &&
          (t.dependencies || []).every(depId => completedIds.has(depId))
        );
        if (!next) return;

        const worker = workers[rrCursor % workers.length];
        rrCursor++;

        const p = this._executeTask(next, worker, {
          cwd, bridgePort, onTaskUpdate, onOutput, agentSkills, onAgentResult,
        }).then(t => {
          inflight.delete(t.id);
          completedIds.add(t.id);
          results.set(t.id, t);
          return t;
        }).catch(err => {
          inflight.delete(next.id);
          completedIds.add(next.id);
          next.status = 'failed';
          next.error = err?.message || String(err);
          results.set(next.id, next);
          return next;
        });

        inflight.set(next.id, p);
      }
    };

    while (completedIds.size < tasks.length) {
      launchReady();

      if (inflight.size === 0) {
        // Nothing in flight and nothing newly ready → unresolvable deps.
        const remaining = tasks.filter(t => !completedIds.has(t.id));
        for (const t of remaining) {
          t.status = 'failed';
          t.error = 'Dependency deadlock — cannot resolve dependencies';
          completedIds.add(t.id);
          results.set(t.id, t);
          if (onTaskUpdate) onTaskUpdate(t);
        }
        break;
      }

      // Wake up as soon as ANY in-flight task finishes, then re-schedule.
      await Promise.race(Array.from(inflight.values()));

      if (this.abortController.signal.aborted) {
        // Drain remaining without launching new work.
        await Promise.allSettled(Array.from(inflight.values()));
        break;
      }
    }

    return tasks.map(t => results.get(t.id) || t);
  }

  /**
   * Execute a single task with a worker agent.
   */
  async _executeTask(task, worker, options = {}) {
    const { cwd, bridgePort, onTaskUpdate, onOutput, agentSkills = {}, onAgentResult } = options;

    task.status = 'running';
    task.assignedAgent = worker.toConfig();
    task.startTime = Date.now();
    if (onTaskUpdate) onTaskUpdate({ ...task });

    const promptForExec = prefixWithSkills(task.prompt, agentSkills[worker.id]);

    try {
      const result = await worker.execute(promptForExec, {
        cwd,
        bridgePort,
        signal: this.abortController?.signal,
        onData: (chunk, source) => {
          if (onOutput) {
            onOutput({
              taskId: task.id,
              agentName: worker.name,
              chunk,
              source,
              timestamp: Date.now(),
            });
          }
        },
      });

      task.endTime = Date.now();

      if (result.success) {
        task.status = 'completed';
        task.output = result.output;
        task.usage = result.usage || null;
      } else {
        task.status = 'failed';
        task.error = result.error;
        task.output = result.raw || '';
      }

      if (onAgentResult) onAgentResult(worker, result);
    } catch (err) {
      task.endTime = Date.now();
      task.status = 'failed';
      task.error = err.message;
    }

    if (onTaskUpdate) onTaskUpdate({ ...task });
    return task;
  }

  /**
   * Execute a single task revision.
   */
  async executeRevision(task, worker, options = {}) {
    task.status = 'running';
    task.startTime = Date.now();
    if (options.onTaskUpdate) options.onTaskUpdate({ ...task });

    const agentSkills = options.agentSkills || {};
    const promptForExec = prefixWithSkills(task.prompt, agentSkills[worker.id]);

    const result = await worker.execute(promptForExec, {
      cwd: options.cwd,
      bridgePort: options.bridgePort,
      onData: (chunk, source) => {
        if (options.onOutput) {
          options.onOutput({
            taskId: task.id,
            agentName: worker.name,
            chunk,
            source,
            timestamp: Date.now(),
          });
        }
      },
    });

    task.endTime = Date.now();

    if (result.success) {
      task.status = 'completed';
      task.output = result.output;
      task.usage = result.usage || null;
      task.reviewStatus = null;
      task.reviewFeedback = null;
    } else {
      task.status = 'failed';
      task.error = result.error;
    }

    if (options.onAgentResult) options.onAgentResult(worker, result);
    if (options.onTaskUpdate) options.onTaskUpdate({ ...task });
    return task;
  }

  /**
   * Abort all running tasks.
   */
  abort() {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.agentManager.abortAll();
  }
}

module.exports = { TaskRunner };
