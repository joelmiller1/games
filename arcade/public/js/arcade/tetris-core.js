// Tetris rules, independent of the screen: guideline rotation (SRS) with wall kicks, 7-piece bag,
// hold, ghost, lock delay, T-spins, combos and back-to-back bonuses.
import { seeded } from './rng.js';

export const COLS = 10;
export const ROWS = 22; // two hidden rows on top
export const HIDDEN = 2;
export const TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

// Spawn orientation of each piece inside its bounding box ([x, y], y down).
const SHAPES = {
  I: { n: 4, cells: [[0, 1], [1, 1], [2, 1], [3, 1]] },
  O: { n: 2, cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
  T: { n: 3, cells: [[1, 0], [0, 1], [1, 1], [2, 1]] },
  S: { n: 3, cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
  Z: { n: 3, cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
  J: { n: 3, cells: [[0, 0], [0, 1], [1, 1], [2, 1]] },
  L: { n: 3, cells: [[2, 0], [0, 1], [1, 1], [2, 1]] },
};

/** CELLS[type][rot] = the four [x, y] cells for rotation state 0 (spawn), 1 (R), 2, 3 (L). */
export const CELLS = {};
for (const t of TYPES) {
  const { n, cells } = SHAPES[t];
  const rots = [cells];
  for (let r = 1; r < 4; r++) rots.push(rots[r - 1].map(([x, y]) => [n - 1 - y, x]));
  CELLS[t] = rots;
}

// SRS kicks as [dx, dy] with y pointing up (as published), converted below to y-down.
const KICKS_JLSTZ = {
  '0>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '1>0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '1>2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '2>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '2>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '3>2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '3>0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '0>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};
const KICKS_I = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '1>0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  '2>1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '3>2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '0>3': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
};

const LINE_POINTS = [0, 100, 300, 500, 800];
const TSPIN_POINTS = [400, 800, 1200, 1600];
const TSPIN_MINI_POINTS = [100, 200, 400];
const CLEAR_DELAY = 0.22; // seconds the cleared rows flash before collapsing
const LOCK_DELAY = 0.5;
const MAX_RESETS = 15;

/** Seconds per row at a level (guideline formula). */
export function gravity(level) {
  return Math.pow(0.8 - (level - 1) * 0.007, level - 1);
}

export class Tetris {
  constructor({ seed = 1, startLevel = 1 } = {}) {
    this.rng = seeded(seed);
    this.startLevel = startLevel;
    this.board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    this.bag = [];
    this.queue = [];
    this.hold = null;
    this.holdUsed = false;
    this.score = 0;
    this.lines = 0;
    this.level = startLevel;
    this.combo = -1;
    this.b2b = false;
    this.over = false;
    this.piece = null;
    this.clearing = null; // { rows, t }
    this.fall = 0;
    this.lockTimer = 0;
    this.resets = 0;
    this.lowest = 0;
    this.lastRotate = false;
    this.lastKick = 0;
    this.events = [];
    this.refill();
    this.spawn();
  }

  refill() {
    while (this.queue.length < 7) {
      if (!this.bag.length) {
        this.bag = TYPES.slice();
        for (let i = this.bag.length - 1; i > 0; i--) {
          const j = Math.floor(this.rng() * (i + 1));
          [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
        }
      }
      this.queue.push(this.bag.shift());
    }
  }

  emit(type, extra = {}) {
    this.events.push({ type, ...extra });
  }

  /** Events since the last call (sounds and effects for the screen). */
  drain() {
    const e = this.events;
    this.events = [];
    return e;
  }

  cells(p = this.piece) {
    return CELLS[p.type][p.rot].map(([x, y]) => [p.x + x, p.y + y]);
  }

  fits(p) {
    for (const [x, y] of this.cells(p)) {
      if (x < 0 || x >= COLS || y >= ROWS) return false;
      if (y >= 0 && this.board[y][x]) return false;
    }
    return true;
  }

  spawn(type = null) {
    if (!type) {
      type = this.queue.shift();
      this.refill();
    }
    const n = SHAPES[type].n;
    const p = { type, rot: 0, x: Math.floor((COLS - n) / 2), y: 0 };
    if (type === 'O') p.x = 4;
    this.piece = p;
    this.fall = 0;
    this.lockTimer = 0;
    this.resets = 0;
    this.lastRotate = false;
    if (!this.fits(p)) {
      this.piece = null;
      this.gameOver();
      return;
    }
    // Drop straight into view when there is room (guideline behaviour).
    const down = { ...p, y: p.y + 1 };
    if (this.fits(down)) this.piece = down;
    this.lowest = this.piece.y;
  }

  gameOver() {
    this.over = true;
    this.emit('gameover');
  }

  grounded() {
    return !this.fits({ ...this.piece, y: this.piece.y + 1 });
  }

  /** A successful move or rotation on the ground buys more time, up to a limit. */
  touchedLock() {
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
    this.lastRotate = false;
    this.touchedLock();
    this.emit('move');
    return true;
  }

  rotate(dir) {
    if (!this.piece || this.over || this.piece.type === 'O') return false;
    const from = this.piece.rot;
    const to = (from + (dir > 0 ? 1 : 3)) % 4;
    const table = this.piece.type === 'I' ? KICKS_I : KICKS_JLSTZ;
    const kicks = table[`${from}>${to}`];
    for (let k = 0; k < kicks.length; k++) {
      const [dx, dyUp] = kicks[k];
      const p = { ...this.piece, rot: to, x: this.piece.x + dx, y: this.piece.y - dyUp };
      if (this.fits(p)) {
        this.piece = p;
        this.lastRotate = true;
        this.lastKick = k;
        if (p.y > this.lowest) {
          this.lowest = p.y;
          this.resets = 0;
        }
        this.touchedLock();
        this.emit('rotate');
        return true;
      }
    }
    return false;
  }

  /** One row down; returns false on the ground. */
  stepDown() {
    const p = { ...this.piece, y: this.piece.y + 1 };
    if (!this.fits(p)) return false;
    this.piece = p;
    this.lastRotate = false;
    if (p.y > this.lowest) {
      this.lowest = p.y;
      this.resets = 0;
      this.lockTimer = 0;
    }
    return true;
  }

  hardDrop() {
    if (!this.piece || this.over) return;
    let rows = 0;
    const start = this.cells();
    while (this.stepDown()) rows++;
    this.score += rows * 2;
    this.emit('harddrop', { rows, from: start, to: this.cells() });
    this.lock();
  }

  holdPiece() {
    if (!this.piece || this.over || this.holdUsed) return false;
    const current = this.piece.type;
    const swap = this.hold;
    this.hold = current;
    this.holdUsed = true;
    this.emit('hold');
    this.spawn(swap);
    this.holdUsed = true;
    return true;
  }

  ghost() {
    if (!this.piece) return null;
    let p = this.piece;
    while (this.fits({ ...p, y: p.y + 1 })) p = { ...p, y: p.y + 1 };
    return p;
  }

  tSpin() {
    const p = this.piece;
    if (p.type !== 'T' || !this.lastRotate) return null;
    const corner = (x, y) => {
      const bx = p.x + x;
      const by = p.y + y;
      return bx < 0 || bx >= COLS || by >= ROWS || (by >= 0 && !!this.board[by][bx]);
    };
    const corners = [corner(0, 0), corner(2, 0), corner(2, 2), corner(0, 2)];
    if (corners.filter(Boolean).length < 3) return null;
    // The two corners either side of the T's point.
    const front = [[0, 1], [1, 2], [2, 3], [3, 0]][p.rot];
    const full = corners[front[0]] && corners[front[1]];
    return full || this.lastKick === 4 ? 'full' : 'mini';
  }

  lock() {
    const spin = this.tSpin();
    let lockedAbove = true;
    for (const [x, y] of this.cells()) {
      if (y >= 0) this.board[y][x] = this.piece.type;
      if (y >= HIDDEN) lockedAbove = false;
    }
    const type = this.piece.type;
    this.piece = null;
    this.holdUsed = false;
    const rows = [];
    for (let y = 0; y < ROWS; y++) if (this.board[y].every(Boolean)) rows.push(y);
    this.emit('lock', { piece: type });
    this.award(rows.length, spin);
    if (lockedAbove && !rows.length) {
      this.gameOver();
      return;
    }
    if (rows.length) this.clearing = { rows, t: CLEAR_DELAY };
    else this.spawn();
  }

  award(n, spin) {
    const level = this.level;
    let points = 0;
    let label = '';
    let hard = false;
    if (spin === 'full') {
      points = TSPIN_POINTS[n];
      label = `T-spin${n ? ` ${['', 'single', 'double', 'triple'][n]}` : ''}`;
      hard = n > 0;
    } else if (spin === 'mini') {
      points = TSPIN_MINI_POINTS[Math.min(n, 2)];
      label = `T-spin mini${n ? ` ${['', 'single', 'double'][n]}` : ''}`;
      hard = n > 0;
    } else if (n) {
      points = LINE_POINTS[n];
      label = ['', 'Single', 'Double', 'Triple', 'Tetris'][n];
      hard = n === 4;
    }
    let b2b = false;
    if (n) {
      if (hard && this.b2b) {
        points = Math.floor(points * 1.5);
        b2b = true;
      }
      this.b2b = hard;
      this.combo++;
    } else this.combo = -1;
    points *= level;
    if (this.combo > 0) points += 50 * this.combo * level;
    this.score += points;
    if (n || spin) this.emit('clear', { lines: n, spin, label, b2b, combo: Math.max(0, this.combo), points });
  }

  collapse() {
    const rows = this.clearing.rows;
    this.board = this.board.filter((_, y) => !rows.includes(y));
    while (this.board.length < ROWS) this.board.unshift(Array(COLS).fill(null));
    const before = this.level;
    this.lines += rows.length;
    this.level = this.startLevel + Math.floor(this.lines / 10);
    if (this.level > before) this.emit('levelup', { level: this.level });
    this.clearing = null;
    this.spawn();
  }

  /**
   * Advance time. soft: soft drop held (20x gravity, 1 point per row).
   */
  update(dt, soft = false) {
    if (this.over) return;
    if (this.clearing) {
      this.clearing.t -= dt;
      if (this.clearing.t <= 0) this.collapse();
      return;
    }
    if (!this.piece) return;
    const perRow = gravity(this.level);
    const rate = soft ? Math.max(20 / perRow, 25) : 1 / perRow;
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
    } else this.lockTimer = 0;
  }
}
