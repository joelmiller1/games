// American checkers (English draughts) on an 8x8 board.
// Board squares are indexed r * 8 + c with row 0 at the top. Only dark squares ((r + c) odd) are used.
// Player 0 is Red: starts at the bottom, moves up and moves first. Player 1 is White.
// Piece codes: 0 empty, 1 red man, 2 red king, 3 white man, 4 white king.
import { check, clone } from '../lib/game.js';
import { pick, seeded, shuffle } from '../lib/rng.js';

const EMPTY = 0;
export const owner = (v) => (v - 1) >> 1;
export const isKing = (v) => v === 2 || v === 4;
const manOf = (p) => p * 2 + 1;
const kingOf = (p) => p * 2 + 2;
const forward = (p) => (p === 0 ? -1 : 1);
const kingRow = (p) => (p === 0 ? 0 : 7);
const DIAG = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];

export const isDark = (sq) => (((sq >> 3) + (sq & 7)) & 1) === 1;

/** Standard 1-32 checkers numbering (square 1 is nearest Red's right-hand side). */
export function squareNumber(sq) {
  const r = sq >> 3;
  const c = sq & 7;
  return 32 - (r * 4 + (c >> 1));
}

export function initialBoard() {
  const b = new Array(64).fill(EMPTY);
  for (let sq = 0; sq < 64; sq++) {
    if (!isDark(sq)) continue;
    const r = sq >> 3;
    if (r <= 2) b[sq] = manOf(1);
    else if (r >= 5) b[sq] = manOf(0);
  }
  return b;
}

function dirsFor(v) {
  if (isKing(v)) return DIAG;
  const f = forward(owner(v));
  return DIAG.filter(([dr]) => dr === f);
}

function jumpsFrom(board, start, v) {
  const out = [];
  const p = owner(v);
  const walk = (sq, path, caps) => {
    const r = sq >> 3;
    const c = sq & 7;
    let extended = false;
    for (const [dr, dc] of dirsFor(v)) {
      const mr = r + dr;
      const mc = c + dc;
      const lr = r + 2 * dr;
      const lc = c + 2 * dc;
      if (lr < 0 || lr > 7 || lc < 0 || lc > 7) continue;
      const mid = mr * 8 + mc;
      const land = lr * 8 + lc;
      const mv = board[mid];
      if (mv === EMPTY || owner(mv) === p || caps.includes(mid)) continue;
      if (board[land] !== EMPTY && land !== start) continue;
      extended = true;
      const nPath = path.concat(land);
      const nCaps = caps.concat(mid);
      if (!isKing(v) && lr === kingRow(p)) {
        // A man that reaches the king row is crowned and the move ends.
        out.push({ path: nPath, captures: nCaps });
      } else {
        walk(land, nPath, nCaps);
      }
    }
    if (!extended && caps.length) out.push({ path, captures: caps });
  };
  walk(start, [start], []);
  return out;
}

/** All legal moves for player p. Moves are { path: [from, ..., to], captures: [sq...] }. */
export function legalMoves(board, p, forcedCapture = true) {
  const jumps = [];
  const steps = [];
  for (let sq = 0; sq < 64; sq++) {
    const v = board[sq];
    if (v === EMPTY || owner(v) !== p) continue;
    jumps.push(...jumpsFrom(board, sq, v));
    const r = sq >> 3;
    const c = sq & 7;
    for (const [dr, dc] of dirsFor(v)) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr > 7 || nc < 0 || nc > 7) continue;
      const to = nr * 8 + nc;
      if (board[to] === EMPTY) steps.push({ path: [sq, to], captures: [] });
    }
  }
  if (forcedCapture) return jumps.length ? jumps : steps;
  return jumps.concat(steps);
}

export function applyMove(board, move) {
  const from = move.path[0];
  const to = move.path[move.path.length - 1];
  const v = board[from];
  board[from] = EMPTY;
  for (const c of move.captures) board[c] = EMPTY;
  const p = owner(v);
  board[to] = !isKing(v) && to >> 3 === kingRow(p) ? kingOf(p) : v;
}

const positionKey = (board, turn) => board.join('') + turn;

export function moveText(move) {
  const sep = move.captures.length ? 'x' : '-';
  return move.path.map(squareNumber).join(sep);
}

export function setup({ options }) {
  const board = initialBoard();
  return {
    board,
    turn: 0,
    forcedCapture: options?.forcedCapture !== false,
    quiet: 0, // plies since the last capture or man move
    keys: { [positionKey(board, 0)]: 1 },
    moves: [], // [{ p, path, captures, text }]
    last: null,
    winner: null,
    draw: false,
    endReason: null,
    drawOffer: null,
    offerAt: [-1, -1],
  };
}

const over = (s) => s.winner !== null || s.draw;

export function actors(s) {
  if (over(s)) return [];
  // The player who received a draw offer may answer it even when it is not their turn.
  if (s.drawOffer !== null && s.drawOffer === s.turn) return [s.turn, 1 - s.turn];
  return [s.turn];
}

const samePath = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

export function act(state, player, action) {
  check(!over(state), 'The game is over');
  check(action && typeof action.type === 'string', 'Unknown action');
  if (action.type === 'offerDraw') {
    check(state.drawOffer === null, 'A draw offer is already pending');
    check(state.offerAt[player] !== state.moves.length, 'You already offered a draw this move');
    const s = clone(state);
    s.drawOffer = player;
    s.offerAt[player] = s.moves.length;
    return s;
  }
  if (action.type === 'acceptDraw' || action.type === 'declineDraw') {
    check(state.drawOffer === 1 - player, 'There is no draw offer to answer');
    const s = clone(state);
    s.drawOffer = null;
    if (action.type === 'acceptDraw') {
      s.draw = true;
      s.endReason = 'Draw agreed';
    }
    return s;
  }
  check(action.type === 'move', 'Unknown action');
  check(player === state.turn, 'It is not your turn');
  check(Array.isArray(action.path) && action.path.length >= 2, 'Invalid move');
  const legal = legalMoves(state.board, player, state.forcedCapture);
  const move = legal.find((m) => samePath(m.path, action.path));
  if (!move) {
    const prefix = legal.some((m) => m.path.length > action.path.length && samePath(m.path.slice(0, action.path.length), action.path));
    const mustJump = state.forcedCapture && legal.some((m) => m.captures.length);
    check(false, prefix ? 'You must complete the jump' : mustJump ? 'You must capture' : 'Illegal move');
  }
  const s = clone(state);
  const moverWasMan = !isKing(s.board[move.path[0]]);
  applyMove(s.board, move);
  const rec = { p: player, path: move.path, captures: move.captures, text: moveText(move) };
  s.moves.push(rec);
  s.last = rec;
  if (s.drawOffer === 1 - player) s.drawOffer = null; // moving declines a pending offer
  s.quiet = move.captures.length || moverWasMan ? 0 : s.quiet + 1;
  s.turn = 1 - player;
  const key = positionKey(s.board, s.turn);
  s.keys[key] = (s.keys[key] || 0) + 1;
  if (move.captures.length || moverWasMan) s.keys = { [key]: 1 }; // irreversible: earlier positions can't recur
  if (legalMoves(s.board, s.turn, s.forcedCapture).length === 0) {
    s.winner = player;
    const left = s.board.some((v) => v !== EMPTY && owner(v) === s.turn);
    s.endReason = left ? 'No legal moves left' : 'All pieces captured';
  } else if (s.quiet >= 80) {
    s.draw = true;
    s.endReason = '40 moves without progress';
  } else if (s.keys[key] >= 3) {
    s.draw = true;
    s.endReason = 'Threefold repetition';
  }
  return s;
}

export function forfeit(state, player, reason) {
  const s = clone(state);
  if (over(s)) return s;
  s.winner = 1 - player;
  s.endReason = reason;
  s.drawOffer = null;
  return s;
}

export function outcome(s) {
  if (s.winner !== null) return { winners: [s.winner], draw: false, reason: s.endReason };
  if (s.draw) return { winners: [], draw: true, reason: s.endReason };
  return null;
}

export function view(s, player) {
  const counts = [0, 0];
  const kings = [0, 0];
  for (const v of s.board) {
    if (v === EMPTY) continue;
    counts[owner(v)]++;
    if (isKing(v)) kings[owner(v)]++;
  }
  const mine = player === s.turn && !over(s);
  return {
    board: s.board,
    turn: s.turn,
    last: s.last,
    moves: s.moves.map((m) => m.text),
    legal: mine ? legalMoves(s.board, s.turn, s.forcedCapture).map((m) => ({ path: m.path, captures: m.captures })) : [],
    counts,
    kings,
    forcedCapture: s.forcedCapture,
    drawOffer: s.drawOffer,
    canOfferDraw: player !== null && player !== undefined && !over(s) && s.drawOffer === null && s.offerAt[player] !== s.moves.length,
    winner: s.winner,
    draw: s.draw,
  };
}

// ---------------------------------------------------------------------------
// AI: iterative-deepening alpha-beta.

const WIN = 100000;

// Positional weights for men by row advancement (from the owner's perspective, 0 = back row).
const ADVANCE = [6, 0, 2, 4, 7, 11, 16, 0];
const CENTER = new Int8Array(64);
for (let sq = 0; sq < 64; sq++) {
  const r = sq >> 3;
  const c = sq & 7;
  CENTER[sq] = r >= 2 && r <= 5 && c >= 2 && c <= 5 ? 1 : 0;
}

export function evaluate(board, p) {
  let mat = [0, 0];
  let pos = [0, 0];
  let pieces = 0;
  for (let sq = 0; sq < 64; sq++) {
    const v = board[sq];
    if (v === EMPTY) continue;
    pieces++;
    const o = owner(v);
    const r = sq >> 3;
    const c = sq & 7;
    if (isKing(v)) {
      mat[o] += 160;
      pos[o] += CENTER[sq] ? 10 : 0;
      if (c === 0 || c === 7) pos[o] -= 4;
    } else {
      mat[o] += 100;
      const adv = o === 0 ? 7 - r : r;
      pos[o] += ADVANCE[adv];
      if (CENTER[sq]) pos[o] += 3;
    }
  }
  let score = mat[p] - mat[1 - p] + pos[p] - pos[1 - p];
  // When ahead, trading down is good: scale the lead by how empty the board is.
  const lead = mat[p] - mat[1 - p];
  if (lead !== 0) score += Math.round((lead * (24 - pieces)) / 40);
  return score;
}

class Abort extends Error {}

const ZOB = (() => {
  const rng = seeded(0x5eed);
  const z = new Int32Array(64 * 5 * 2 + 2);
  for (let i = 0; i < z.length; i++) z[i] = (rng() * 4294967296) | 0;
  return z;
})();

function hashBoard(board, turn) {
  let h1 = turn ? ZOB[640] : 0;
  let h2 = turn ? ZOB[641] : 0;
  for (let sq = 0; sq < 64; sq++) {
    const v = board[sq];
    if (v) {
      h1 ^= ZOB[(sq * 5 + v) * 2];
      h2 ^= ZOB[(sq * 5 + v) * 2 + 1];
    }
  }
  return [h1, h2];
}

class Search {
  constructor(board, forcedCapture, deadline, history) {
    this.board = Int8Array.from(board);
    this.forced = forcedCapture;
    this.deadline = deadline;
    this.nodes = 0;
    this.tt = new Map();
    this.history = history; // position keys seen in the game (for repetition avoidance)
  }

  make(m) {
    const b = this.board;
    const from = m.path[0];
    const to = m.path[m.path.length - 1];
    const v = b[from];
    const caps = m.captures.map((c) => b[c]);
    applyMove(b, m);
    return { from, to, v, caps };
  }

  unmake(m, u) {
    const b = this.board;
    b[u.to] = EMPTY;
    b[u.from] = u.v;
    m.captures.forEach((c, i) => (b[c] = u.caps[i]));
  }

  negamax(p, depth, alpha, beta, ply) {
    this.nodes++;
    if ((this.nodes & 1023) === 0 && Date.now() > this.deadline) throw new Abort();
    const moves = legalMoves(this.board, p, this.forced);
    if (moves.length === 0) return -WIN + ply;
    const capturing = moves[0].captures.length > 0;
    // Keep searching while captures are pending so we never stop mid-exchange.
    if (depth <= 0 && (!capturing || depth < -6)) return evaluate(this.board, p);

    const [h1, h2] = hashBoard(this.board, p);
    const key = h1 + ':' + h2;
    const hit = this.tt.get(key);
    let first = null;
    if (hit) {
      if (hit.depth >= depth) {
        if (hit.flag === 0) return hit.score;
        if (hit.flag === 1 && hit.score >= beta) return hit.score;
        if (hit.flag === 2 && hit.score <= alpha) return hit.score;
      }
      first = hit.move;
    }
    if (first !== null) {
      const i = moves.findIndex((m) => m.path.join() === first);
      if (i > 0) moves.unshift(moves.splice(i, 1)[0]);
    }
    const a0 = alpha;
    let best = -Infinity;
    let bestMove = null;
    for (const m of moves) {
      const u = this.make(m);
      const score = -this.negamax(1 - p, depth - 1, -beta, -alpha, ply + 1);
      this.unmake(m, u);
      if (score > best) {
        best = score;
        bestMove = m.path.join();
      }
      if (score > alpha) alpha = score;
      if (alpha >= beta) break;
    }
    if (this.tt.size > 400000) this.tt.clear();
    this.tt.set(key, { depth, score: best, flag: best <= a0 ? 2 : best >= beta ? 1 : 0, move: bestMove });
    return best;
  }

  rootScores(p, depth) {
    const moves = legalMoves(this.board, p, this.forced);
    return moves.map((m) => ({ move: m, score: this.rootMove(p, m, depth, -WIN * 2, WIN * 2) }));
  }

  rootMove(p, m, depth, alpha, beta) {
    const u = this.make(m);
    let score = -this.negamax(1 - p, depth - 1, -beta, -alpha, 1);
    // Never walk into a repetition draw unless we are losing anyway.
    if (this.history) {
      const key = positionKey(Array.from(this.board), 1 - p);
      if (this.history[key] >= 2) score = Math.min(score, 0);
    }
    this.unmake(m, u);
    return score;
  }

  // Alpha-beta at the root; returns the best move of `moves` (searched in order).
  rootSearch(p, moves, depth) {
    let alpha = -WIN * 2;
    let best = moves[0];
    let bestScore = -Infinity;
    for (const m of moves) {
      const score = this.rootMove(p, m, depth, alpha, WIN * 2);
      if (score > bestScore) {
        bestScore = score;
        best = m;
      }
      if (score > alpha) alpha = score;
    }
    return { best, bestScore };
  }
}

export function bot(s, p, level, ctx) {
  const rng = ctx.rng;
  if (s.drawOffer === 1 - p) return { type: botAcceptsDraw(s, p) ? 'acceptDraw' : 'declineDraw' };
  const moves = legalMoves(s.board, p, s.forcedCapture);
  if (moves.length === 1) return { type: 'move', path: moves[0].path };
  const move = (m) => ({ type: 'move', path: m.path });
  const now = Date.now();

  if (level === 'easy') {
    if (rng() < 0.35) return move(pick(rng, moves));
    const srch = new Search(s.board, s.forcedCapture, now + 2000, s.keys);
    const scored = srch.rootScores(p, 2).map((x) => ({ ...x, score: x.score + (rng() - 0.5) * 120 }));
    scored.sort((a, b) => b.score - a.score);
    return move(scored[0].move);
  }
  if (level === 'medium') {
    const srch = new Search(s.board, s.forcedCapture, now + 3000, s.keys);
    const scored = srch.rootScores(p, 4).map((x) => ({ ...x, score: x.score + (rng() - 0.5) * 30 }));
    scored.sort((a, b) => b.score - a.score);
    return move(scored[0].move);
  }
  const budget = Math.max(300, Math.min(4000, (ctx.deadline || now + 1200) - now));
  const deadline = now + budget;
  const srch = new Search(s.board, s.forcedCapture, deadline, s.keys);
  let order = shuffle(rng, moves); // random tie-breaks between equally good moves
  let best = order[0];
  for (let depth = 2; depth <= 40; depth += 1) {
    try {
      const r = srch.rootSearch(p, order, depth);
      best = r.best;
      order = [best, ...order.filter((m) => m !== best)];
      if (Math.abs(r.bestScore) > WIN - 200) break;
    } catch (e) {
      if (e instanceof Abort) break;
      throw e;
    }
    if (Date.now() > now + budget / 2) break; // the next iteration would not finish in time
  }
  return move(best);
}

/** Whether the computer (as player p) is happy to accept a draw here. */
export function botAcceptsDraw(s, p) {
  const score = evaluate(s.board, p);
  return score < -60 || (Math.abs(score) < 25 && s.moves.length > 60);
}
