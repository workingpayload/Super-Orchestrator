const { ipcMain } = require('electron');
const { AgentManager } = require('./agents/agent-manager');
const { Orchestrator } = require('./orchestrator/orchestrator');
const { ConfigStore } = require('./store/config-store');
const { SessionStore } = require('./store/session-store');

let agentManager;
let orchestrator;
let configStore;
let sessionStore;

function registerIpcHandlers() {
  configStore = new ConfigStore();
  sessionStore = new SessionStore();
  agentManager = new AgentManager(configStore);
  orchestrator = new Orchestrator(agentManager, sessionStore);

  // ─── Agent Handlers ───
  ipcMain.handle('agents:list', () => {
    return agentManager.listAgents();
  });

  ipcMain.handle('agents:add', (_event, config) => {
    return agentManager.addAgent(config);
  });

  ipcMain.handle('agents:update', (_event, id, config) => {
    return agentManager.updateAgent(id, config);
  });

  ipcMain.handle('agents:remove', (_event, id) => {
    return agentManager.removeAgent(id);
  });

  ipcMain.handle('agents:healthCheck', async (_event, id) => {
    return agentManager.healthCheck(id);
  });

  ipcMain.handle('agents:healthCheckAll', async () => {
    return agentManager.healthCheckAll();
  });

  // ─── Orchestrator Handlers ───
  ipcMain.handle('orchestrator:start', async (event, config) => {
    const sender = event.sender;
    return orchestrator.start(config, sender);
  });

  ipcMain.handle('orchestrator:abort', () => {
    return orchestrator.abort();
  });

  ipcMain.handle('orchestrator:retryTask', async (event, taskId) => {
    return orchestrator.retryTask(taskId, event.sender);
  });

  ipcMain.handle('orchestrator:retriggerReview', async (event, reviewerId) => {
    return orchestrator.retriggerReview(reviewerId, event.sender);
  });

  ipcMain.handle('orchestrator:getStatus', () => {
    return orchestrator.getStatus();
  });

  // ─── Config Handlers ───
  ipcMain.handle('config:get', (_event, key) => {
    return configStore.get(key);
  });

  ipcMain.handle('config:set', (_event, key, value) => {
    configStore.set(key, value);
    return true;
  });

  ipcMain.handle('config:getAll', () => {
    return configStore.getAll();
  });

  // ─── Session Handlers ───
  ipcMain.handle('sessions:list', () => {
    return sessionStore.listSessions();
  });

  ipcMain.handle('sessions:get', (_event, id) => {
    return sessionStore.getSession(id);
  });

  ipcMain.handle('sessions:delete', (_event, id) => {
    return sessionStore.deleteSession(id);
  });
}

module.exports = { registerIpcHandlers };
