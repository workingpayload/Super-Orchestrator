const fs = require('fs');
const path = require('path');
const { app } = require('electron');

/**
 * SessionStore — stores orchestration session history.
 * Each session includes the prompt, task breakdown, outputs, and review results.
 */
class SessionStore {
  constructor() {
    const userDataPath = app?.getPath?.('userData') || path.join(process.cwd(), '.master-orcha');
    this.sessionDir = path.join(userDataPath, 'sessions');
    this._ensureDir();
  }

  _ensureDir() {
    if (!fs.existsSync(this.sessionDir)) {
      fs.mkdirSync(this.sessionDir, { recursive: true });
    }
  }

  /**
   * Save a session to disk.
   */
  saveSession(session) {
    const filePath = path.join(this.sessionDir, `${session.id}.json`);
    try {
      fs.writeFileSync(filePath, JSON.stringify(session, null, 2), 'utf-8');
    } catch (e) {
      console.error('Failed to save session:', e);
    }
  }

  /**
   * List all saved sessions (metadata only).
   */
  listSessions() {
    try {
      const files = fs.readdirSync(this.sessionDir).filter(f => f.endsWith('.json'));
      return files.map(f => {
        try {
          const raw = fs.readFileSync(path.join(this.sessionDir, f), 'utf-8');
          const session = JSON.parse(raw);
          return {
            id: session.id,
            prompt: session.prompt?.substring(0, 100) + (session.prompt?.length > 100 ? '...' : ''),
            status: session.status,
            startTime: session.startTime,
            endTime: session.endTime,
            taskCount: session.tasks?.length || 0,
          };
        } catch {
          return null;
        }
      }).filter(Boolean).sort((a, b) => (b.startTime || 0) - (a.startTime || 0));
    } catch {
      return [];
    }
  }

  /**
   * Get a full session by ID.
   */
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

  /**
   * Delete a session.
   */
  deleteSession(id) {
    const filePath = path.join(this.sessionDir, `${id}.json`);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (e) {
      console.error('Failed to delete session:', e);
    }
    return true;
  }
}

module.exports = { SessionStore };
