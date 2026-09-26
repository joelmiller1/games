// Bejeweled-style match-three rules, independent of the screen.
// Swap two neighbouring gems to line up three or more of a colour. Matched gems vanish, the ones
// above fall and new gems drop in, which can set off cascades. Four in a row makes a flame gem
// (explodes 3×3), an L or T shape makes a star gem (clears its row and column) and five in a row
// makes a hypercube (swap it with a gem to clear every gem of that colour).
// Every move returns a list of steps so the screen can animate exactly what happened.
import { seeded } from './rng.js';

export const SIZE = 8;
export const COLORS = 7;
const N = SIZE * SIZE;

export const rowOf = (i) => Math.floor(i / SIZE);
export const colOf = (i) => i % SIZE;
export const adjacent = (a, b) => Math.abs(rowOf(a) - rowOf(b)) + Math.abs(colOf(a) - colOf(b)) === 1;

function groupPoints(g) {
  if (g.kind === 'cube') return 250 + 50 * (g.size - 5);
  if (g.kind === 'star') return 150 + 20 * Math.max(0, g.size - 5);
  if (g.kind === 'flame') return 100;
  return 50 + 20 * Math.max(0, g.size - 3);
}

export class Match3 {
  constructor({ seed = 1, mode = 'classic' } = {}) {
    this.rng = seeded(seed);
    this.mode = mode;
    this.nextId = 1;
    this.score = 0;
    this.level = 1;
    this.progress = 0; // points towards the next level
    this.moves = 0;
    this.bestCascade = 0;
    this.over = false;
    this.board = [];
    this.fill();
  }

  gem(color, special = null) {
    return { id: this.nextId++, color, special };
  }

  randomColor() {
    return Math.floor(this.rng() * COLORS);
  }

  /** Points needed to finish the current level. */
  goal() {
    return 1000 + 500 * (this.level - 1);
  }

  /** A fresh board with no ready-made matches and at least one move. */
  fill() {
    for (let attempt = 0; attempt < 200; attempt++) {
      const b = [];
      for (let i = 0; i < N; i++) {
        const r = rowOf(i);
        const c = colOf(i);
        let color;
        do color = this.randomColor();
        while ((c >= 2 && b[i - 1].color === color && b[i - 2].color === color) || (r >= 2 && b[i - SIZE].color === color && b[i - 2 * SIZE].color === color));
        b.push(this.gem(color));
      }
      this.board = b;
      if (this.hasMoves()) return;
    }
  }

  colorAt(i) {
    const g = this.board[i];
    return g && g.color !== null && g.special !== 'cube' ? g.color : -1;
  }

  /** Straight lines of three or more gems of one colour. */
  runs() {
    const out = [];
    for (let line = 0; line < SIZE; line++) {
      for (const dir of ['h', 'v']) {
        const at = (k) => (dir === 'h' ? line * SIZE + k : k * SIZE + line);
        let start = 0;
        for (let k = 1; k <= SIZE; k++) {
          const color = this.colorAt(at(start));
          if (k < SIZE && color >= 0 && this.colorAt(at(k)) === color) continue;
          if (color >= 0 && k - start >= 3) out.push({ dir, color, cells: Array.from({ length: k - start }, (_, j) => at(start + j)) });
          start = k;
        }
      }
    }
    return out;
  }

  /** Runs that touch are one group (an L, T or cross). Each group knows which special gem it earns. */
  groups() {
    const runs = this.runs();
    const parent = runs.map((_, k) => k);
    const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
    const owner = new Map();
    runs.forEach((run, k) =>
      run.cells.forEach((cell) => {
        if (owner.has(cell)) parent[find(k)] = find(owner.get(cell));
        else owner.set(cell, k);
      }),
    );
    const byRoot = new Map();
    runs.forEach((run, k) => {
      const root = find(k);
      if (!byRoot.has(root)) byRoot.set(root, []);
      byRoot.get(root).push(run);
    });
    return [...byRoot.values()].map((rs) => {
      const cells = [...new Set(rs.flatMap((r) => r.cells))];
      const longest = rs.reduce((a, r) => (r.cells.length > a.cells.length ? r : a));
      const hs = rs.filter((r) => r.dir === 'h');
      const vs = rs.filter((r) => r.dir === 'v');
      let crossing = null;
      for (const hr of hs) for (const vr of vs) for (const c of hr.cells) if (vr.cells.includes(c)) crossing = c;
      const kind = longest.cells.length >= 5 ? 'cube' : crossing !== null ? 'star' : longest.cells.length === 4 ? 'flame' : null;
      return { cells, color: rs[0].color, kind, size: cells.length, crossing, middle: longest.cells[Math.floor(longest.cells.length / 2)] };
    });
  }

  /** Would the gem at i be part of a line of three? */
  makesRun(i) {
    const color = this.colorAt(i);
    if (color < 0) return false;
    const r = rowOf(i);
    const c = colOf(i);
    const same = (rr, cc) => rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE && this.colorAt(rr * SIZE + cc) === color;
    let h = 1;
    for (let k = c - 1; same(r, k); k--) h++;
    for (let k = c + 1; same(r, k); k++) h++;
    let v = 1;
    for (let k = r - 1; same(k, c); k--) v++;
    for (let k = r + 1; same(k, c); k++) v++;
    return h >= 3 || v >= 3;
  }

  /** Every swap that makes a match (hypercube swaps not included). */
  findMoves(limit = Infinity) {
    const out = [];
    const b = this.board;
    for (let i = 0; i < N; i++) {
      for (const j of [i + 1, i + SIZE]) {
        if (j >= N || (j === i + 1 && colOf(i) === SIZE - 1)) continue;
        [b[i], b[j]] = [b[j], b[i]];
        const ok = this.makesRun(i) || this.makesRun(j);
        [b[i], b[j]] = [b[j], b[i]];
        if (ok) {
          out.push([i, j]);
          if (out.length >= limit) return out;
        }
      }
    }
    return out;
  }

  hasMoves() {
    return this.board.some((g) => g?.special === 'cube') || this.findMoves(1).length > 0;
  }

  /** A move to suggest (not taken from the game's random numbers, so hints never change the game). */
  hint() {
    const moves = this.findMoves();
    if (moves.length) return moves[Math.floor(Math.random() * moves.length)];
    const cube = this.board.findIndex((g) => g?.special === 'cube');
    if (cube < 0) return null;
    return [cube, colOf(cube) < SIZE - 1 ? cube + 1 : cube - 1];
  }

  mostCommonColor() {
    const counts = Array(COLORS).fill(0);
    for (let i = 0; i < N; i++) if (this.colorAt(i) >= 0) counts[this.colorAt(i)]++;
    return counts.indexOf(Math.max(...counts));
  }

  /** Cells hit by a special gem going off at `cell`. */
  blastCells(cell, kind) {
    const r = rowOf(cell);
    const c = colOf(cell);
    const out = [];
    if (kind === 'flame') {
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (r + dr >= 0 && r + dr < SIZE && c + dc >= 0 && c + dc < SIZE) out.push((r + dr) * SIZE + c + dc);
    } else if (kind === 'star') {
      for (let k = 0; k < SIZE; k++) out.push(r * SIZE + k, k * SIZE + c);
    } else if (kind === 'cube') {
      const color = this.mostCommonColor();
      for (let i = 0; i < N; i++) if (this.colorAt(i) === color) out.push(i);
    }
    return out;
  }

  /**
   * Swap two neighbouring gems. Returns { valid, steps } (null if the swap is not allowed at all).
   * Steps: swap, swapback, cube, clear, fall, level, shuffle, over.
   */
  swap(a, b) {
    if (this.over || !adjacent(a, b) || !this.board[a] || !this.board[b]) return null;
    const A = this.board[a];
    const B = this.board[b];
    const steps = [{ type: 'swap', a, b, ids: [A.id, B.id] }];
    this.board[a] = B;
    this.board[b] = A;
    let forced = null;
    if (A.special === 'cube' || B.special === 'cube') {
      // The hypercube takes every gem of the colour it was swapped with (two cubes: the lot).
      const cubeCell = A.special === 'cube' ? b : a;
      const other = A.special === 'cube' ? B : A;
      forced = [cubeCell];
      if (other.special === 'cube') {
        for (let i = 0; i < N; i++) forced.push(i);
        other.special = 'spent';
      } else for (let i = 0; i < N; i++) if (this.colorAt(i) === other.color) forced.push(i);
      this.board[cubeCell].special = 'spent';
      steps.push({ type: 'cube', cell: cubeCell, color: other.color, cells: [...new Set(forced)] });
    } else if (!this.groups().length) {
      this.board[a] = A;
      this.board[b] = B;
      steps.push({ type: 'swapback', a, b, ids: [A.id, B.id] });
      return { valid: false, steps };
    }
    this.moves++;
    this.cascade(steps, [a, b], forced);
    if (!this.hasMoves()) {
      if (this.mode === 'blitz') {
        this.shuffle();
        steps.push({ type: 'shuffle', gems: this.board.map((g, i) => ({ id: g.id, to: i, color: g.color, special: g.special })) });
      } else {
        this.over = true;
        steps.push({ type: 'over' });
      }
    }
    return { valid: true, steps };
  }

  cascade(steps, moved, forced) {
    let n = 0;
    for (;;) {
      const groups = this.groups();
      if (!groups.length && !forced) break;
      n++;
      const clear = new Set(forced || []);
      const matched = new Set();
      const created = [];
      let base = 0;
      for (const g of groups) {
        for (const c of g.cells) {
          clear.add(c);
          matched.add(c);
        }
        base += groupPoints(g);
        if (g.kind) {
          const mine = n === 1 ? moved.find((m) => g.cells.includes(m)) : undefined;
          const cell = mine ?? (g.kind === 'star' ? g.crossing : g.middle);
          created.push({ cell, color: g.kind === 'cube' ? null : g.color, special: g.kind });
        }
      }
      // Special gems caught up in it go off too, and can set each other off.
      const blasts = [];
      const queue = [...clear];
      const fired = new Set();
      while (queue.length) {
        const cell = queue.pop();
        const gem = this.board[cell];
        if (!gem || fired.has(cell) || !['flame', 'star', 'cube'].includes(gem.special)) continue;
        fired.add(cell);
        const hit = this.blastCells(cell, gem.special);
        blasts.push({ cell, kind: gem.special, color: gem.color, cells: hit });
        for (const x of hit) {
          if (!clear.has(x)) {
            clear.add(x);
            queue.push(x);
          }
        }
      }
      const anchors = new Set(created.map((c) => c.cell));
      const gone = [...clear].filter((c) => !anchors.has(c) && this.board[c]);
      base += gone.filter((c) => !matched.has(c)).length * 20;
      const points = base * n * this.level;
      this.score += points;
      this.progress += base * n;
      this.bestCascade = Math.max(this.bestCascade, n);
      const ids = gone.map((c) => this.board[c].id);
      for (const c of gone) this.board[c] = null;
      const made = created.map(({ cell, color, special }) => {
        const replaced = this.board[cell]?.id ?? null;
        const g = this.gem(color, special);
        this.board[cell] = g;
        return { cell, id: g.id, color, special, replaced };
      });
      steps.push({
        type: 'clear',
        cascade: n,
        points,
        score: this.score,
        progress: this.progress,
        goal: this.goal(),
        cells: gone,
        ids,
        created: made,
        blasts,
        groups: groups.map((g) => ({ cells: g.cells, kind: g.kind, color: g.color })),
      });
      steps.push(this.gravity());
      while (this.progress >= this.goal()) {
        this.progress -= this.goal();
        this.level++;
        steps.push({ type: 'level', level: this.level, progress: this.progress, goal: this.goal() });
      }
      forced = null;
    }
    return n;
  }

  /** Let gems fall into the gaps and drop new ones in from the top. */
  gravity() {
    const moves = [];
    const spawns = [];
    for (let c = 0; c < SIZE; c++) {
      let write = SIZE - 1;
      for (let r = SIZE - 1; r >= 0; r--) {
        const i = r * SIZE + c;
        const g = this.board[i];
        if (!g) continue;
        const to = write * SIZE + c;
        if (to !== i) {
          this.board[to] = g;
          this.board[i] = null;
          moves.push({ id: g.id, from: i, to });
        }
        write--;
      }
      for (let r = write, k = 1; r >= 0; r--, k++) {
        const g = this.gem(this.randomColor());
        const to = r * SIZE + c;
        this.board[to] = g;
        spawns.push({ id: g.id, color: g.color, to, fromRow: -k });
      }
    }
    return { type: 'fall', moves, spawns };
  }

  /** Mix the gems up until the board has a move and no ready-made matches. */
  shuffle() {
    const gems = this.board.slice();
    for (let t = 0; t < 300; t++) {
      for (let i = gems.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        [gems[i], gems[j]] = [gems[j], gems[i]];
      }
      this.board = gems.slice();
      if (!this.groups().length && this.hasMoves()) return;
    }
    this.fill();
  }
}
