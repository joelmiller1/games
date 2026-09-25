// 2048 rules, independent of the screen. Tiles keep an id across moves so the screen can slide them.
import { seeded } from './rng.js';

const DIRS = ['left', 'right', 'up', 'down'];

export class Game2048 {
  constructor({ seed = 1, size = 4 } = {}) {
    this.rng = seeded(seed);
    this.size = size;
    this.cells = Array(size * size).fill(null); // { id, value } or null
    this.nextId = 1;
    this.score = 0;
    this.best = 0;
    this.moves = 0;
    this.won = false;
    this.over = false;
    this.spawn();
    this.spawn();
  }

  /** A new 2 (90%) or 4 in a random empty square. */
  spawn() {
    const empty = [];
    this.cells.forEach((t, i) => t || empty.push(i));
    if (!empty.length) return null;
    const i = empty[Math.floor(this.rng() * empty.length)];
    const tile = { id: this.nextId++, value: this.rng() < 0.9 ? 2 : 4 };
    this.cells[i] = tile;
    this.best = Math.max(this.best, tile.value);
    return { ...tile, i };
  }

  /** The squares of each row or column, starting from the edge the tiles slide towards. */
  lines(dir) {
    const n = this.size;
    const out = [];
    for (let k = 0; k < n; k++) {
      const line = [];
      for (let j = 0; j < n; j++) {
        if (dir === 'left') line.push(k * n + j);
        else if (dir === 'right') line.push(k * n + (n - 1 - j));
        else if (dir === 'up') line.push(j * n + k);
        else line.push((n - 1 - j) * n + k);
      }
      out.push(line);
    }
    return out;
  }

  /**
   * Slide every tile in a direction. Returns null when nothing can move that way, otherwise
   * { moves: [{ id, from, to }], merged: [{ id, value, i, from: [a, b] }], spawned, gained }.
   */
  move(dir) {
    if (this.over || !DIRS.includes(dir)) return null;
    const next = Array(this.cells.length).fill(null);
    const moves = [];
    const merged = [];
    let gained = 0;
    let changed = false;
    for (const line of this.lines(dir)) {
      const tiles = line.map((i) => (this.cells[i] ? { ...this.cells[i], i } : null)).filter(Boolean);
      let slot = 0;
      for (let t = 0; t < tiles.length; t++) {
        const a = tiles[t];
        const b = tiles[t + 1];
        const dest = line[slot++];
        if (b && b.value === a.value) {
          const tile = { id: this.nextId++, value: a.value * 2 };
          next[dest] = tile;
          moves.push({ id: a.id, from: a.i, to: dest }, { id: b.id, from: b.i, to: dest });
          merged.push({ ...tile, i: dest, from: [a.id, b.id] });
          gained += tile.value;
          changed = true;
          t++;
        } else {
          next[dest] = { id: a.id, value: a.value };
          moves.push({ id: a.id, from: a.i, to: dest });
          if (a.i !== dest) changed = true;
        }
      }
    }
    if (!changed) return null;
    this.cells = next;
    this.score += gained;
    this.moves++;
    for (const m of merged) this.best = Math.max(this.best, m.value);
    const spawned = this.spawn();
    let justWon = false;
    if (!this.won && this.best >= 2048) {
      this.won = true;
      justWon = true;
    }
    if (!this.canMove()) this.over = true;
    return { moves, merged, spawned, gained, justWon };
  }

  canMove() {
    const n = this.size;
    for (let i = 0; i < this.cells.length; i++) {
      const t = this.cells[i];
      if (!t) return true;
      const r = Math.floor(i / n);
      const c = i % n;
      if (c + 1 < n && this.cells[i + 1]?.value === t.value) return true;
      if (r + 1 < n && this.cells[i + n]?.value === t.value) return true;
    }
    return false;
  }

  /** Tiles as { id, value, i } for drawing. */
  tiles() {
    const out = [];
    this.cells.forEach((t, i) => t && out.push({ ...t, i }));
    return out;
  }
}
