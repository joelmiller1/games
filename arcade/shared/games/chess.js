// Chess game adapter: White is player 0, Black is player 1.
import { check, clone } from '../lib/game.js';
import {
  Position, START_FEN, BLACK, WHITE, MAX_HISTORY, KING, pieceChar, sqName, parseSq, moveFrom, moveTo,
} from '../chess/position.js';
import { chooseMove, quickScore } from '../chess/search.js';

export function parseClock(opt) {
  if (!opt || opt === 'none') return null;
  const m = /^(\d+)\+(\d+)$/.exec(opt);
  if (!m) return null;
  return { base: Number(m[1]) * 1000, inc: Number(m[2]) * 1000 };
}

export function setup({ options }) {
  const pos = new Position(START_FEN);
  const c = parseClock(options?.clock);
  return {
    startFen: START_FEN,
    fen: pos.fen(),
    turn: 0,
    uci: [],
    san: [],
    keys: { [pos.positionKey()]: 1 },
    last: null,
    result: null, // { winner: 0 | 1 | null, reason }
    drawOffer: null,
    offerAt: [-1, -1],
    clock: c ? { base: c.base, inc: c.inc, remaining: [c.base, c.base], turnStart: null } : null,
  };
}

/** Rebuild the position with full history so repetitions are visible to the search. */
export function replay(s) {
  if (s.uci.length > MAX_HISTORY - 300) return new Position(s.fen);
  const pos = new Position(s.startFen);
  for (const u of s.uci) pos.make(pos.parseUci(u));
  return pos;
}

export function actors(s) {
  if (s.result) return [];
  if (s.drawOffer !== null && s.drawOffer === s.turn) return [s.turn, 1 - s.turn];
  return [s.turn];
}

function finish(s, winner, reason) {
  s.result = { winner, reason };
  s.drawOffer = null;
  if (s.clock) s.clock.turnStart = null;
  return s;
}

function flagFall(s, p) {
  s.clock.remaining[p] = 0;
  const pos = new Position(s.fen);
  const opponentColor = p === 0 ? BLACK : WHITE;
  if (!pos.hasMatingMaterial(opponentColor)) return finish(s, null, 'Time out vs insufficient material');
  return finish(s, 1 - p, 'Time out');
}

export function act(state, player, action, ctx = {}) {
  check(!state.result, 'The game is over');
  check(action && typeof action.type === 'string', 'Unknown action');
  const now = ctx.now ?? Date.now();

  if (action.type === 'offerDraw') {
    check(state.drawOffer === null, 'A draw offer is already pending');
    check(state.offerAt[player] !== state.uci.length, 'You already offered a draw this move');
    const s = clone(state);
    s.drawOffer = player;
    s.offerAt[player] = s.uci.length;
    return s;
  }
  if (action.type === 'acceptDraw' || action.type === 'declineDraw') {
    check(state.drawOffer === 1 - player, 'There is no draw offer to answer');
    const s = clone(state);
    s.drawOffer = null;
    if (action.type === 'acceptDraw') finish(s, null, 'Draw agreed');
    return s;
  }
  check(action.type === 'move', 'Unknown action');
  check(player === state.turn, 'It is not your turn');
  const pos = new Position(state.fen);
  const from = parseSq(action.from);
  const to = parseSq(action.to);
  check(from >= 0 && to >= 0, 'Invalid square');
  const m = pos.findMove(from, to, action.promo);
  check(m, 'Illegal move');

  const s = clone(state);
  if (s.clock && s.clock.turnStart !== null) {
    s.clock.remaining[player] -= now - s.clock.turnStart;
    if (s.clock.remaining[player] <= 0) return flagFall(s, player);
    s.clock.remaining[player] += s.clock.inc;
  }
  const san = pos.san(m);
  const uci = pos.moveToUci(m);
  pos.make(m);
  s.fen = pos.fen();
  s.uci.push(uci);
  s.san.push(san);
  s.last = { from: sqName(moveFrom(m)), to: sqName(moveTo(m)) };
  s.turn = 1 - player;
  if (s.drawOffer === 1 - player) s.drawOffer = null; // moving declines a pending offer
  // Clocks start once both sides have made their first move.
  if (s.clock) s.clock.turnStart = s.uci.length >= 2 ? now : null;

  const key = pos.positionKey();
  if (pos.halfmove === 0) s.keys = {};
  s.keys[key] = (s.keys[key] || 0) + 1;

  if (pos.legalMoves().length === 0) {
    if (pos.inCheck()) finish(s, player, 'Checkmate');
    else finish(s, null, 'Stalemate');
  } else if (pos.insufficientMaterial()) finish(s, null, 'Insufficient material');
  else if (s.keys[key] >= 3) finish(s, null, 'Threefold repetition');
  else if (pos.halfmove >= 100) finish(s, null, 'Fifty-move rule');
  return s;
}

export function deadline(s) {
  if (s.result || !s.clock || s.clock.turnStart === null) return null;
  return s.clock.turnStart + s.clock.remaining[s.turn];
}

export function timeout(state, now) {
  const d = deadline(state);
  if (d === null || now < d) return null;
  const s = clone(state);
  return flagFall(s, s.turn);
}

export function forfeit(state, player, reason) {
  const s = clone(state);
  if (s.result) return s;
  if (s.clock && s.clock.turnStart !== null) {
    s.clock.remaining[s.turn] = Math.max(0, s.clock.remaining[s.turn] - (Date.now() - s.clock.turnStart));
  }
  return finish(s, 1 - player, reason);
}

export function outcome(s) {
  if (!s.result) return null;
  if (s.result.winner === null) return { winners: [], draw: true, reason: s.result.reason };
  return { winners: [s.result.winner], draw: false, reason: s.result.reason };
}

const VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const START_COUNT = { p: 8, n: 2, b: 2, r: 2, q: 1 };

export function view(s, player) {
  const pos = new Position(s.fen);
  const board = new Array(64).fill(null);
  const counts = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };
  let material = 0;
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = pos.board[(r << 4) | f];
      if (!p) continue;
      const color = p & 8 ? 'b' : 'w';
      const t = pieceChar(p).toLowerCase();
      board[r * 8 + f] = color + t.toUpperCase();
      if (t !== 'k') counts[color][t]++;
      material += (color === 'w' ? 1 : -1) * VALUES[t];
    }
  }
  // Pieces each side has captured (missing from the opponent's starting set).
  const captured = { w: [], b: [] };
  for (const t of ['q', 'r', 'b', 'n', 'p']) {
    for (let i = counts.b[t]; i < START_COUNT[t]; i++) captured.w.push(t);
    for (let i = counts.w[t]; i < START_COUNT[t]; i++) captured.b.push(t);
  }
  const over = !!s.result;
  const mine = player === s.turn && !over;
  const inCheck = pos.inCheck();
  return {
    fen: s.fen,
    board,
    turn: s.turn,
    legal: mine ? pos.legalMoves().map((m) => pos.moveToUci(m)) : [],
    last: s.last,
    check: inCheck ? sqName(pos.kings[pos.side >> 3]) : null,
    san: s.san,
    captured,
    material,
    result: s.result,
    drawOffer: s.drawOffer,
    canOfferDraw: player !== null && player !== undefined && !over && s.drawOffer === null && s.offerAt[player] !== s.uci.length,
    clock: s.clock ? { remaining: s.clock.remaining, turnStart: s.clock.turnStart, inc: s.clock.inc, base: s.clock.base } : null,
  };
}

export function bot(s, p, level, ctx) {
  const rng = ctx.rng || Math.random;
  const pos = replay(s);
  if (s.drawOffer === 1 - p) {
    let score = quickScore(pos, 3);
    if (s.turn !== p) score = -score;
    const accept = score < -150 || (Math.abs(score) < 40 && s.uci.length > 80);
    return { type: accept ? 'acceptDraw' : 'declineDraw' };
  }
  let deadline = ctx.deadline;
  if (level === 'hard') {
    let budget = deadline ? deadline - Date.now() : 1500;
    if (s.clock && s.clock.turnStart !== null) {
      const rem = s.clock.remaining[p] - (Date.now() - s.clock.turnStart);
      budget = Math.min(budget, rem / 30 + s.clock.inc * 0.7);
    }
    deadline = Date.now() + Math.max(100, budget);
  }
  const uci = chooseMove(pos, level, { rng, deadline });
  return { type: 'move', from: uci.slice(0, 2), to: uci.slice(2, 4), promo: uci[4] };
}

export { KING };
