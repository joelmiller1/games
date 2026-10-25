// Saves open tables to DATA_DIR so a restart (an upgrade, or a move to another node) doesn't end games.
// The hub hands over a plain JSON snapshot; this only reads and writes the file.
import fs from 'node:fs/promises';
import path from 'node:path';

const FILE = 'arcade-tables.json';

export class TableStore {
  constructor({ dir, enabled = true, log }) {
    this.file = dir ? path.join(dir, FILE) : null;
    this.enabled = enabled && !!this.file;
    this.log = log;
    this.last = null;
    this.saving = Promise.resolve();
  }

  async load() {
    if (!this.enabled) return null;
    try {
      const parsed = JSON.parse(await fs.readFile(this.file, 'utf8'));
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (e) {
      if (e.code !== 'ENOENT') this.log.warn(`Could not read ${this.file}: ${e.message}`);
      return null;
    }
  }

  /** Writes the snapshot unless it is unchanged since the last write. */
  save(snapshot) {
    if (!this.enabled) return Promise.resolve();
    const { savedAt, ...rest } = snapshot;
    const key = JSON.stringify(rest);
    if (key === this.last) return this.saving;
    this.last = key;
    const json = JSON.stringify(snapshot);
    this.saving = this.saving.then(async () => {
      const tmp = `${this.file}.${process.pid}.tmp`;
      try {
        // Player secrets are in here, so keep the file private to the arcade user.
        await fs.writeFile(tmp, json, { mode: 0o600 });
        await fs.rename(tmp, this.file);
      } catch (e) {
        this.log.warn(`Could not save ${this.file}: ${e.message}`);
      }
    });
    return this.saving;
  }
}
