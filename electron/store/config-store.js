const fs = require('fs');
const path = require('path');
const { app } = require('electron');

/**
 * ConfigStore — persistent JSON configuration store.
 * Stores agent configs, preferences, and app settings.
 */
class ConfigStore {
  constructor() {
    const userDataPath = app?.getPath?.('userData') || path.join(process.cwd(), '.master-orcha');
    this.filePath = path.join(userDataPath, 'config.json');
    this.data = {};
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        this.data = JSON.parse(raw);
      }
    } catch (e) {
      console.error('Failed to load config:', e);
      this.data = {};
    }
  }

  _save() {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (e) {
      console.error('Failed to save config:', e);
    }
  }

  get(key) {
    return this.data[key];
  }

  set(key, value) {
    this.data[key] = value;
    this._save();
  }

  getAll() {
    return { ...this.data };
  }

  delete(key) {
    delete this.data[key];
    this._save();
  }
}

module.exports = { ConfigStore };
