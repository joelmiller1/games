// Mancala with Kalah rules.
// pits[0..5] are player 0's houses (left to right along the bottom), pits[6] is player 0's store,
// pits[7..12] are player 1's houses (right to left along the top) and pits[13] is player 1's store.
// Sowing goes up the index (anticlockwise on screen) and skips the opponent's store.
import { check, clone, isInt } from '../lib/game.js';
import { pick } from '../lib/rng.js';

export const STORE = [6, 13];
export const housesOf = (p) => (p === 0 ? [0, 1, 2, 3, 4, 5] : [7, 8, 9, 10, 11, 12]);
export const opposite = (i) => 12 - i;
const ownerOf = (i) => (i < 7 ? 0 : 1);

export function setup({ options } = {}) {
  const n = [3, 4, 6].includes(Number(options?.seeds)) ? Number(options.seeds) : 4;
  const pits = Array(14).fill(n);
  pits[6] = 0;
  pits[13] = 0;
  return { pits, seeds: n, turn: 0, last: null, moves: 0, winner: null, draw: false, endReason: null };
}

const over = (s) => s.winner !== null || s.draw;

export function actors(s) {
  return over(s) ? [] : [s.turn];
}

/** Sows from pit `i` for player p, mutating `pits`. Returns what happened. */
export function sow(pits, p, i) {
  let n = pits[i];
  pits[i] = 0;
  const path = [];
  let at = i;
  while (n > 0) {
    at = (at + 1) % 14;
    if (at === STORE[1 - p]) continue;
    pits[at]++;
    path.push(at);
    n--;
  }
  let capture = null;
  const extra = at === STORE[p];
  if (!extra && ownerOf(at) === p && at !== STORE[p] && pits[at] === 1 && pits[opposite(at)] > 0) {
    const taken = pits[opposite(at)] + 1;
    capture = { pit: at, from: opposite(at), count: taken };
    pits[STORE[p]] += taken;
    pits[at] = 0;
    pits[opposite(at)] = 0;
  }
  return { path, extra, capture };
}

/** When a side is empty the other player banks their remaining seeds. Returns the sweep or null. */
export function sweepIfDone(pits) {
  const empty0 = housesOf(0).every((i) => pits[i] === 0);
  const empty1 = housesOf(1).every((i) => pits[i] === 0);
  if (!empty0 && !empty1) return null;
  const swept = [0, 0];
  for (const p of [0, 1]) {
    for (const i of housesOf(p)) {
      swept[p] += pits[i];
      pits[STORE[p]] += pits[i];
      pits[i] = 0;
    }
  }
  return swept;
}

export function legalPits(s, p = s.turn) {
  return housesOf(p).filter((i) => s.pits[i] > 0);
}

export function act(state, player, action) {
  check(!over(state), 'The game is over');
  check(player === state.turn, 'It is not your turn');
  check(action && action.type === 'sow', 'Unknown action');
  check(isInt(action.pit, 0, 13) && housesOf(player).includes(action.pit), 'Pick one of your own pits');
  check(state.pits[action.pit] > 0, 'That pit is empty');
  const s = clone(state);
  const before = s.pits.slice();
  const r = sow(s.pits, player, action.pit);
  const swept = sweepIfDone(s.pits);
  s.moves++;
  s.last = { player, pit: action.pit, seeds: before[action.pit], path: r.path, extra: r.extra && !swept, capture: r.capture, swept };
  if (swept) {
    const [a, b] = [s.pits[6], s.pits[13]];
    if (a === b) {
      s.draw = true;
      s.endReason = `${a}–${b}`;
    } else {
      s.winner = a > b ? 0 : 1;
      s.endReason = `${Math.max(a, b)}–${Math.min(a, b)}`;
    }
  } else if (!r.extra) s.turn = 1 - player;
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
  return { pits: s.pits, seeds: s.seeds, turn: s.turn, last: s.last, moves: s.moves, legal: over(s) ? [] : legalPits(s), winner: s.winner, draw: s.draw };
}

// ---------------------------------------------------------------------------
// Computer player: negamax with alpha-beta; an extra turn keeps the same side to move.

class Abort extends Error {}

class Searcher {
  constructor(deadline) {
    this.deadline = deadline;
    this.nodes = 0;
  }

  // Score from the perspective of p: store difference, plus a little for seeds still on each side.
  evaluate(pits, p) {
    const q = 1 - p;
    let side = 0;
    for (let k = 0; k < 6; k++) side += pits[k + (p === 0 ? 0 : 7)] - pits[k + (q === 0 ? 0 : 7)];
    return (pits[STORE[p]] - pits[STORE[q]]) * 4 + side;
  }

  search(pits, p, depth, alpha, beta) {
    this.nodes++;
    if ((this.nodes & 4095) === 0 && Date.now() > this.deadline) throw new Abort();
    const houses = p === 0 ? 0 : 7;
    let any = false;
    for (let k = 0; k < 6; k++) if (pits[houses + k]) any = true;
    if (!any || depth <= 0) {
      if (!any) {
        // Game over: the opponent banks their side.
        const b = pits.slice();
        sweepIfDone(b);
        const d = b[STORE[p]] - b[STORE[1 - p]];
        return d * 1000;
      }
      return this.evaluate(pits, p);
    }
    let best = -Infinity;
    // Extra-turn moves first, then captures, then the rest (right-most pits first).
    const order = this.order(pits, p);
    for (const i of order) {
      const b = pits.slice();
      const r = sow(b, p, i);
      let sc;
      if (sweepIfDone(b)) sc = (b[STORE[p]] - b[STORE[1 - p]]) * 1000;
      else if (r.extra) sc = this.search(b, p, depth - 1, alpha, beta);
      else sc = -this.search(b, 1 - p, depth - 1, -beta, -alpha);
      if (sc > best) best = sc;
      if (sc > alpha) alpha = sc;
      if (alpha >= beta) break;
    }
    return best;
  }

  order(pits, p) {
    const out = [];
    for (let k = 5; k >= 0; k--) {
      const i = (p === 0 ? 0 : 7) + k;
      const n = pits[i];
      if (!n) continue;
      const land = (i + n) % 13; // good enough for ordering (ignores laps and the skipped store)
      const rank = i + n === STORE[p] ? 2 : ownerOf(land) === p && pits[land] === 0 && n < 13 ? 1 : 0;
      out.push({ i, rank });
    }
    out.sort((a, b) => b.rank - a.rank);
    return out.map((x) => x.i);
  }

  rootScores(pits, p, depth) {
    return legalPits({ pits }, p).map((i) => {
      const b = pits.slice();
      const r = sow(b, p, i);
      let sc;
      if (sweepIfDone(b)) sc = (b[STORE[p]] - b[STORE[1 - p]]) * 1000;
      else if (r.extra) sc = this.search(b, p, depth - 1, -Infinity, Infinity);
      else sc = -this.search(b, 1 - p, depth - 1, -Infinity, Infinity);
      return { pit: i, score: sc };
    });
  }
}

export function bot(s, p, level, ctx) {
  const rng = ctx.rng;
  const legal = legalPits(s, p);
  const sowAt = (pit) => ({ type: 'sow', pit });
  if (legal.length === 1) return sowAt(legal[0]);
  if (level === 'easy') {
    if (rng() < 0.35) return sowAt(pick(rng, legal));
    const scores = new Searcher(Infinity).rootScores(s.pits, p, 1).map((m) => ({ ...m, score: m.score + (rng() - 0.5) * 12 }));
    scores.sort((a, b) => b.score - a.score);
    return sowAt(scores[0].pit);
  }
  if (level === 'medium') {
    const scores = new Searcher(Infinity).rootScores(s.pits, p, 4).map((m) => ({ ...m, score: m.score + (rng() - 0.5) * 6 }));
    scores.sort((a, b) => b.score - a.score);
    return sowAt(scores[0].pit);
  }
  const budget = Math.max(200, Math.min(3000, (ctx.deadline || Date.now() + 1000) - Date.now()));
  const srch = new Searcher(Date.now() + budget);
  let best = legal[0];
  for (let depth = 2; depth <= 40; depth++) {
    try {
      const scores = srch.rootScores(s.pits, p, depth);
      const top = Math.max(...scores.map((x) => x.score));
      const ties = scores.filter((x) => x.score === top).map((x) => x.pit);
      best = pick(rng, ties);
      if (Math.abs(top) >= 1000 && scores.every((x) => Math.abs(x.score) >= 1000)) break; // solved
    } catch (e) {
      if (e instanceof Abort) break;
      throw e;
    }
  }
  return sowAt(best);
}
