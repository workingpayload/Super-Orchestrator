const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Scans Claude skill directories and returns a flat list of { name, description, source, path }.
 * Skills live under ~/.claude/skills/<slug>/SKILL.md (user) and plugin caches.
 */

function parseFrontmatter(content) {
  const match = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const out = {};
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      let val = line.slice(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      out[key] = val;
    }
  }
  return out;
}

function findSkillFile(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (entry.isFile() && /^skill\.md$/i.test(entry.name)) {
      return path.join(dir, entry.name);
    }
  }
  return null;
}

function scanSkillsRoot(root, sourceLabel) {
  const out = [];
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillFile = findSkillFile(path.join(root, entry.name));
    if (!skillFile) continue;
    try {
      const content = fs.readFileSync(skillFile, 'utf8');
      const fm = parseFrontmatter(content);
      out.push({
        name: fm.name || entry.name,
        displayName: entry.name,
        description: fm.description || '',
        source: sourceLabel,
        path: skillFile,
      });
    } catch {}
  }
  return out;
}

function walkForSkillsDirs(root, maxDepth = 5) {
  const found = [];
  const queue = [{ dir: root, depth: 0 }];
  while (queue.length) {
    const { dir, depth } = queue.shift();
    if (depth > maxDepth) continue;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const full = path.join(dir, entry.name);
      if (entry.name === 'skills') {
        found.push(full);
      } else if (entry.name !== 'node_modules' && !entry.name.startsWith('.cursor') && !entry.name.startsWith('.windsurf')) {
        queue.push({ dir: full, depth: depth + 1 });
      }
    }
  }
  return found;
}

function listClaudeSkills() {
  const home = os.homedir();
  const results = [];
  const seen = new Set();

  const push = (skill) => {
    const key = (skill.name || '').toLowerCase() + '|' + skill.source;
    if (seen.has(key)) return;
    seen.add(key);
    results.push(skill);
  };

  // User skills
  for (const s of scanSkillsRoot(path.join(home, '.claude', 'skills'), 'user')) {
    push(s);
  }

  // Plugin skills
  const pluginsCache = path.join(home, '.claude', 'plugins', 'cache');
  let plugins;
  try {
    plugins = fs.readdirSync(pluginsCache, { withFileTypes: true });
  } catch {
    plugins = [];
  }
  for (const plugin of plugins) {
    if (!plugin.isDirectory()) continue;
    const pluginRoot = path.join(pluginsCache, plugin.name);
    const skillsDirs = walkForSkillsDirs(pluginRoot, 5);
    for (const sd of skillsDirs) {
      for (const s of scanSkillsRoot(sd, `plugin:${plugin.name}`)) {
        push(s);
      }
    }
  }

  results.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  return results;
}

module.exports = { listClaudeSkills };
