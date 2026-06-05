const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  },

  // Dialog
  dialog: {
    openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
  },

  // Agent management
  agents: {
    list: () => ipcRenderer.invoke('agents:list'),
    add: (config) => ipcRenderer.invoke('agents:add', config),
    update: (id, config) => ipcRenderer.invoke('agents:update', id, config),
    remove: (id) => ipcRenderer.invoke('agents:remove', id),
    healthCheck: (id) => ipcRenderer.invoke('agents:healthCheck', id),
    healthCheckAll: () => ipcRenderer.invoke('agents:healthCheckAll'),
  },

  // Orchestrator
  orchestrator: {
    start: (config) => ipcRenderer.invoke('orchestrator:start', config),
    abort: () => ipcRenderer.invoke('orchestrator:abort'),
    retryTask: (taskId) => ipcRenderer.invoke('orchestrator:retryTask', taskId),
    retriggerReview: (reviewerId) => ipcRenderer.invoke('orchestrator:retriggerReview', reviewerId),
    getStatus: () => ipcRenderer.invoke('orchestrator:getStatus'),
  },

  // Config store
  config: {
    get: (key) => ipcRenderer.invoke('config:get', key),
    set: (key, value) => ipcRenderer.invoke('config:set', key, value),
    getAll: () => ipcRenderer.invoke('config:getAll'),
  },

  // Sessions
  sessions: {
    list: () => ipcRenderer.invoke('sessions:list'),
    get: (id) => ipcRenderer.invoke('sessions:get', id),
    delete: (id) => ipcRenderer.invoke('sessions:delete', id),
  },

  // Skills
  skills: {
    listClaude: (opts) => ipcRenderer.invoke('skills:listClaude', opts || {}),
  },

  // Permission bridge
  permission: {
    decide: (id, decision) => ipcRenderer.invoke('permission:decide', id, decision),
  },

  // Event listeners (for streaming)
  on: (channel, callback) => {
    const validChannels = [
      'orchestrator:progress',
      'orchestrator:taskUpdate',
      'orchestrator:output',
      'orchestrator:reviewResult',
      'orchestrator:cost',
      'orchestrator:complete',
      'orchestrator:error',
      'permission:request',
      'agent:output',
    ];
    if (validChannels.includes(channel)) {
      const subscription = (_event, ...args) => callback(...args);
      ipcRenderer.on(channel, subscription);
      return () => ipcRenderer.removeListener(channel, subscription);
    }
  },

  // Remove all listeners for a channel
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },
});
