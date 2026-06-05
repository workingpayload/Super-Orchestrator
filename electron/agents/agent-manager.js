const { v4: uuidv4 } = require('uuid');
const { ClaudeAgent } = require('./claude-agent');
const { GeminiAgent } = require('./gemini-agent');
const { CodexAgent } = require('./codex-agent');
const { CustomAgent } = require('./custom-agent');

/**
 * AgentManager — manages the lifecycle of all configured agents.
 * Handles creation, updates, removal, and health checks.
 */
class AgentManager {
  constructor(configStore) {
    this.configStore = configStore;
    this.agents = new Map();
    this._loadAgents();
  }

  /**
   * Load agents from persistent config store.
   */
  _loadAgents() {
    const savedAgents = this.configStore.get('agents') || [];
    let migrated = false;
    for (const config of savedAgents) {
      // One-shot migration: any Claude agent without an explicit permissionMode
      // is forced to 'bypass' to avoid silent permission hangs.
      if (config.type === 'claude' && !config.permissionMode) {
        config.permissionMode = 'bypass';
        migrated = true;
      }
      // Codex/Gemini default autoApprove true if missing.
      if ((config.type === 'codex' || config.type === 'gemini') && config.autoApprove === undefined) {
        config.autoApprove = true;
        migrated = true;
      }
      const agent = this._createAgent(config);
      if (agent) {
        this.agents.set(config.id, agent);
      }
    }

    // If no agents configured, create defaults
    if (this.agents.size === 0) {
      this._createDefaults();
    } else if (migrated) {
      this._saveAgents();
    }
  }

  /**
   * Create default agent configurations.
   */
  _createDefaults() {
    const defaults = [
      {
        id: uuidv4(),
        name: 'Claude',
        type: 'claude',
        role: 'master',
        cliPath: 'claude',
        extraFlags: [],
        enabled: true,
      },
      {
        id: uuidv4(),
        name: 'Gemini',
        type: 'gemini',
        role: 'worker',
        cliPath: 'gemini',
        extraFlags: [],
        enabled: true,
      },
      {
        id: uuidv4(),
        name: 'Codex',
        type: 'codex',
        role: 'worker',
        cliPath: 'codex',
        extraFlags: [],
        enabled: true,
      },
    ];

    for (const config of defaults) {
      const agent = this._createAgent(config);
      if (agent) {
        this.agents.set(config.id, agent);
      }
    }

    this._saveAgents();
  }

  /**
   * Create an agent instance from config.
   */
  _createAgent(config) {
    switch (config.type) {
      case 'claude':
        return new ClaudeAgent(config);
      case 'gemini':
        return new GeminiAgent(config);
      case 'codex':
        return new CodexAgent(config);
      case 'custom':
        return new CustomAgent(config);
      default:
        console.warn(`Unknown agent type: ${config.type}`);
        return null;
    }
  }

  /**
   * Persist agent configs to store.
   */
  _saveAgents() {
    const configs = Array.from(this.agents.values()).map(a => a.toConfig());
    this.configStore.set('agents', configs);
  }

  /**
   * List all configured agents.
   */
  listAgents() {
    return Array.from(this.agents.values()).map(a => a.toConfig());
  }

  /**
   * Add a new agent.
   */
  addAgent(config) {
    const id = uuidv4();
    const agentConfig = { ...config, id };
    const agent = this._createAgent(agentConfig);
    if (!agent) {
      throw new Error(`Cannot create agent of type: ${config.type}`);
    }
    this.agents.set(id, agent);
    this._saveAgents();
    return agent.toConfig();
  }

  /**
   * Update an existing agent.
   */
  updateAgent(id, config) {
    const existing = this.agents.get(id);
    if (!existing) {
      throw new Error(`Agent not found: ${id}`);
    }
    const updatedConfig = { ...existing.toConfig(), ...config, id };
    const agent = this._createAgent(updatedConfig);
    if (!agent) {
      throw new Error(`Cannot create agent of type: ${updatedConfig.type}`);
    }
    this.agents.set(id, agent);
    this._saveAgents();
    return agent.toConfig();
  }

  /**
   * Remove an agent.
   */
  removeAgent(id) {
    const agent = this.agents.get(id);
    if (agent) {
      agent.abort();
      this.agents.delete(id);
      this._saveAgents();
    }
    return true;
  }

  /**
   * Run health check on a specific agent.
   */
  async healthCheck(id) {
    const agent = this.agents.get(id);
    if (!agent) {
      return { available: false, error: 'Agent not found' };
    }
    return agent.healthCheck();
  }

  /**
   * Run health check on all agents in parallel.
   */
  async healthCheckAll() {
    const entries = Array.from(this.agents.entries());
    const results = await Promise.all(
      entries.map(([id, agent]) =>
        agent.healthCheck()
          .then((r) => [id, r])
          .catch((e) => [id, { available: false, error: e?.message || String(e) }])
      )
    );
    return Object.fromEntries(results);
  }

  /**
   * Get an agent by ID.
   */
  getAgent(id) {
    return this.agents.get(id);
  }

  /**
   * Get agents by role.
   */
  getAgentsByRole(role) {
    return Array.from(this.agents.values()).filter(a => a.role === role && a.enabled);
  }

  /**
   * Abort all running agents.
   */
  abortAll() {
    for (const agent of this.agents.values()) {
      agent.abort();
    }
  }
}

module.exports = { AgentManager };
