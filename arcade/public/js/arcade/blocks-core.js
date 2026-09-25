// Falling Blocks rules (in the style of Columns), independent of the screen.
// A column of three jewels falls into a 6-wide well. Cycle their order, steer it, and line up
// three or more of one colour across, down or diagonally to clear them. Jewels above then fall,
// which can set off chain reactions worth more and more.
import { seeded } from './rng.js';

export const COLS = 6;
export const HIDDEN = 3; // rows above the top of the well where new pieces appear
export const ROWS = 13 + HIDDEN;
export const COLORS = 6;
const LOCK_DELAY = 0.45;
const MAX_RESETS = 10;
const CLEAR_TIME = 0.42;
const SETTLE_TIME = 0.16;
const JEWELS_PER_LEVEL = 30;

/** Rows per second at a level. */
export function fallRate(level) {
  return Math.min(20, 1.1 * Math.pow(1.2, level - 1));
}

export class FallingBlocks {
  constructor({ seed = 1, startLevel = 1 } = {}) {
    this.rng = seeded(seed);
    this.board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    this.startLevel = startLevel;
    this.level = startLevel;
    this.score = 0;
    this.jewels = 0;
    this.over = false;
    this.piece = null;
    this.next = this.randomTrio();
    this.fall = 0;
    this.lockTimer = 0;
    this.resets = 0;
    this.chain = 0;
    this.phase = 'falling'; // 'falling' | 'clearing' | 'settling'
    this.phaseTimer = 0;
    this.matched = [];
    this.events = [];
    this.spawn();
  }

  emit(type, extra = {}) {
    this.events.push({ type, ...extra });
  }

  drain() {
    const e = this.events;
    this.events = [];
    return e;
  }

  randomTrio() {
    return [0, 1, 2].map(() => Math.floor(this.rng() * COLORS));
  }

  /** Cells of the falling piece, top jewel first: [x, y, colour]. */
  cells(p = this.piece) {
    return p.jewels.map((c, k) => [p.x, p.y - 2 + k, c]);
  }

  fits(p) {
    for (const [x, y] of this.cells(p)) {
      if (x < 0 || x >= COLS || y >= ROWS) return false;
      if (y >= 0 && this.board[y][x] !== null) return false;
    }
    return true;
  }

  spawn() {
    // The bottom jewel appears in the top row of the well; the other two are still above it.
    const p = { x: 2, y: HIDDEN, jewels: this.next };
    this.next = this.randomTrio();
    this.fall = 0;
    this.lockTimer = 0;
    this.resets = 0;
    this.chain = 0;
    if (!this.fits(p)) {
      this.piece = null;
      this.gameOver();
      return;
    }
    this.piece = p;
    this.phase = 'falling';
  }

  gameOver() {
    this.over = true;
    this.emit('gameover');
  }

  grounded() {
    return !this.fits({ ...this.piece, y: this.piece.y + 1 });
  }

  touched() {
    if (this.piece && this.grounded() && this.resets < MAX_RESETS) {
      this.lockTimer = 0;
      this.resets++;
    }
  }

  move(dx) {
    if (!this.piece || this.over) return false;
    const p = { ...this.piece, x: this.piece.x + dx };
    if (!this.fits(p)) return false;
    this.piece = p;
    this.touched();
    this.emit('move');
    return true;
  }

  /** Cycle the three jewels: the bottom one goes to the top (or the other way round). */
  cycle(dir = 1) {
    if (!this.piece || this.over) return false;
    const [a, b, c] = this.piece.jewels;
    this.piece = { ...this.piece, jewels: dir > 0 ? [c, a, b] : [b, c, a] };
    this.touched();
    this.emit('cycle');
    return true;
  }

  stepDown() {
    const p = { ...this.piece, y: this.piece.y + 1 };
    if (!this.fits(p)) return false;
    this.piece = p;
    this.lockTimer = 0;
    return true;
  }

  hardDrop() {
    if (!this.piece || this.over) return;
    let rows = 0;
    while (this.stepDown()) rows++;
    this.score += rows * 2;
    this.emit('harddrop', { rows });
    this.lock();
  }

  ghost() {
    if (!this.piece) return null;
    let p = this.piece;
    while (this.fits({ ...p, y: p.y + 1 })) p = { ...p, y: p.y + 1 };
    return p;
  }

  lock() {
    for (const [x, y, c] of this.cells()) if (y >= 0) this.board[y][x] = c;
    this.piece = null;
    this.emit('lock');
    this.resolve();
  }

  /** Every jewel that is part of a line of three or more of one colour, in any of four directions. */
  findMatches() {
    const hit = new Set();
    const dirs = [
      [1, 0],
      [0, 1],
      [1, 1],
      [1, -1],
    ];
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const c = this.board[y][x];
        if (c === null) continue;
        for (const [dx, dy] of dirs) {
          // Only start a run at its first jewel.
          const px = x - dx;
          const py = y - dy;
          if (px >= 0 && px < COLS && py >= 0 && py < ROWS && this.board[py][px] === c) continue;
          const run = [];
          let cx = x;
          let cy = y;
          while (cx >= 0 && cx < COLS && cy >= 0 && cy < ROWS && this.board[cy][cx] === c) {
            run.push(cy * COLS + cx);
            cx += dx;
            cy += dy;
          }
          if (run.length >= 3) for (const k of run) hit.add(k);
        }
      }
    }
    return [...hit];
  }

  resolve() {
    const matched = this.findMatches();
    if (!matched.length) {
      // Nothing cleared: anything left above the well ends the game.
      if (this.board.slice(0, HIDDEN).some((row) => row.some((c) => c !== null))) this.gameOver();
      else this.spawn();
      return;
    }
    this.chain++;
    this.matched = matched;
    this.phase = 'clearing';
    this.phaseTimer = CLEAR_TIME;
    const points = matched.length * 10 * this.chain * this.level;
    this.score += points;
    this.emit('clear', { count: matched.length, chain: this.chain, points });
  }

  collapse() {
    for (const k of this.matched) this.board[Math.floor(k / COLS)][k % COLS] = null;
    this.jewels += this.matched.length;
    this.matched = [];
    for (let x = 0; x < COLS; x++) {
      let write = ROWS - 1;
      for (let y = ROWS - 1; y >= 0; y--) {
        const c = this.board[y][x];
        if (c === null) continue;
        this.board[y][x] = null;
        this.board[write--][x] = c;
      }
    }
    const level = this.startLevel + Math.floor(this.jewels / JEWELS_PER_LEVEL);
    if (level > this.level) {
      this.level = level;
      this.emit('levelup', { level });
    }
    this.phase = 'settling';
    this.phaseTimer = SETTLE_TIME;
  }

  update(dt, soft = false) {
    if (this.over) return;
    if (this.phase === 'clearing') {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) this.collapse();
      return;
    }
    if (this.phase === 'settling') {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) this.resolve();
      return;
    }
    if (!this.piece) return;
    const rate = soft ? Math.max(22, fallRate(this.level) * 6) : fallRate(this.level);
    this.fall += dt * rate;
    while (this.fall >= 1) {
      this.fall -= 1;
      if (this.stepDown()) {
        if (soft) this.score += 1;
      } else {
        this.fall = 0;
        break;
      }
    }
    if (this.grounded()) {
      this.lockTimer += dt;
      if (this.lockTimer >= LOCK_DELAY || this.resets >= MAX_RESETS) this.lock();
    }
  }
}
