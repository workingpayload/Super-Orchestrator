const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const { app } = require('electron');

/**
 * SessionStore — stores orchestration session history.
 *
 * Each session is one JSON file in `<userData>/sessions/<id>.json`. A sibling
 * `<userData>/sessions/index.json` keeps just the metadata rows the renderer
 * needs (id, prompt, status, startTime, endTime, taskCount). listSessions()
 * reads only that index — previously it read every session file from disk on
 * every IPC call, which O(N)-blocked the main thread on cold mount.
 *
 * The index is a derived cache: if missing or unreadable, it's rebuilt from
 * the on-disk session files on demand.
 */

const META_KEYS = ['id', 'prompt', 'status', 'startTime', 'endTime', 'taskCount'];

function summarisePrompt(p) {
  if (typeof p !== 'string') return '';
  return p.length > 100 ? p.slice(0, 100) + '...' : p;
}

function metaFromSession(session) {
  return {
    id: session.id,
    prompt: summarisePrompt(session.prompt),
    status: session.status,
    startTime: session.startTime,
    endTime: session.endTime,
    taskCount: session.tasks?.length || 0,
  };
}

class SessionStore {
  constructor() {
    const userDataPath = app?.getPath?.('userData') || path.join(process.cwd(), '.master-orcha');
    this.sessionDir = path.join(userDataPath, 'sessions');
    this.indexPath = path.join(this.sessionDir, 'index.json');
    this._index = null; // lazy-loaded array of metadata rows
    this._ensureDir();
  }

  _ensureDir() {
    if (!fs.existsSync(this.sessionDir)) {
      fs.mkdirSync(this.sessionDir, { recursive: true });
    }
  }

  _loadIndex() {
    try {
      if (fs.existsSync(this.indexPath)) {
        const raw = fs.readFileSync(this.indexPath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this._index = parsed;
          return;
        }
      }
    } catch (e) {
      console.error('Failed to load session index, will rebuild:', e);
    }
    this._index = this._rebuildIndex();
    this._writeIndex(); // persist for next start
  }

  /** One-time scan of every session file. Used when index.json is missing. */
  _rebuildIndex() {
    const out = [];
    let files;
    try {
      files = fs.readdirSync(this.sessionDir).filter(f => f.endsWith('.json') && f !== 'index.json');
    } catch {
      return [];
    }
    for (const f of files) {
      try {
        const raw = fs.readFileSync(path.join(this.sessionDir, f), 'utf-8');
        const session = JSON.parse(raw);
        if (session?.id) out.push(metaFromSession(session));
      } catch {
        // Ignore unreadable files
      }
    }
    out.sort((a, b) => (b.startTime || 0) - (a.startTime || 0));
    return out;
  }

  _writeIndex() {
    try {
      const tmp = this.indexPath + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this._index, null, 2), 'utf-8');
      fs.renameSync(tmp, this.indexPath);
    } catch (e) {
      console.error('Failed to write session index:', e);
    }
  }

  _upsertIndex(session) {
    if (this._index === null) this._loadIndex();
    const meta = metaFromSession(session);
    const i = this._index.findIndex(r => r.id === meta.id);
    if (i >= 0) this._index[i] = meta;
    else this._index.unshift(meta);
    this._writeIndex();
  }

  _removeFromIndex(id) {
    if (this._index === null) this._loadIndex();
    const before = this._index.length;
    this._index = this._index.filter(r => r.id !== id);
    if (this._index.length !== before) this._writeIndex();
  }

  /**
   * Save a session to disk. Updates the metadata index in lockstep.
   * Note: the per-session file write is still sync to keep crash safety
   * simple — if the orchestrator dies, you keep whatever was last saved.
   */
  saveSession(session) {
    if (!session?.id) return;
    const filePath = path.join(this.sessionDir, `${session.id}.json`);
    try {
      const tmp = filePath + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(session, null, 2), 'utf-8');
      fs.renameSync(tmp, filePath);
      this._upsertIndex(session);
    } catch (e) {
      console.error('Failed to save session:', e);
    }
  }

  /** List session metadata. O(1) reads after first call. */
  listSessions() {
    if (this._index === null) this._loadIndex();
    return this._index.slice();
  }

  /** Get a full session by ID (always reads from disk). */
  getSession(id) {
    const filePath = path.join(this.sessionDir, `${id}.json`);
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (e) {
      console.error('Failed to load session:', e);
    }
    return null;
  }

  deleteSession(id) {
    const filePath = path.join(this.sessionDir, `${id}.json`);
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      this._removeFromIndex(id);
    } catch (e) {
      console.error('Failed to delete session:', e);
    }
    return true;
  }
}

module.exports = { SessionStore };
