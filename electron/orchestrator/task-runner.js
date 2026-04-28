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
    this.runningTasks = new Map();
    this.abortController = null;
  }

  /**
   * Execute all tasks respecting dependencies.
   * @param {object[]} tasks - Array of task objects
   * @param {object} options - { cwd, onTaskUpdate, onOutput, concurrent }
   * @returns {Promise<object[]>} Updated tasks with results
   */
  async executeTasks(tasks, options = {}) {
    const { cwd, bridgePort, onTaskUpdate, onOutput, concurrent = true, agentSkills = {}, onAgentResult } = options;
    this.abortController = new AbortController();

    const completedIds = new Set();
    const taskMap = new Map(tasks.map(t => [t.id, { ...t }]));
    const results = new Map();

    // Get available workers
    const workers = this.agentManager.getAgentsByRole('worker');
    if (workers.length === 0) {
      throw new Error('No worker agents configured. Please add at least one worker agent.');
    }

    // Execute tasks in dependency order
    while (completedIds.size < tasks.length) {
      if (this.abortController.signal.aborted) {
        break;
      }

      // Find tasks that can run (all dependencies met)
      const ready = tasks.filter(t =>
        !completedIds.has(t.id) &&
        !this.runningTasks.has(t.id) &&
        t.dependencies.every(depId => completedIds.has(depId))
      );

      if (ready.length === 0 && this.runningTasks.size === 0) {
        // Deadlock — remaining tasks have unresolvable dependencies
        const remaining = tasks.filter(t => !completedIds.has(t.id));
        for (const t of remaining) {
          t.status = 'failed';
          t.error = 'Dependency deadlock — cannot resolve dependencies';
          completedIds.add(t.id);
          if (onTaskUpdate) onTaskUpdate(t);
        }
        break;
      }

      if (ready.length > 0) {
        if (concurrent) {
          // Launch all ready tasks in parallel
          const promises = ready.map((task, index) => {
            const worker = workers[index % workers.length];
            return this._executeTask(task, worker, { cwd, bridgePort, onTaskUpdate, onOutput, agentSkills, onAgentResult });
          });

          // Wait for at least one to complete
          const completed = await Promise.race(
            promises.map(p => p.then(t => {
              completedIds.add(t.id);
              results.set(t.id, t);
              return t;
            }))
          );

          // Wait for all currently running to settle
          await Promise.allSettled(
            Array.from(this.runningTasks.values())
          );

          // Collect all completed
          for (const [id, promise] of this.runningTasks) {
            try {
              const t = await promise;
              completedIds.add(t.id);
              results.set(t.id, t);
            } catch (e) {
              completedIds.add(id);
            }
          }
        } else {
          // Sequential execution
          for (const task of ready) {
            if (this.abortController.signal.aborted) break;
            const worker = workers[0]; // Use first available worker
            const completed = await this._executeTask(task, worker, { cwd, bridgePort, onTaskUpdate, onOutput, agentSkills, onAgentResult });
            completedIds.add(completed.id);
            results.set(completed.id, completed);
          }
        }
      } else {
        // Wait for running tasks to complete
        await Promise.allSettled(
          Array.from(this.runningTasks.values())
        );
        for (const [id, promise] of this.runningTasks) {
          try {
            const t = await promise;
            completedIds.add(t.id);
            results.set(t.id, t);
          } catch (e) {
            completedIds.add(id);
          }
        }
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

    const taskPromise = (async () => {
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

      this.runningTasks.delete(task.id);
      if (onTaskUpdate) onTaskUpdate({ ...task });
      return task;
    })();

    this.runningTasks.set(task.id, taskPromise);
    return taskPromise;
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
    this.runningTasks.clear();
  }
}

module.exports = { TaskRunner };
