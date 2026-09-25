// Chess search: iterative deepening PVS/alpha-beta with a transposition table,
// quiescence search, null-move pruning, late move reductions, killer and history heuristics.
import {
  Position, START_FEN, F_CAPTURE, F_EP, KING, PAWN, QUEEN, VALUE_MG,
  moveFrom, moveTo, movePromo,
} from './position.js';

const INF = 1000000;
export const MATE = 100000;
const MAX_PLY = 64;
const MATE_BOUND = MATE - 1000;

const TT_BITS = 19;
const TT_SIZE = 1 << TT_BITS;
const TT_MASK = TT_SIZE - 1;
const EXACT = 1;
const LOWER = 2;
const UPPER = 3;

let tt = null;
function table() {
  if (!tt) {
    tt = {
      check: new Int32Array(TT_SIZE),
      move: new Int32Array(TT_SIZE),
      score: new Int32Array(TT_SIZE),
      depth: new Int8Array(TT_SIZE),
      flag: new Int8Array(TT_SIZE),
    };
  }
  return tt;
}

class Stop extends Error {}

export class Searcher {
  constructor(pos, { deadline = Infinity, maxNodes = Infinity } = {}) {
    this.pos = pos;
    this.deadline = deadline;
    this.maxNodes = maxNodes;
    this.nodes = 0;
    this.tt = table();
    this.moves = new Int32Array(MAX_PLY * 256);
    this.scores = new Int32Array(MAX_PLY * 256);
    this.killers = new Int32Array(MAX_PLY * 2);
    this.history = new Int32Array(16 * 128);
    this.rootBest = 0;
    this.rootPly = pos.ply;
  }

  /** Undo any moves left on the board when a search is interrupted. */
  unwind() {
    while (this.pos.ply > this.rootPly) this.pos.unmake();
  }

  checkTime() {
    if ((++this.nodes & 1023) === 0 && (Date.now() > this.deadline || this.nodes > this.maxNodes)) throw new Stop();
  }

  scoreMoves(base, n, ttMove, ply) {
    const b = this.pos.board;
    const k1 = this.killers[ply * 2];
    const k2 = this.killers[ply * 2 + 1];
    for (let i = base; i < base + n; i++) {
      const m = this.moves[i];
      let s;
      if (m === ttMove) s = 20000000;
      else if (m & F_CAPTURE) {
        const victim = m & F_EP ? PAWN : b[moveTo(m)] & 7;
        const attacker = b[moveFrom(m)] & 7;
        s = 10000000 + VALUE_MG[victim] * 10 - attacker;
      } else if (movePromo(m)) s = 9000000 + movePromo(m);
      else if (m === k1) s = 8000000;
      else if (m === k2) s = 7900000;
      else s = this.history[b[moveFrom(m)] * 128 + moveTo(m)];
      this.scores[i] = s;
    }
  }

  pickNext(i, end) {
    let best = i;
    for (let j = i + 1; j < end; j++) if (this.scores[j] > this.scores[best]) best = j;
    if (best !== i) {
      const m = this.moves[i];
      this.moves[i] = this.moves[best];
      this.moves[best] = m;
      const s = this.scores[i];
      this.scores[i] = this.scores[best];
      this.scores[best] = s;
    }
    return this.moves[i];
  }

  quiesce(alpha, beta, ply) {
    this.checkTime();
    const pos = this.pos;
    const stand = pos.evaluate();
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    if (ply >= MAX_PLY - 1) return stand;
    const base = ply * 256;
    const n = pos.generate(this.moves, base, true) - base;
    this.scoreMoves(base, n, 0, ply);
    let best = stand;
    for (let i = base; i < base + n; i++) {
      const m = this.pickNext(i, base + n);
      // Delta pruning: skip captures that cannot raise alpha even with a margin.
      if (!movePromo(m)) {
        const victim = m & F_EP ? PAWN : pos.board[moveTo(m)] & 7;
        if (stand + VALUE_MG[victim] + 200 < alpha) continue;
      }
      if (!pos.make(m)) continue;
      const score = -this.quiesce(-beta, -alpha, ply + 1);
      pos.unmake();
      if (score > best) best = score;
      if (score > alpha) {
        alpha = score;
        if (alpha >= beta) break;
      }
    }
    return best;
  }

  search(depth, alpha, beta, ply, allowNull) {
    const pos = this.pos;
    const pv = beta - alpha > 1;
    if (ply > 0) {
      this.checkTime();
      if (pos.halfmove >= 100 || pos.isRepetition() || pos.insufficientMaterial()) return 0;
      // Mate distance pruning
      alpha = Math.max(alpha, -MATE + ply);
      beta = Math.min(beta, MATE - ply - 1);
      if (alpha >= beta) return alpha;
    }
    const inCheck = pos.inCheck();
    if (inCheck) depth++;
    if (depth <= 0) return this.quiesce(alpha, beta, ply);
    if (ply >= MAX_PLY - 1) return pos.evaluate();

    const t = this.tt;
    const idx = pos.hashLo & TT_MASK;
    let ttMove = 0;
    if (t.check[idx] === pos.hashHi) {
      ttMove = t.move[idx];
      if (!pv && t.depth[idx] >= depth && ply > 0) {
        let s = t.score[idx];
        if (s > MATE_BOUND) s -= ply;
        else if (s < -MATE_BOUND) s += ply;
        const f = t.flag[idx];
        if (f === EXACT || (f === LOWER && s >= beta) || (f === UPPER && s <= alpha)) return s;
      }
    }

    // Null move pruning
    const us = pos.side;
    if (allowNull && !pv && !inCheck && depth >= 3 && ply > 0 && Math.abs(beta) < MATE_BOUND) {
      const nonPawn = pos.counts[us | 2] + pos.counts[us | 3] + pos.counts[us | 4] + pos.counts[us | 5];
      if (nonPawn > 0 && pos.evaluate() >= beta) {
        const r = depth > 6 ? 3 : 2;
        pos.makeNull();
        const score = -this.search(depth - 1 - r, -beta, -beta + 1, ply + 1, false);
        pos.unmakeNull();
        if (score >= beta) return beta;
      }
    }

    const base = ply * 256;
    const n = pos.generate(this.moves, base, false) - base;
    this.scoreMoves(base, n, ttMove, ply);
    const alpha0 = alpha;
    let best = -INF;
    let bestMove = 0;
    let legal = 0;
    for (let i = base; i < base + n; i++) {
      const m = this.pickNext(i, base + n);
      if (!pos.make(m)) continue;
      legal++;
      const quiet = !(m & F_CAPTURE) && !movePromo(m);
      const givesCheck = pos.inCheck();
      let score;
      if (legal === 1) {
        score = -this.search(depth - 1, -beta, -alpha, ply + 1, true);
      } else {
        // Late move reductions for quiet moves searched after the good ones.
        let r = 0;
        if (depth >= 3 && quiet && !inCheck && !givesCheck && legal > 3) r = legal > 8 ? 2 : 1;
        score = -this.search(depth - 1 - r, -alpha - 1, -alpha, ply + 1, true);
        if (score > alpha && r > 0) score = -this.search(depth - 1, -alpha - 1, -alpha, ply + 1, true);
        if (score > alpha && score < beta) score = -this.search(depth - 1, -beta, -alpha, ply + 1, true);
      }
      pos.unmake();
      if (score > best) {
        best = score;
        bestMove = m;
        if (ply === 0) this.rootBest = m;
        if (score > alpha) {
          alpha = score;
          if (alpha >= beta) {
            if (quiet) {
              if (this.killers[ply * 2] !== m) {
                this.killers[ply * 2 + 1] = this.killers[ply * 2];
                this.killers[ply * 2] = m;
              }
              const h = pos.board[moveFrom(m)] * 128 + moveTo(m);
              this.history[h] = Math.min(this.history[h] + depth * depth, 7000000);
            }
            break;
          }
        }
      }
    }
    if (legal === 0) return inCheck ? -MATE + ply : 0;

    let stored = best;
    if (stored > MATE_BOUND) stored += ply;
    else if (stored < -MATE_BOUND) stored -= ply;
    t.check[idx] = pos.hashHi;
    t.move[idx] = bestMove;
    t.score[idx] = stored;
    t.depth[idx] = depth;
    t.flag[idx] = best <= alpha0 ? UPPER : best >= beta ? LOWER : EXACT;
    return best;
  }

  /** Iterative deepening. Returns { move, score, depth }. */
  think(maxDepth = 64) {
    let result = { move: 0, score: 0, depth: 0 };
    const legal = this.pos.legalMoves();
    if (legal.length === 0) return result;
    result.move = legal[0];
    if (legal.length === 1) return result;
    for (let depth = 1; depth <= maxDepth; depth++) {
      try {
        this.rootBest = 0;
        const score = this.search(depth, -INF, INF, 0, false);
        if (this.rootBest) result = { move: this.rootBest, score, depth };
        if (Math.abs(score) > MATE_BOUND && depth > 2) break;
      } catch (e) {
        if (!(e instanceof Stop)) throw e;
        this.unwind();
        break;
      }
      if (Date.now() > this.deadline) break;
    }
    return result;
  }

  /** Scores every root move with a full window (for weaker, noisier play). */
  rootScores(depth) {
    const pos = this.pos;
    const out = [];
    for (const m of pos.legalMoves()) {
      pos.make(m);
      const score = -this.search(depth - 1, -INF, INF, 1, true);
      pos.unmake();
      out.push({ move: m, score });
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
// Tiny opening book for variety: common main lines in UCI notation.

const BOOK_LINES = [
  'e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6 e1g1 f8e7 f1e1 b7b5 a4b3 d7d6',
  'e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 c2c3 g8f6 d2d3 d7d6',
  'e2e4 e7e5 g1f3 b8c6 d2d4 e5d4 f3d4 g8f6 d4c6 b7c6',
  'e2e4 e7e5 g1f3 g8f6 f3e5 d7d6 e5f3 f6e4 d2d4 d6d5',
  'e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 a7a6',
  'e2e4 c7c5 g1f3 b8c6 d2d4 c5d4 f3d4 g8f6 b1c3 e7e5',
  'e2e4 c7c5 g1f3 e7e6 d2d4 c5d4 f3d4 b8c6 b1c3 d8c7',
  'e2e4 c7c5 b1c3 b8c6 g2g3 g7g6 f1g2 f8g7 d2d3 d7d6',
  'e2e4 e7e6 d2d4 d7d5 b1c3 g8f6 c1g5 f8e7 e4e5 f6d7',
  'e2e4 c7c6 d2d4 d7d5 b1c3 d5e4 c3e4 c8f5 e4g3 f5g6',
  'e2e4 d7d5 e4d5 d8d5 b1c3 d5a5 d2d4 g8f6 g1f3 c8f5',
  'e2e4 g8f6 e4e5 f6d5 d2d4 d7d6 g1f3 c8g4',
  'd2d4 d7d5 c2c4 e7e6 b1c3 g8f6 c1g5 f8e7 e2e3 e8g8 g1f3 b8d7',
  'd2d4 d7d5 c2c4 c7c6 g1f3 g8f6 b1c3 d5c4 a2a4 c8f5',
  'd2d4 d7d5 c2c4 d5c4 g1f3 g8f6 e2e3 e7e6 f1c4 c7c5',
  'd2d4 g8f6 c2c4 e7e6 b1c3 f8b4 e2e3 e8g8 f1d3 d7d5',
  'd2d4 g8f6 c2c4 g7g6 b1c3 f8g7 e2e4 d7d6 g1f3 e8g8 f1e2 e7e5',
  'd2d4 g8f6 c2c4 e7e6 g1f3 b7b6 g2g3 c8b7 f1g2 f8e7',
  'd2d4 g8f6 g1f3 e7e6 c1f4 c7c5 e2e3 b8c6',
  'd2d4 d7d5 g1f3 g8f6 c1f4 c7c5 e2e3 b8c6',
  'c2c4 e7e5 b1c3 g8f6 g1f3 b8c6 g2g3 d7d5 c4d5 f6d5',
  'c2c4 g8f6 b1c3 e7e6 e2e4 d7d5 e4e5 d5d4',
  'g1f3 d7d5 g2g3 g8f6 f1g2 e7e6 e1g1 f8e7 d2d3 e8g8',
  'g1f3 g8f6 c2c4 g7g6 b1c3 f8g7 e2e4 d7d6 d2d4 e8g8',
];

let book = null;
function openingBook() {
  if (book) return book;
  book = new Map();
  for (const line of BOOK_LINES) {
    const pos = new Position(START_FEN);
    for (const uci of line.split(' ')) {
      const key = pos.positionKey();
      const m = pos.parseUci(uci);
      if (!m) break;
      if (!book.has(key)) book.set(key, new Set());
      book.get(key).add(uci);
      pos.make(m);
    }
  }
  return book;
}

export function bookMove(pos, rng) {
  const set = openingBook().get(pos.positionKey());
  if (!set) return null;
  const list = [...set];
  return list[Math.floor(rng() * list.length)];
}

const LEVELS = {
  easy: { depth: 1, noise: 180, blunder: 0.12, book: false },
  medium: { depth: 3, noise: 35, blunder: 0.02, book: true },
  hard: { depth: 64, noise: 0, blunder: 0, book: true },
};

/**
 * Pick a move for the side to move in `pos` (a Position with game history replayed so repetitions are known).
 * Returns a UCI string.
 */
export function chooseMove(pos, level, { rng = Math.random, deadline } = {}) {
  const cfg = LEVELS[level] || LEVELS.medium;
  const legal = pos.legalMoves();
  if (!legal.length) return null;
  if (cfg.book && pos.fullmove <= 12) {
    const b = bookMove(pos, rng);
    if (b) return b;
  }
  if (rng() < cfg.blunder) return pos.moveToUci(legal[Math.floor(rng() * legal.length)]);
  if (level === 'hard') {
    const budget = deadline ? Math.max(200, deadline - Date.now()) : 1500;
    const s = new Searcher(pos, { deadline: Date.now() + budget });
    const r = s.think(cfg.depth);
    return pos.moveToUci(r.move || legal[0]);
  }
  const s = new Searcher(pos, { deadline: Date.now() + 5000 });
  let scored;
  try {
    scored = s.rootScores(cfg.depth);
  } catch (e) {
    s.unwind();
    scored = legal.map((m) => ({ move: m, score: 0 }));
  }
  for (const x of scored) x.score += (rng() - 0.5) * 2 * cfg.noise;
  scored.sort((a, b) => b.score - a.score);
  return pos.moveToUci(scored[0].move);
}

/** Search score (centipawns, side to move's perspective) after a short search. */
export function quickScore(pos, depth = 3) {
  const s = new Searcher(pos, { deadline: Date.now() + 1000 });
  try {
    return s.search(depth, -INF, INF, 0, false);
  } catch (e) {
    s.unwind();
    return pos.evaluate();
  }
}

export { KING, QUEEN };
