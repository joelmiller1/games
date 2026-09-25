// Reversi (Othello rules). Player 0 is Black and moves first, player 1 is White.
// Board: 64 cells, index = row * 8 + col with row 0 at the top; -1 empty, 0 black, 1 white.
import { check, clone, isInt } from '../lib/game.js';
import { pick } from '../lib/rng.js';

const DIRS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1], [0, 1],
  [1, -1], [1, 0], [1, 1],
];

// RAYS[sq] = for each direction, the squares walking outwards from sq (shorter near the edges).
export const RAYS = Array.from({ length: 64 }, (_, sq) =>
  DIRS.map(([dr, dc]) => {
    const out = [];
    let r = (sq >> 3) + dr;
    let c = (sq & 7) + dc;
    while (r >= 0 && r < 8 && c >= 0 && c < 8) {
      out.push(r * 8 + c);
      r += dr;
      c += dc;
    }
    return out;
  }),
);

export const squareName = (sq) => 'abcdefgh'[sq & 7] + ((sq >> 3) + 1);

/** Squares flipped by `p` playing at `sq` (empty when the move is illegal). */
export function flipsFor(board, sq, p) {
  if (board[sq] !== -1) return [];
  const out = [];
  for (const ray of RAYS[sq]) {
    let k = 0;
    while (k < ray.length && board[ray[k]] === 1 - p) k++;
    if (k > 0 && k < ray.length && board[ray[k]] === p) for (let j = 0; j < k; j++) out.push(ray[j]);
  }
  return out;
}

export function legalMoves(board, p) {
  const out = [];
  for (let sq = 0; sq < 64; sq++) if (board[sq] === -1 && flipsFor(board, sq, p).length) out.push(sq);
  return out;
}

export function counts(board) {
  let b = 0;
  let w = 0;
  for (const x of board) {
    if (x === 0) b++;
    else if (x === 1) w++;
  }
  return [b, w];
}

export function setup() {
  const board = Array(64).fill(-1);
  board[27] = 1; // d4
  board[28] = 0; // e4
  board[35] = 0; // d5
  board[36] = 1; // e5
  return { board, turn: 0, last: null, passed: null, moves: [], winner: null, draw: false, endReason: null };
}

const over = (s) => s.winner !== null || s.draw;

export function actors(s) {
  return over(s) ? [] : [s.turn];
}

function finishByCount(s) {
  const [b, w] = counts(s.board);
  if (b === w) {
    s.draw = true;
    s.endReason = `${b}–${w}`;
  } else {
    s.winner = b > w ? 0 : 1;
    s.endReason = `${Math.max(b, w)}–${Math.min(b, w)}`;
  }
}

export function act(state, player, action) {
  check(!over(state), 'The game is over');
  check(player === state.turn, 'It is not your turn');
  check(action && action.type === 'place', 'Unknown action');
  check(isInt(action.sq, 0, 63), 'Invalid square');
  check(state.board[action.sq] === -1, 'That square is taken');
  const flips = flipsFor(state.board, action.sq, player);
  check(flips.length > 0, 'A move must flip at least one disc');
  const s = clone(state);
  s.board[action.sq] = player;
  for (const f of flips) s.board[f] = player;
  s.last = { sq: action.sq, flips, player };
  s.moves.push(squareName(action.sq));
  s.passed = null;
  const other = 1 - player;
  if (legalMoves(s.board, other).length) s.turn = other;
  else if (legalMoves(s.board, player).length) {
    s.turn = player;
    s.passed = other;
    s.moves.push('pass');
  } else finishByCount(s);
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
    board: s.board,
    turn: s.turn,
    legal: over(s) ? [] : legalMoves(s.board, s.turn),
    last: s.last,
    passed: s.passed,
    counts: counts(s.board),
    moves: s.moves,
    winner: s.winner,
    draw: s.draw,
  };
}

// ---------------------------------------------------------------------------
// Computer player: alpha-beta search on a mailbox board (1 = black, 2 = white, 0 = empty).

const WEIGHTS = [
  100, -25, 10, 5, 5, 10, -25, 100,
  -25, -45, -2, -2, -2, -2, -45, -25,
  10, -2, 2, 1, 1, 2, -2, 10,
  5, -2, 1, 0, 0, 1, -2, 5,
  5, -2, 1, 0, 0, 1, -2, 5,
  10, -2, 2, 1, 1, 2, -2, 10,
  -25, -45, -2, -2, -2, -2, -45, -25,
  100, -25, 10, 5, 5, 10, -25, 100,
];
const CORNERS = [0, 7, 56, 63];
// Squares next to each corner (C and X squares): risky only while the corner is empty.
const NEAR_CORNER = [
  [1, 8, 9],
  [6, 15, 14],
  [48, 57, 49],
  [55, 62, 54],
];
// Try likely-good squares first: corners, edges, then the rest; X squares last.
const ORDER = Array.from({ length: 64 }, (_, i) => i).sort((a, b) => WEIGHTS[b] - WEIGHTS[a]);

const RAY_START = new Int16Array(64 * 8);
const RAY_LEN = new Int8Array(64 * 8);
const RAY_SQ = [];
for (let sq = 0; sq < 64; sq++) {
  for (let d = 0; d < 8; d++) {
    RAY_START[sq * 8 + d] = RAY_SQ.length;
    RAY_LEN[sq * 8 + d] = RAYS[sq][d].length;
    RAY_SQ.push(...RAYS[sq][d]);
  }
}
const RAY = Int8Array.from(RAY_SQ);
const NEIGHBORS = Array.from({ length: 64 }, (_, sq) => RAYS[sq].filter((r) => r.length).map((r) => r[0]));

// Zobrist keys (two 32-bit halves), deterministic so every worker agrees.
const Z = new Int32Array(64 * 3 * 2 + 4);
{
  let x = 0x9e3779b9;
  for (let i = 0; i < Z.length; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    Z[i] = x;
  }
}
const TT_BITS = 18;
const TT_SIZE = 1 << TT_BITS;
const TT_MASK = TT_SIZE - 1;
const WIN = 100000;
const EXACT = 0;
const LOWER = 1;
const UPPER = 2;

class Abort extends Error {}

export class Searcher {
  constructor(board, toMove) {
    this.b = new Int8Array(64);
    this.h1 = 0;
    this.h2 = 0;
    this.empties = 0;
    for (let i = 0; i < 64; i++) {
      const v = board[i] === -1 ? 0 : board[i] + 1;
      this.b[i] = v;
      if (v) {
        this.h1 ^= Z[(i * 3 + v) * 2];
        this.h2 ^= Z[(i * 3 + v) * 2 + 1];
      } else this.empties++;
    }
    this.side = toMove + 1;
    this.stack = new Int8Array(64 * 64);
    this.sp = 0;
    this.moveBuf = Array.from({ length: 128 }, () => new Int8Array(64));
    this.ttKey = new Int32Array(TT_SIZE);
    this.ttCheck = new Int32Array(TT_SIZE);
    this.ttScore = new Int32Array(TT_SIZE);
    this.ttDepth = new Int8Array(TT_SIZE);
    this.ttFlag = new Int8Array(TT_SIZE);
    this.ttMove = new Int8Array(TT_SIZE).fill(-1);
    this.nodes = 0;
    this.deadline = Infinity;
    this.noise = null;
  }

  canPlay(sq, v) {
    const b = this.b;
    const o = 3 - v;
    const base = sq * 8;
    for (let d = 0; d < 8; d++) {
      const len = RAY_LEN[base + d];
      if (len < 2) continue;
      const k = RAY_START[base + d];
      if (b[RAY[k]] !== o) continue;
      for (let j = 1; j < len; j++) {
        const x = b[RAY[k + j]];
        if (x === o) continue;
        if (x === v) return true;
        break;
      }
    }
    return false;
  }

  genMoves(v, out) {
    const b = this.b;
    let n = 0;
    for (let i = 0; i < 64; i++) {
      const sq = ORDER[i];
      if (b[sq] === 0 && this.canPlay(sq, v)) out[n++] = sq;
    }
    return n;
  }

  countMoves(v) {
    const b = this.b;
    let n = 0;
    for (let sq = 0; sq < 64; sq++) if (b[sq] === 0 && this.canPlay(sq, v)) n++;
    return n;
  }

  toggle(sq, v) {
    this.h1 ^= Z[(sq * 3 + v) * 2];
    this.h2 ^= Z[(sq * 3 + v) * 2 + 1];
  }

  /** Plays sq for v and returns how many discs flipped (they are pushed on the undo stack). */
  make(sq, v) {
    const b = this.b;
    const o = 3 - v;
    const base = sq * 8;
    let flipped = 0;
    for (let d = 0; d < 8; d++) {
      const len = RAY_LEN[base + d];
      if (len < 2) continue;
      const k = RAY_START[base + d];
      let j = 0;
      while (j < len && b[RAY[k + j]] === o) j++;
      if (j === 0 || j === len || b[RAY[k + j]] !== v) continue;
      for (let t = 0; t < j; t++) {
        const f = RAY[k + t];
        b[f] = v;
        this.toggle(f, o);
        this.toggle(f, v);
        this.stack[this.sp++] = f;
      }
      flipped += j;
    }
    b[sq] = v;
    this.toggle(sq, v);
    this.empties--;
    return flipped;
  }

  unmake(sq, v, flipped) {
    const b = this.b;
    const o = 3 - v;
    for (let t = 0; t < flipped; t++) {
      const f = this.stack[--this.sp];
      b[f] = o;
      this.toggle(f, v);
      this.toggle(f, o);
    }
    b[sq] = 0;
    this.toggle(sq, v);
    this.empties++;
  }

  discDiff(v) {
    let d = 0;
    for (let i = 0; i < 64; i++) {
      const x = this.b[i];
      if (x === v) d++;
      else if (x) d--;
    }
    return d;
  }

  evaluate(v) {
    const b = this.b;
    const o = 3 - v;
    let pos = 0;
    for (let i = 0; i < 64; i++) {
      const x = b[i];
      if (x === v) pos += WEIGHTS[i];
      else if (x === o) pos -= WEIGHTS[i];
    }
    // Once a corner is taken its neighbours are no longer dangerous: undo their penalty.
    for (let c = 0; c < 4; c++) {
      if (!b[CORNERS[c]]) continue;
      for (const sq of NEAR_CORNER[c]) {
        const x = b[sq];
        if (x === v) pos -= WEIGHTS[sq] - 4;
        else if (x === o) pos += WEIGHTS[sq] - 4;
      }
    }
    // Frontier discs (next to an empty square) give the opponent moves.
    let frontier = 0;
    for (let i = 0; i < 64; i++) {
      const x = b[i];
      if (!x) continue;
      const nb = NEIGHBORS[i];
      for (let k = 0; k < nb.length; k++) {
        if (b[nb[k]] === 0) {
          frontier += x === v ? 1 : -1;
          break;
        }
      }
    }
    const mv = this.countMoves(v);
    const mo = this.countMoves(o);
    let score = pos + Math.round((60 * (mv - mo)) / (mv + mo + 2)) - 3 * frontier;
    if (this.empties < 12) score += (12 - this.empties) * this.discDiff(v);
    if (this.noise) score += this.noise();
    return score;
  }

  negamax(depth, alpha, beta, ply, passed) {
    this.nodes++;
    if ((this.nodes & 1023) === 0 && Date.now() > this.deadline) throw new Abort();
    const v = this.side;
    if (this.empties === 0) {
      const d = this.discDiff(v);
      return d > 0 ? WIN + d : d < 0 ? -WIN + d : 0;
    }
    if (depth <= 0) return this.evaluate(v);

    // The side to move is part of the position (passes can repeat a board with the other side to move).
    const k1 = v === 2 ? this.h1 ^ Z[Z.length - 2] : this.h1;
    const k2 = v === 2 ? this.h2 ^ Z[Z.length - 1] : this.h2;
    const idx = k1 & TT_MASK;
    let ttMove = -1;
    if (this.ttKey[idx] === k1 && this.ttCheck[idx] === k2) {
      ttMove = this.ttMove[idx];
      if (this.ttDepth[idx] >= depth) {
        const sc = this.ttScore[idx];
        const f = this.ttFlag[idx];
        if (f === EXACT) return sc;
        if (f === LOWER && sc >= beta) return sc;
        if (f === UPPER && sc <= alpha) return sc;
      }
    }

    const moves = this.moveBuf[ply];
    const n = this.genMoves(v, moves);
    if (n === 0) {
      if (passed) {
        const d = this.discDiff(v);
        return d > 0 ? WIN + d : d < 0 ? -WIN + d : 0;
      }
      // Pass: the opponent moves again from the same position (passes do not use up depth).
      this.side = 3 - v;
      try {
        return -this.negamax(depth, -beta, -alpha, ply + 1, true);
      } finally {
        this.side = v;
      }
    }
    if (ttMove >= 0) {
      for (let i = 1; i < n; i++) {
        if (moves[i] === ttMove) {
          moves[i] = moves[0];
          moves[0] = ttMove;
          break;
        }
      }
    }
    const alpha0 = alpha;
    let best = -Infinity;
    let bestMove = moves[0];
    for (let i = 0; i < n; i++) {
      const sq = moves[i];
      const f = this.make(sq, v);
      this.side = 3 - v;
      let sc;
      try {
        sc = -this.negamax(depth - 1, -beta, -alpha, ply + 1, false);
      } finally {
        this.side = v;
        this.unmake(sq, v, f);
      }
      if (sc > best) {
        best = sc;
        bestMove = sq;
      }
      if (sc > alpha) alpha = sc;
      if (alpha >= beta) break;
    }
    this.ttKey[idx] = k1;
    this.ttCheck[idx] = k2;
    this.ttScore[idx] = best;
    this.ttDepth[idx] = depth;
    this.ttMove[idx] = bestMove;
    this.ttFlag[idx] = best <= alpha0 ? UPPER : best >= beta ? LOWER : EXACT;
    return best;
  }

  /** Scores for every root move at a fixed depth (used by the weaker levels). */
  rootScores(depth) {
    const v = this.side;
    const moves = new Int8Array(64);
    const n = this.genMoves(v, moves);
    const out = [];
    for (let i = 0; i < n; i++) {
      const sq = moves[i];
      const f = this.make(sq, v);
      this.side = 3 - v;
      const sc = -this.negamax(depth - 1, -Infinity, Infinity, 1, false);
      this.side = v;
      this.unmake(sq, v, f);
      out.push({ sq, score: sc });
    }
    return out;
  }

  /** Iterative deepening under a deadline. Returns the best square. */
  think(maxDepth, deadline) {
    this.deadline = deadline;
    const v = this.side;
    const moves = new Int8Array(64);
    const n = this.genMoves(v, moves);
    if (n === 1) return moves[0];
    let best = moves[0];
    for (let depth = 1; depth <= maxDepth; depth++) {
      let alpha = -Infinity;
      let bestHere = best;
      try {
        // Search last iteration's best move first.
        const order = [best, ...Array.from(moves.subarray(0, n)).filter((m) => m !== best)];
        for (const sq of order) {
          const f = this.make(sq, v);
          this.side = 3 - v;
          let sc;
          try {
            sc = -this.negamax(depth - 1, -Infinity, -alpha, 1, false);
          } finally {
            this.side = v;
            this.unmake(sq, v, f);
          }
          if (sc > alpha) {
            alpha = sc;
            bestHere = sq;
          }
        }
      } catch (e) {
        if (e instanceof Abort) break;
        throw e;
      }
      best = bestHere;
      if (Math.abs(alpha) >= WIN || depth >= this.empties) break; // solved
    }
    return best;
  }
}

export function bot(s, p, level, ctx) {
  const rng = ctx.rng;
  const legal = legalMoves(s.board, p);
  const place = (sq) => ({ type: 'place', sq });
  if (legal.length === 1) return place(legal[0]);
  if (level === 'easy') {
    if (rng() < 0.25) return place(pick(rng, legal));
    // Greedy: likes corners and flipping lots of discs, with plenty of noise.
    let best = legal[0];
    let bestScore = -Infinity;
    for (const sq of legal) {
      const sc = WEIGHTS[sq] * 0.5 + flipsFor(s.board, sq, p).length * 3 + (rng() - 0.5) * 40;
      if (sc > bestScore) {
        bestScore = sc;
        best = sq;
      }
    }
    return place(best);
  }
  const srch = new Searcher(s.board, p);
  if (level === 'medium') {
    if (rng() < 0.05) return place(pick(rng, legal));
    srch.noise = () => (rng() - 0.5) * 16;
    const scores = srch.rootScores(3);
    scores.sort((a, b) => b.score - a.score);
    return place(scores[0].sq);
  }
  const budget = Math.max(250, Math.min(4000, (ctx.deadline || Date.now() + 1200) - Date.now()));
  return place(srch.think(64, Date.now() + budget));
}
