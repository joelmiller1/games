// Tiny JSON persistence for high scores and win/loss records.
// Everything lives in one file in DATA_DIR (a PersistentVolume in Kubernetes).
import fs from 'node:fs/promises';
import path from 'node:path';

const FILE = 'arcade-data.json';
const MAX_SCORES = 25;
const MAX_RECORDS = 200;

export class Store {
  constructor({ dir, log }) {
    this.dir = dir;
    this.file = dir ? path.join(dir, FILE) : null;
    this.log = log;
    this.data = { version: 1, scores: {}, records: {} };
    this.timer = null;
    this.writable = !!dir;
    this.saving = Promise.resolve();
  }

  async load() {
    if (!this.file) return;
    try {
      await fs.mkdir(this.dir, { recursive: true });
      const raw = await fs.readFile(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        this.data.scores = parsed.scores && typeof parsed.scores === 'object' ? parsed.scores : {};
        this.data.records = parsed.records && typeof parsed.records === 'object' ? parsed.records : {};
      }
      this.log.info(`Loaded saved scores from ${this.file}`);
    } catch (e) {
      if (e.code !== 'ENOENT') this.log.warn(`Could not read ${this.file}: ${e.message}`);
    }
    try {
      const probe = path.join(this.dir, '.write-test');
      await fs.writeFile(probe, 'ok');
      await fs.rm(probe, { force: true });
    } catch (e) {
      this.writable = false;
      this.log.warn(`Data directory ${this.dir} is not writable (${e.code || e.message}); scores will not survive restarts`);
    }
  }

  /** Adds a score; returns its 1-based rank if it made the table, else null. */
  addScore(game, name, score, detail = null) {
    if (!Number.isFinite(score) || score <= 0) return null;
    const list = (this.data.scores[game] ||= []);
    const entry = { name, score, date: new Date().toISOString() };
    if (detail) entry.detail = detail;
    list.push(entry);
    list.sort((a, b) => b.score - a.score || a.date.localeCompare(b.date));
    list.length = Math.min(list.length, MAX_SCORES);
    const rank = list.indexOf(entry);
    this.scheduleSave();
    return rank >= 0 ? rank + 1 : null;
  }

  scores(game, limit = 10) {
    return (this.data.scores[game] || []).slice(0, limit);
  }

  recordResult(game, name, result) {
    const table = (this.data.records[game] ||= {});
    const key = name.toLowerCase();
    const rec = (table[key] ||= { name, wins: 0, losses: 0, draws: 0 });
    rec.name = name;
    if (result === 'win') rec.wins++;
    else if (result === 'loss') rec.losses++;
    else rec.draws++;
    rec.last = new Date().toISOString();
    const keys = Object.keys(table);
    if (keys.length > MAX_RECORDS) {
      keys.sort((a, b) => (table[a].last || '').localeCompare(table[b].last || ''));
      for (const k of keys.slice(0, keys.length - MAX_RECORDS)) delete table[k];
    }
    this.scheduleSave();
  }

  records(game, limit = 10) {
    return Object.values(this.data.records[game] || {})
      .sort((a, b) => b.wins - a.wins || a.losses - b.losses || b.draws - a.draws)
      .slice(0, limit)
      .map(({ name, wins, losses, draws }) => ({ name, wins, losses, draws }));
  }

  scheduleSave() {
    if (!this.writable || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, 1000);
    this.timer.unref?.();
  }

  flush() {
    if (!this.writable) return Promise.resolve();
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const json = JSON.stringify(this.data, null, 1);
    this.saving = this.saving.then(async () => {
      const tmp = `${this.file}.${process.pid}.tmp`;
      try {
        await fs.writeFile(tmp, json);
        await fs.rename(tmp, this.file);
      } catch (e) {
        this.log.warn(`Could not save ${this.file}: ${e.message}`);
      }
    });
    return this.saving;
  }
}
