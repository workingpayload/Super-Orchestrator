const { TaskDecomposer } = require('./task-decomposer');
const { TaskRunner } = require('./task-runner');
const { ReviewManager } = require('./review-manager');
const { computeCost } = require('../pricing/pricing');
const { getBridge } = require('../permission/permission-bridge');
const { v4: uuidv4 } = require('uuid');

function prefixWithSkills(prompt, skills) {
  if (!skills || skills.length === 0) return prompt;
  const list = skills.map(s => (typeof s === 'string' ? s : s.name)).filter(Boolean);
  if (list.length === 0) return prompt;
  const header = `[Active skills for this run: ${list.join(', ')}]\nPrioritize these skills when applicable. Invoke them by name (e.g. /${list[0]}) if supported by the CLI.\n\n`;
  return header + prompt;
}

/**
 * Orchestrator — the main engine that coordinates the Master → Worker → Reviewer pipeline.
 *
 * Flow:
 * 1. User provides prompt + role assignments
 * 2. Master agent decomposes prompt into tasks
 * 3. Worker agents execute tasks (parallel/sequential)
 * 4. Reviewer agent reviews completed work
 * 5. If revisions needed, tasks go back to workers (max N rounds)
 * 6. Final output collected and session saved
 */
class Orchestrator {
  constructor(agentManager, sessionStore) {
    this.agentManager = agentManager;
    this.sessionStore = sessionStore;
    this.decomposer = new TaskDecomposer();
    this.taskRunner = new TaskRunner(agentManager);
    this.reviewManager = new ReviewManager();

    this.status = 'idle'; // idle | decomposing | executing | reviewing | revising | completed | failed | aborted
    this.currentSession = null;
    this.sender = null;
  }

  /**
   * Start the orchestration pipeline.
   * @param {object} config - { prompt, masterId, workerIds, reviewerId, cwd, concurrent, maxRevisions }
   * @param {object} sender - IPC sender (webContents) for streaming events
   */
  async start(config, sender) {
    this.sender = sender;
    const {
      prompt,
      masterId,
      reviewerId,
      cwd,
      concurrent = true,
      maxRevisions = 3,
      agentSkills = {},
    } = config;

    // Ensure permission bridge is up so any Claude agent in 'ui-prompt' mode works.
    const bridgePort = await getBridge().start();

    // Create session
    this.currentSession = {
      id: uuidv4(),
      prompt,
      cwd: cwd || process.cwd(),
      startTime: Date.now(),
      status: 'running',
      decomposition: null,
      tasks: [],
      reviewResults: [],
      revisionRound: 0,
      agentSkills,
      cost: { totalUsd: 0, byAgent: {} },
    };

    try {
      // ─── Phase 1: Master Decomposition ───
      this.status = 'decomposing';
      this._emit('orchestrator:progress', {
        phase: 'decomposing',
        message: 'Master agent is analyzing and breaking down the prompt...',
      });

      const masterAgent = this.agentManager.getAgent(masterId);
      if (!masterAgent) {
        throw new Error('Master agent not found. Please configure a master agent.');
      }

      const workers = this.agentManager.getAgentsByRole('worker');
      const decompositionPrompt = this.decomposer.buildDecompositionPrompt(prompt, workers.length);
      const masterPromptWithSkills = prefixWithSkills(decompositionPrompt, agentSkills[masterId]);

      console.log('[Orchestrator] Sending prompt to master agent:', masterAgent.name);
      console.log('[Orchestrator] Prompt length:', masterPromptWithSkills.length, 'chars');

      const masterResult = await masterAgent.execute(masterPromptWithSkills, {
        cwd,
        bridgePort,
        onData: (chunk) => {
          this._emit('orchestrator:output', {
            phase: 'decomposing',
            agent: masterAgent.name,
            chunk,
          });
        },
      });

      console.log('[Orchestrator] Master result:', { success: masterResult.success, outputLen: (masterResult.output || '').length, error: masterResult.error });

      this._recordCost(masterAgent, masterResult, 'master');

      if (!masterResult.success) {
        throw new Error(`Master agent failed: ${masterResult.error}`);
      }

      const outputLower = (masterResult.output || '').toLowerCase();
      if (outputLower.includes('not logged in') || outputLower.includes('please run /login') || outputLower.includes('authentication')) {
        throw new Error(`Master agent (${masterAgent.name}) is not logged in. Please open a terminal and run: claude /login`);
      }

      // Parse decomposition
      const decomposition = this.decomposer.parseDecomposition(masterResult.output);
      this.currentSession.decomposition = decomposition;
      this.currentSession.tasks = decomposition.tasks;

      this._emit('orchestrator:progress', {
        phase: 'decomposed',
        message: `Master created ${decomposition.tasks.length} tasks`,
        decomposition,
      });

      // ─── Phase 2: Worker Execution ───
      this.status = 'executing';
      this._emit('orchestrator:progress', {
        phase: 'executing',
        message: `Executing ${decomposition.tasks.length} tasks across ${workers.length} worker(s)...`,
      });

      let tasks = await this.taskRunner.executeTasks(decomposition.tasks, {
        cwd,
        bridgePort,
        concurrent,
        agentSkills,
        onTaskUpdate: (task) => {
          this._emit('orchestrator:taskUpdate', task);
        },
        onOutput: (output) => {
          this._emit('orchestrator:output', {
            phase: 'executing',
            ...output,
          });
        },
        onAgentResult: (agent, result) => this._recordCost(agent, result, 'worker'),
      });

      this.currentSession.tasks = tasks;

      // ─── Phase 3: Review ───
      const reviewerAgent = reviewerId ? this.agentManager.getAgent(reviewerId) : null;

      if (reviewerAgent) {
        let revisionRound = 0;

        while (revisionRound < maxRevisions) {
          this.status = 'reviewing';
          this._emit('orchestrator:progress', {
            phase: 'reviewing',
            message: `Reviewer is evaluating completed work (round ${revisionRound + 1})...`,
          });

          const completedTasks = tasks.filter(t => t.status === 'completed');
          const reviewPrompt = this.reviewManager.buildReviewPrompt(completedTasks, prompt);
          const reviewPromptWithSkills = prefixWithSkills(reviewPrompt, agentSkills[reviewerId]);

          const reviewResult = await reviewerAgent.execute(reviewPromptWithSkills, {
            cwd,
            bridgePort,
            onData: (chunk) => {
              this._emit('orchestrator:output', {
                phase: 'reviewing',
                agent: reviewerAgent.name,
                chunk,
              });
            },
          });

          this._recordCost(reviewerAgent, reviewResult, 'reviewer');

          if (!reviewResult.success) {
            console.error('[Orchestrator] Reviewer failed:', reviewResult.error, 'Raw:', reviewResult.raw);
            this._emit('orchestrator:progress', {
              phase: 'review_skipped',
              message: `Reviewer failed: ${reviewResult.error || 'unknown error'}. Treating all tasks as approved.`,
            });
            break;
          }

          const parsedReview = this.reviewManager.parseReviewResult(reviewResult.output);
          tasks = this.reviewManager.applyReviewToTasks(tasks, parsedReview);
          this.currentSession.reviewResults.push(parsedReview);

          this._emit('orchestrator:reviewResult', {
            round: revisionRound + 1,
            result: parsedReview,
          });

          // Check if revisions needed
          const needsRevision = this.reviewManager.getTasksNeedingRevision(tasks);
          if (needsRevision.length === 0 || parsedReview.overall_status === 'approved') {
            break;
          }

          // ─── Phase 4: Revisions ───
          revisionRound++;
          this.currentSession.revisionRound = revisionRound;
          this.status = 'revising';

          this._emit('orchestrator:progress', {
            phase: 'revising',
            message: `Sending ${needsRevision.length} task(s) back for revision (round ${revisionRound})...`,
          });

          for (const task of needsRevision) {
            const revisedPrompt = this.decomposer.buildRevisionPrompt(
              task,
              task.reviewFeedback + (task.reviewSuggestion ? `\nSuggestion: ${task.reviewSuggestion}` : '')
            );
            task.prompt = revisedPrompt;
            task.status = 'queued';
            task.output = '';
            task.error = null;

            const worker = workers[0]; // Use first available worker for revisions
            await this.taskRunner.executeRevision(task, worker, {
              cwd,
              bridgePort,
              agentSkills,
              onTaskUpdate: (t) => this._emit('orchestrator:taskUpdate', t),
              onOutput: (output) => {
                this._emit('orchestrator:output', {
                  phase: 'revising',
                  ...output,
                });
              },
              onAgentResult: (a, r) => this._recordCost(a, r, 'worker'),
            });
          }

          this.currentSession.tasks = tasks;
        }
      }

      // ─── Complete ───
      this.status = 'completed';
      this.currentSession.status = 'completed';
      this.currentSession.endTime = Date.now();

      // Save session
      this.sessionStore.saveSession(this.currentSession);

      this._emit('orchestrator:complete', {
        session: this.currentSession,
        message: 'Orchestration completed successfully!',
      });

      return {
        success: true,
        session: this.currentSession,
      };

    } catch (error) {
      this.status = 'failed';
      if (this.currentSession) {
        this.currentSession.status = 'failed';
        this.currentSession.error = error.message;
        this.currentSession.endTime = Date.now();
        this.sessionStore.saveSession(this.currentSession);
      }

      this._emit('orchestrator:error', {
        message: error.message,
        phase: this.status,
      });

      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Restore session from store if currentSession is null.
   */
  _ensureSession() {
    if (!this.currentSession) {
      const sessions = this.sessionStore.listSessions();
      if (sessions.length > 0) {
        this.currentSession = this.sessionStore.getSession(sessions[0].id);
      }
    }
    if (!this.currentSession) {
      throw new Error('No active session. Run orchestration first.');
    }
  }

  /**
   * Retry a single failed task.
   */
  async retryTask(taskId, sender) {
    this.sender = sender;
    this._ensureSession();

    const task = this.currentSession.tasks.find(t => t.id === taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const workers = this.agentManager.getAgentsByRole('worker');
    if (workers.length === 0) {
      throw new Error('No worker agents available');
    }

    task.status = 'queued';
    task.error = null;
    task.output = '';
    task.reviewStatus = null;
    task.reviewFeedback = null;
    task.reviewSuggestion = null;
    this._emit('orchestrator:taskUpdate', { ...task });

    this._emit('orchestrator:progress', {
      phase: 'executing',
      message: `Retrying task T-${task.id}: ${task.title}`,
    });

    const worker = workers[0];
    const bridgePort = await getBridge().start();
    await this.taskRunner.executeRevision(task, worker, {
      cwd: this.currentSession.cwd,
      bridgePort,
      agentSkills: this.currentSession.agentSkills || {},
      onTaskUpdate: (t) => this._emit('orchestrator:taskUpdate', t),
      onOutput: (output) => {
        this._emit('orchestrator:output', {
          phase: 'executing',
          ...output,
        });
      },
      onAgentResult: (a, r) => this._recordCost(a, r, 'worker'),
    });

    this.sessionStore.saveSession(this.currentSession);
    return { success: true, task };
  }

  /**
   * Re-trigger review on all completed tasks.
   */
  async retriggerReview(reviewerId, sender) {
    this.sender = sender;
    this._ensureSession();

    const reviewerAgent = reviewerId ? this.agentManager.getAgent(reviewerId) : null;
    if (!reviewerAgent) {
      throw new Error('No reviewer agent found');
    }

    const completedTasks = this.currentSession.tasks.filter(t => t.status === 'completed');
    if (completedTasks.length === 0) {
      throw new Error('No completed tasks to review');
    }

    this.status = 'reviewing';
    this._emit('orchestrator:progress', {
      phase: 'reviewing',
      message: `Re-reviewing ${completedTasks.length} completed task(s)...`,
    });

    const reviewPrompt = this.reviewManager.buildReviewPrompt(
      completedTasks,
      this.currentSession.prompt
    );
    const sessionSkills = this.currentSession.agentSkills || {};
    const reviewPromptWithSkills = prefixWithSkills(reviewPrompt, sessionSkills[reviewerId]);

    const bridgePort = await getBridge().start();
    const reviewResult = await reviewerAgent.execute(reviewPromptWithSkills, {
      cwd: this.currentSession.cwd,
      bridgePort,
      onData: (chunk) => {
        this._emit('orchestrator:output', {
          phase: 'reviewing',
          agent: reviewerAgent.name,
          chunk,
        });
      },
    });

    this._recordCost(reviewerAgent, reviewResult, 'reviewer');

    if (!reviewResult.success) {
      console.error('[Orchestrator] Re-review failed:', reviewResult.error);
      this._emit('orchestrator:progress', {
        phase: 'review_skipped',
        message: `Re-review failed: ${reviewResult.error || 'unknown error'}`,
      });
      return { success: false, error: reviewResult.error };
    }

    const parsedReview = this.reviewManager.parseReviewResult(reviewResult.output);
    this.currentSession.tasks = this.reviewManager.applyReviewToTasks(
      this.currentSession.tasks,
      parsedReview
    );
    this.currentSession.reviewResults.push(parsedReview);

    const round = this.currentSession.reviewResults.length;
    this._emit('orchestrator:reviewResult', { round, result: parsedReview });

    for (const task of this.currentSession.tasks) {
      this._emit('orchestrator:taskUpdate', { ...task });
    }

    this.status = 'completed';
    this._emit('orchestrator:progress', {
      phase: 'completed',
      message: 'Re-review completed',
    });

    this.sessionStore.saveSession(this.currentSession);
    return { success: true, result: parsedReview };
  }

  /**
   * Abort the current orchestration.
   */
  abort() {
    this.taskRunner.abort();
    this.status = 'aborted';
    if (this.currentSession) {
      this.currentSession.status = 'aborted';
      this.currentSession.endTime = Date.now();
    }
    this._emit('orchestrator:progress', {
      phase: 'aborted',
      message: 'Orchestration aborted by user',
    });
    return true;
  }

  /**
   * Get current orchestrator status.
   */
  getStatus() {
    return {
      status: this.status,
      session: this.currentSession,
    };
  }

  /**
   * Record cost from a single agent invocation onto the session totals.
   * Emits orchestrator:cost with the running summary.
   */
  _recordCost(agent, result, role) {
    if (!this.currentSession || !result) return;
    const usage = result.usage;
    if (!usage) return;

    const reportedCost = typeof usage.costUsd === 'number' ? usage.costUsd : null;
    const computed = computeCost(usage, agent.type, agent.model || result.model);
    const callCost = reportedCost != null ? reportedCost : computed;

    const cost = this.currentSession.cost || (this.currentSession.cost = { totalUsd: 0, byAgent: {} });
    if (!cost.byAgent[agent.id]) {
      cost.byAgent[agent.id] = {
        agentId: agent.id,
        agentName: agent.name,
        agentType: agent.type,
        role: role || agent.role,
        model: agent.model || null,
        calls: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        totalUsd: 0,
      };
    }
    const slot = cost.byAgent[agent.id];
    slot.calls += 1;
    slot.inputTokens += Number(usage.inputTokens || 0);
    slot.outputTokens += Number(usage.outputTokens || 0);
    slot.cacheReadTokens += Number(usage.cacheReadTokens || 0);
    slot.cacheWriteTokens += Number(usage.cacheWriteTokens || 0);
    slot.totalUsd += callCost;
    cost.totalUsd += callCost;

    this._emit('orchestrator:cost', {
      totalUsd: cost.totalUsd,
      byAgent: Object.values(cost.byAgent),
      lastCall: {
        agentId: agent.id,
        agentName: agent.name,
        role: role || agent.role,
        costUsd: callCost,
        usage,
      },
    });
  }

  /**
   * Emit an IPC event to the renderer.
   */
  _emit(channel, data) {
    try {
      if (this.sender && !this.sender.isDestroyed()) {
        this.sender.send(channel, data);
      }
    } catch (e) {
      // Sender might be destroyed
    }
  }
}

module.exports = { Orchestrator };
