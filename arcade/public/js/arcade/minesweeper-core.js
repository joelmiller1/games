// Minesweeper rules, independent of the screen. Mines are laid after the first click (which is
// always an opening), from the shared seed, so the same first click gives everyone the same field.
import { seeded } from './rng.js';

export const LEVELS = {
  beginner: { w: 9, h: 9, mines: 10 },
  intermediate: { w: 16, h: 16, mines: 40 },
  expert: { w: 30, h: 16, mines: 99 },
};

export class Minefield {
  constructor({ w, h, mines, seed = 1 }) {
    this.w = w;
    this.h = h;
    this.mines = mines;
    this.seed = seed;
    this.n = w * h;
    this.mine = new Uint8Array(this.n);
    this.count = new Uint8Array(this.n);
    this.open = new Uint8Array(this.n);
    this.flag = new Uint8Array(this.n);
    this.laid = false;
    this.opened = 0;
    this.flags = 0;
    this.lost = false;
    this.won = false;
    this.boom = -1;
  }

  idx(x, y) {
    return y * this.w + x;
  }

  neighbours(i) {
    const x = i % this.w;
    const y = (i - x) / this.w;
    const out = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < this.w && ny < this.h) out.push(ny * this.w + nx);
      }
    }
    return out;
  }

  /** Lay the mines, keeping the first click and its neighbours clear. */
  lay(first) {
    const rng = seeded((this.seed ^ Math.imul(first + 1, 0x9e3779b1)) >>> 0);
    const safe = new Set([first, ...this.neighbours(first)]);
    const spots = [];
    for (let i = 0; i < this.n; i++) if (!safe.has(i)) spots.push(i);
    // If the board is too small to keep the 3×3 clear, only the clicked square stays safe.
    if (spots.length < this.mines) {
      spots.length = 0;
      for (let i = 0; i < this.n; i++) if (i !== first) spots.push(i);
    }
    for (let k = 0; k < this.mines; k++) {
      const j = k + Math.floor(rng() * (spots.length - k));
      [spots[k], spots[j]] = [spots[j], spots[k]];
      this.mine[spots[k]] = 1;
    }
    for (let i = 0; i < this.n; i++) {
      let c = 0;
      for (const j of this.neighbours(i)) c += this.mine[j];
      this.count[i] = c;
    }
    this.laid = true;
  }

  get done() {
    return this.won || this.lost;
  }

  /** Percentage of safe squares uncovered. */
  progress() {
    return Math.floor((100 * this.opened) / (this.n - this.mines));
  }

  /** Uncover a square. Returns the squares opened (flood fill through zeros). */
  reveal(i) {
    if (this.done || this.open[i] || this.flag[i]) return [];
    if (!this.laid) this.lay(i);
    if (this.mine[i]) {
      this.open[i] = 1;
      this.lost = true;
      this.boom = i;
      return [i];
    }
    const out = [];
    const stack = [i];
    while (stack.length) {
      const j = stack.pop();
      if (this.open[j] || this.flag[j]) continue;
      this.open[j] = 1;
      this.opened++;
      out.push(j);
      if (this.count[j] === 0) for (const k of this.neighbours(j)) if (!this.open[k] && !this.mine[k]) stack.push(k);
    }
    if (this.opened === this.n - this.mines) {
      this.won = true;
      for (let k = 0; k < this.n; k++) {
        if (this.mine[k] && !this.flag[k]) {
          this.flag[k] = 1;
          this.flags++;
        }
      }
    }
    return out;
  }

  toggleFlag(i) {
    if (this.done || this.open[i]) return false;
    this.flag[i] ^= 1;
    this.flags += this.flag[i] ? 1 : -1;
    return true;
  }

  /** Clicking an uncovered number whose mines are all flagged opens its other neighbours. */
  chord(i) {
    if (this.done || !this.open[i] || !this.count[i]) return [];
    const nb = this.neighbours(i);
    const flagged = nb.filter((j) => this.flag[j]).length;
    if (flagged !== this.count[i]) return [];
    const out = [];
    for (const j of nb) {
      if (!this.open[j] && !this.flag[j]) {
        out.push(...this.reveal(j));
        if (this.lost) break;
      }
    }
    return out;
  }
}
