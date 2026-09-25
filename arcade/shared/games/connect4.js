// Connect 4 on the classic 7 x 6 board. Player 0 is Red and moves first, player 1 is Yellow.
import { check, clone, isInt } from '../lib/game.js';
import { pick, seeded } from '../lib/rng.js';

export const COLS = 7;
export const ROWS = 6;

export function setup() {
  return {
    cols: Array.from({ length: COLS }, () => []), // each column lists owners bottom-up
    turn: 0,
    last: null, // { col, row }
    winner: null,
    line: null, // [[col,row] x4]
    draw: false,
    moves: 0,
    endReason: null,
  };
}

const over = (s) => s.winner !== null || s.draw;

export function actors(s) {
  return over(s) ? [] : [s.turn];
}

export function act(state, player, action) {
  check(!over(state), 'The game is over');
  check(player === state.turn, 'It is not your turn');
  check(action && action.type === 'drop', 'Unknown action');
  check(isInt(action.col, 0, COLS - 1), 'Invalid column');
  check(state.cols[action.col].length < ROWS, 'That column is full');
  const s = clone(state);
  const col = action.col;
  const row = s.cols[col].length;
  s.cols[col].push(player);
  s.last = { col, row };
  s.moves++;
  const line = findLine(s.cols, col, row, player);
  if (line) {
    s.winner = player;
    s.line = line;
    s.endReason = 'Four in a row';
  } else if (s.moves === COLS * ROWS) {
    s.draw = true;
    s.endReason = 'The board is full';
  } else {
    s.turn = 1 - player;
  }
  return s;
}

export function forfeit(state, player, reason) {
  const s = clone(state);
  if (over(s)) return s;
  s.winner = 1 - player;
  s.endReason = reason;
  return s;
}

export function outcome(s) {
  if (s.winner !== null) return { winners: [s.winner], draw: false, reason: s.endReason };
  if (s.draw) return { winners: [], draw: true, reason: s.endReason };
  return null;
}

export function view(s) {
  return {
    cols: s.cols,
    turn: s.turn,
    last: s.last,
    line: s.line,
    winner: s.winner,
    draw: s.draw,
  };
}

const DIRS = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

function cellAt(cols, c, r) {
  if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return undefined;
  return cols[c][r];
}

export function findLine(cols, col, row, p) {
  for (const [dc, dr] of DIRS) {
    const line = [[col, row]];
    for (let k = 1; cellAt(cols, col + dc * k, row + dr * k) === p; k++) line.push([col + dc * k, row + dr * k]);
    for (let k = 1; cellAt(cols, col - dc * k, row - dr * k) === p; k++) line.unshift([col - dc * k, row - dr * k]);
    if (line.length >= 4) return line;
  }
  return null;
}

// ---------------------------------------------------------------------------
// AI: negamax + alpha-beta with a transposition table and a threat-aware evaluation.

const N = COLS * ROWS;
const ORDER = [3, 2, 4, 1, 5, 0, 6];
const WIN = 1000000;

// 69 windows of four cells, flattened. Index = c * ROWS + r.
const WINDOWS = (() => {
  const out = [];
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      for (const [dc, dr] of DIRS) {
        const ec = c + dc * 3;
        const er = r + dr * 3;
        if (ec < 0 || ec >= COLS || er < 0 || er >= ROWS) continue;
        for (let k = 0; k < 4; k++) out.push((c + dc * k) * ROWS + (r + dr * k));
      }
    }
  }
  return Int8Array.from(out);
})();
const NWIN = WINDOWS.length / 4;

const Z = (() => {
  const rng = seeded(0xc0ffee);
  const z = new Int32Array(N * 2 * 2);
  for (let i = 0; i < z.length; i++) z[i] = (rng() * 4294967296) | 0;
  return z;
})();

const TT_BITS = 18;
const TT_SIZE = 1 << TT_BITS;
const TT_MASK = TT_SIZE - 1;
const EXACT = 1;
const LOWER = 2;
const UPPER = 3;

class Abort extends Error {}

export class Searcher {
  constructor(cols, toMove) {
    this.b = new Int8Array(N); // 0 empty, 1 player0, 2 player1
    this.h = new Int8Array(COLS);
    this.count = 0;
    this.h1 = 0;
    this.h2 = 0;
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < cols[c].length; r++) this.place(c, cols[c][r] + 1);
    }
    this.side = toMove + 1;
    this.ttKey = new Int32Array(TT_SIZE);
    this.ttCheck = new Int32Array(TT_SIZE);
    this.ttScore = new Int32Array(TT_SIZE);
    this.ttDepth = new Int8Array(TT_SIZE);
    this.ttFlag = new Int8Array(TT_SIZE);
    this.ttMove = new Int8Array(TT_SIZE);
    this.nodes = 0;
    this.deadline = Infinity;
  }

  place(c, v) {
    const i = c * ROWS + this.h[c];
    this.b[i] = v;
    this.h[c]++;
    this.count++;
    this.h1 ^= Z[(i * 2 + (v - 1)) * 2];
    this.h2 ^= Z[(i * 2 + (v - 1)) * 2 + 1];
  }

  unplace(c) {
    this.h[c]--;
    const i = c * ROWS + this.h[c];
    const v = this.b[i];
    this.b[i] = 0;
    this.count--;
    this.h1 ^= Z[(i * 2 + (v - 1)) * 2];
    this.h2 ^= Z[(i * 2 + (v - 1)) * 2 + 1];
  }

  winsAt(c, r, v) {
    const b = this.b;
    for (let d = 0; d < 4; d++) {
      const dc = DIRS[d][0];
      const dr = DIRS[d][1];
      let n = 1;
      for (let k = 1; k < 4; k++) {
        const cc = c + dc * k;
        const rr = r + dr * k;
        if (cc < 0 || cc >= COLS || rr < 0 || rr >= ROWS || b[cc * ROWS + rr] !== v) break;
        n++;
      }
      for (let k = 1; k < 4; k++) {
        const cc = c - dc * k;
        const rr = r - dr * k;
        if (cc < 0 || cc >= COLS || rr < 0 || rr >= ROWS || b[cc * ROWS + rr] !== v) break;
        n++;
      }
      if (n >= 4) return true;
    }
    return false;
  }

  // Static evaluation from the perspective of v.
  evaluate(v) {
    const b = this.b;
    const h = this.h;
    let score = 0;
    for (let w = 0; w < NWIN; w++) {
      let mine = 0;
      let theirs = 0;
      let empty = -1;
      for (let k = 0; k < 4; k++) {
        const x = b[WINDOWS[w * 4 + k]];
        if (x === 0) empty = WINDOWS[w * 4 + k];
        else if (x === v) mine++;
        else theirs++;
      }
      if (mine && theirs) continue;
      if (mine === 3 || theirs === 3) {
        // A threat. Threats on the "right" row parity are what win endgames:
        // player one (v=1) wants odd rows (index even), player two even rows.
        const owner = mine ? v : 3 - v;
        const row = empty % ROWS;
        const col = (empty - row) / ROWS;
        let t = 12;
        if ((owner === 1 && row % 2 === 0) || (owner === 2 && row % 2 === 1)) t += 10;
        if (row === h[col]) t += 4; // immediately playable
        score += mine ? t : -t;
      } else if (mine === 2) score += 3;
      else if (theirs === 2) score -= 3;
      else if (mine === 1) score += 1;
      else if (theirs === 1) score -= 1;
    }
    // central column control
    for (let r = 0; r < ROWS; r++) {
      const x = b[3 * ROWS + r];
      if (x === v) score += 4;
      else if (x) score -= 4;
    }
    return score;
  }

  negamax(depth, alpha, beta, ply) {
    this.nodes++;
    if ((this.nodes & 2047) === 0 && Date.now() > this.deadline) throw new Abort();
    const v = this.side;
    if (this.count === N) return 0;
    // Win in one?
    for (let c = 0; c < COLS; c++) {
      if (this.h[c] < ROWS && this.winsAt(c, this.h[c], v)) return WIN - ply - 1;
    }
    if (depth <= 0) return this.evaluate(v);

    const idx = this.h1 & TT_MASK;
    let ttMove = -1;
    if (this.ttKey[idx] === this.h1 && this.ttCheck[idx] === this.h2) {
      ttMove = this.ttMove[idx];
      if (this.ttDepth[idx] >= depth) {
        const s = this.ttScore[idx];
        const f = this.ttFlag[idx];
        if (f === EXACT) return s;
        if (f === LOWER && s >= beta) return s;
        if (f === UPPER && s <= alpha) return s;
      }
    }

    // Moves that hand the opponent an immediate win (by playing under their threat) go last.
    const opp = 3 - v;
    const moves = [];
    const bad = [];
    if (ttMove >= 0 && this.h[ttMove] < ROWS) moves.push(ttMove);
    for (const c of ORDER) {
      if (this.h[c] >= ROWS || c === ttMove) continue;
      const r = this.h[c];
      if (r + 1 < ROWS && this.winsAt(c, r + 1, opp)) bad.push(c);
      else moves.push(c);
    }
    if (ttMove >= 0 && moves[0] === ttMove) {
      const r = this.h[ttMove];
      if (r + 1 < ROWS && this.winsAt(ttMove, r + 1, opp)) {
        moves.shift();
        bad.unshift(ttMove);
      }
    }
    const all = moves.concat(bad);

    const alpha0 = alpha;
    let best = -Infinity;
    let bestMove = all[0];
    for (const c of all) {
      this.place(c, v);
      this.side = opp;
      const score = -this.negamax(depth - 1, -beta, -alpha, ply + 1);
      this.side = v;
      this.unplace(c);
      if (score > best) {
        best = score;
        bestMove = c;
      }
      if (score > alpha) alpha = score;
      if (alpha >= beta) break;
    }
    this.ttKey[idx] = this.h1;
    this.ttCheck[idx] = this.h2;
    this.ttScore[idx] = best;
    this.ttDepth[idx] = depth;
    this.ttMove[idx] = bestMove;
    this.ttFlag[idx] = best <= alpha0 ? UPPER : best >= beta ? LOWER : EXACT;
    return best;
  }

  // Score every legal root move at a fixed depth (used for noisy lower levels).
  rootScores(depth) {
    const v = this.side;
    const out = [];
    for (const c of ORDER) {
      if (this.h[c] >= ROWS) continue;
      let score;
      if (this.winsAt(c, this.h[c], v)) score = WIN;
      else {
        this.place(c, v);
        this.side = 3 - v;
        score = -this.negamax(depth - 1, -Infinity, Infinity, 1);
        this.side = v;
        this.unplace(c);
      }
      out.push({ col: c, score });
    }
    return out;
  }

  // Iterative deepening under a deadline. Returns the best column.
  think(maxDepth, deadline, rng) {
    this.deadline = deadline;
    const v = this.side;
    const legal = ORDER.filter((c) => this.h[c] < ROWS);
    for (const c of legal) if (this.winsAt(c, this.h[c], v)) return c;
    let best = legal[0];
    for (let depth = 1; depth <= maxDepth && depth <= N - this.count; depth++) {
      try {
        let bestScore = -Infinity;
        let bestCols = [];
        for (const c of legal) {
          this.place(c, v);
          this.side = 3 - v;
          const score = -this.negamax(depth - 1, -Infinity, Infinity, 1);
          this.side = v;
          this.unplace(c);
          if (score > bestScore) {
            bestScore = score;
            bestCols = [c];
          } else if (score === bestScore) bestCols.push(c);
        }
        best = rng && bestCols.length > 1 ? pick(rng, bestCols) : bestCols[0];
        if (Math.abs(bestScore) > WIN - 100) break; // forced result found
      } catch (e) {
        if (e instanceof Abort) {
          // restore the board: unwinding through exceptions leaves pieces placed
          this.side = v;
          break;
        }
        throw e;
      }
    }
    return best;
  }
}

function cloneSearcherBoard(s) {
  // After an Abort the board may have extra discs; rebuild from the game state instead.
  return new Searcher(s.cols, s.turn);
}

export function bot(s, p, level, ctx) {
  const rng = ctx.rng;
  const legal = [];
  for (let c = 0; c < COLS; c++) if (s.cols[c].length < ROWS) legal.push(c);
  const drop = (col) => ({ type: 'drop', col });

  if (level === 'easy') {
    const srch = cloneSearcherBoard(s);
    if (rng() < 0.3) return drop(pick(rng, legal));
    const scores = srch.rootScores(2).map((m) => ({ ...m, score: m.score + (rng() - 0.5) * 40 }));
    scores.sort((a, b) => b.score - a.score);
    return drop(scores[0].col);
  }
  if (level === 'medium') {
    const srch = cloneSearcherBoard(s);
    if (rng() < 0.05) return drop(pick(rng, legal));
    const scores = srch.rootScores(5).map((m) => ({ ...m, score: m.score + (rng() - 0.5) * 16 }));
    scores.sort((a, b) => b.score - a.score);
    return drop(scores[0].col);
  }
  const budget = Math.max(200, Math.min(3000, (ctx.deadline || Date.now() + 900) - Date.now()));
  const srch = cloneSearcherBoard(s);
  const col = srch.think(42, Date.now() + budget, rng);
  return drop(col);
}
