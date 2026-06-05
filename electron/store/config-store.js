const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const { app } = require('electron');

/**
 * ConfigStore — persistent JSON configuration store.
 *
 * Writes are async and debounced (250ms trailing). Multiple `set()` calls in
 * a tick collapse to a single disk flush, and the flush itself uses
 * `fs.promises.writeFile` so it never blocks the main thread. Every flush
 * writes to a `.tmp` file then atomically renames so a crash mid-write can't
 * leave a torn config.json on disk.
 *
 * Call `flush()` on app shutdown to await any pending write.
 */
const FLUSH_DEBOUNCE_MS = 250;

class ConfigStore {
  constructor() {
    const userDataPath = app?.getPath?.('userData') || path.join(process.cwd(), '.master-orcha');
    this.filePath = path.join(userDataPath, 'config.json');
    this.data = {};
    this._saveTimer = null;
    this._writeChain = Promise.resolve();
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

  _writeNow() {
    // Snapshot the current data so concurrent set() calls during the async
    // write don't corrupt the JSON we're flushing.
    const snapshot = JSON.stringify(this.data, null, 2);
    const tmp = this.filePath + '.tmp';
    const dir = path.dirname(this.filePath);

    this._writeChain = this._writeChain
      .then(() => fsp.mkdir(dir, { recursive: true }))
      .then(() => fsp.writeFile(tmp, snapshot, 'utf-8'))
      .then(() => fsp.rename(tmp, this.filePath))
      .catch((e) => {
        console.error('Failed to save config:', e);
      });

    return this._writeChain;
  }

  _scheduleSave() {
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this._writeNow();
    }, FLUSH_DEBOUNCE_MS);
  }

  get(key) {
    return this.data[key];
  }

  set(key, value) {
    this.data[key] = value;
    this._scheduleSave();
  }

  getAll() {
    return { ...this.data };
  }

  delete(key) {
    delete this.data[key];
    this._scheduleSave();
  }

  /**
   * Cancel any pending debounce, flush remaining writes, await all in-flight
   * writes. Call before app quit.
   */
  async flush() {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
      this._writeNow();
    }
    await this._writeChain;
  }
}

module.exports = { ConfigStore };
