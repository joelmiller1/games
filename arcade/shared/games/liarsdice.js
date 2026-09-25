// Liar's Dice for 2-6 players. Everyone's dice are hidden; players take turns raising a bid on
// how many dice on the whole table show a face, until someone calls "Liar!" (or "Spot on").
import { check, clone, isInt } from '../lib/game.js';

export function rollDice(rng, n) {
  return Array.from({ length: n }, () => 1 + Math.floor(rng() * 6)).sort((a, b) => a - b);
}

export function setup({ players, options, rng = Math.random }) {
  const start = Number(options?.dice) === 3 ? 3 : 5;
  const s = {
    wild: options?.wild !== false,
    spot: options?.spot !== false,
    start,
    counts: Array(players).fill(start),
    dice: [],
    turn: 0,
    bid: null,
    bids: [],
    round: 0,
    rollId: 0,
    last: null,
    winner: null,
    endReason: null,
  };
  newRound(s, 0, rng);
  return s;
}

function newRound(s, starter, rng) {
  s.round++;
  s.rollId++;
  s.dice = s.counts.map((n) => rollDice(rng, n));
  s.bid = null;
  s.bids = [];
  s.turn = s.counts[starter] > 0 ? starter : nextActive(s, starter);
}

function nextActive(s, from) {
  const n = s.counts.length;
  for (let k = 1; k <= n; k++) {
    const p = (from + k) % n;
    if (s.counts[p] > 0) return p;
  }
  return from;
}

const over = (s) => s.winner !== null;

export function actors(s) {
  return over(s) ? [] : [s.turn];
}

export const totalDice = (s) => s.counts.reduce((a, b) => a + b, 0);

/** Lowest face that may be bid (1s are wild and cannot be bid on when wild). */
export const minFace = (s) => (s.wild ? 2 : 1);

export function isHigher(a, b) {
  return !b || a.q > b.q || (a.q === b.q && a.f > b.f);
}

/** How many dice on the table count towards face f. */
export function countFace(dice, f, wild) {
  let n = 0;
  for (const hand of dice) for (const d of hand) if (d === f || (wild && d === 1 && f !== 1)) n++;
  return n;
}

export function act(state, player, action, ctx = {}) {
  check(!over(state), 'The game is over');
  check(player === state.turn, 'It is not your turn');
  check(action && typeof action === 'object', 'Unknown action');
  const rng = ctx.rng || Math.random;
  if (action.type === 'bid') {
    const bid = { q: action.q, f: action.f };
    check(isInt(bid.f, minFace(state), 6), state.wild ? 'Bid on a face from 2 to 6 (ones are wild)' : 'Bid on a face from 1 to 6');
    check(isInt(bid.q, 1, totalDice(state)), `Bid between 1 and ${totalDice(state)} dice`);
    check(isHigher(bid, state.bid), 'Your bid must be higher: more dice, or the same number of a higher face');
    const s = clone(state);
    s.bid = { ...bid, by: player };
    s.bids.push(s.bid);
    s.turn = nextActive(s, player);
    return s;
  }
  check(action.type === 'liar' || action.type === 'spot', 'Unknown action');
  check(state.bid, 'There is no bid to challenge yet');
  if (action.type === 'spot') check(state.spot, '“Spot on” is not allowed at this table');
  const s = clone(state);
  const { q, f, by } = s.bid;
  const count = countFace(s.dice, f, s.wild);
  let losers;
  let correct;
  if (action.type === 'liar') {
    correct = count < q; // the caller was right if the bid was too high
    losers = [correct ? by : player];
  } else {
    correct = count === q;
    losers = correct ? s.counts.map((n, i) => (n > 0 && i !== player ? i : -1)).filter((i) => i >= 0) : [player];
  }
  for (const p of losers) s.counts[p] = Math.max(0, s.counts[p] - 1);
  const eliminated = losers.filter((p) => s.counts[p] === 0);
  s.last = {
    round: s.round,
    bid: { q, f, by },
    caller: player,
    call: action.type,
    hands: s.dice,
    count,
    correct,
    losers,
    eliminated,
  };
  const alive = s.counts.map((n, i) => (n > 0 ? i : -1)).filter((i) => i >= 0);
  if (alive.length === 1) {
    s.winner = alive[0];
    s.endReason = `${action.type === 'spot' ? 'Spot on' : 'Liar'} call: last player with dice`;
    s.dice = s.counts.map(() => []);
    return s;
  }
  // The player who lost a die starts the next round (the caller after a successful spot on).
  const starter = losers.length === 1 ? losers[0] : player;
  newRound(s, starter, rng);
  return s;
}

export function forfeit(state, player, reason) {
  const s = clone(state);
  if (over(s)) return s;
  s.counts[player] = 0;
  s.dice[player] = [];
  const alive = s.counts.map((n, i) => (n > 0 ? i : -1)).filter((i) => i >= 0);
  if (alive.length === 1) {
    s.winner = alive[0];
    s.endReason = reason;
  } else if (s.turn === player) {
    s.turn = nextActive(s, player);
    if (s.bid && s.bid.by === s.turn) {
      s.bid = null;
      s.bids = [];
    }
  }
  return s;
}

export function outcome(s) {
  if (!over(s)) return null;
  return { winners: [s.winner], draw: false, reason: s.endReason };
}

export function view(s, p) {
  return {
    wild: s.wild,
    spot: s.spot,
    start: s.start,
    counts: s.counts,
    // Only your own dice (spectators see none until the reveal).
    dice: s.counts.map((_, i) => (i === p ? s.dice[i] : null)),
    total: totalDice(s),
    turn: s.turn,
    bid: s.bid,
    bids: s.bids,
    round: s.round,
    rollId: s.rollId,
    last: s.last,
    winner: s.winner,
  };
}

/** Give people a moment to look at the dice after a challenge before the computer bids again. */
export function botDelay(s) {
  return s.bids.length === 0 && s.last ? 3600 : 1300;
}

// ---------------------------------------------------------------------------
// Computer player: probability of a bid being true given its own dice.

const binomCache = new Map();
/** P(X >= k) for X ~ Binomial(n, p). */
export function atLeast(n, k, p) {
  if (k <= 0) return 1;
  if (k > n) return 0;
  const key = `${n}|${k}|${p}`;
  const hit = binomCache.get(key);
  if (hit !== undefined) return hit;
  let sum = 0;
  let c = 1; // C(n, i)
  for (let i = 0; i <= n; i++) {
    if (i >= k) sum += c * p ** i * (1 - p) ** (n - i);
    c = (c * (n - i)) / (i + 1);
  }
  binomCache.set(key, sum);
  return sum;
}

function exactly(n, k, p) {
  return atLeast(n, k, p) - atLeast(n, k + 1, p);
}

export function bot(s, me, level, ctx) {
  const rng = ctx.rng;
  const mine = s.dice[me];
  const total = totalDice(s);
  const unknown = total - mine.length;
  const faces = [];
  for (let f = minFace(s); f <= 6; f++) faces.push(f);
  const pFace = (f) => (s.wild && f !== 1 ? 1 / 3 : 1 / 6);
  const own = (f) => mine.filter((d) => d === f || (s.wild && d === 1 && f !== 1)).length;

  // What other players' bids this round suggest about their hidden dice (hard only).
  const hint = (f) => {
    if (level !== 'hard') return 0;
    const bidders = new Set(s.bids.filter((b) => b.by !== me && b.f === f).map((b) => b.by));
    return Math.min(unknown, bidders.size * 0.6);
  };
  const probTrue = (q, f) => {
    const need = q - own(f) - Math.floor(hint(f));
    return atLeast(unknown - Math.floor(hint(f)), need, pFace(f));
  };
  const probExact = (q, f) => {
    const need = q - own(f);
    return need < 0 ? 0 : exactly(unknown, need, pFace(f));
  };
  const expected = (f) => own(f) + unknown * pFace(f);

  // All bids that beat the current one, up to a little above what is plausible.
  const raises = [];
  for (const f of faces) {
    const minQ = !s.bid ? 1 : f > s.bid.f ? s.bid.q : s.bid.q + 1;
    for (let q = minQ; q <= Math.min(total, minQ + 2); q++) raises.push({ q, f });
  }

  if (level === 'easy') {
    if (s.bid && s.bid.q > expected(s.bid.f) + 1 + rng() * 1.5) return { type: 'liar' };
    const options = raises.filter((b) => b.q <= Math.ceil(expected(b.f)) + 1);
    const choice = options.length ? options[Math.floor(rng() * Math.min(3, options.length))] : raises[0];
    if (!choice) return { type: 'liar' };
    return { type: 'bid', q: choice.q, f: choice.f };
  }

  const noise = level === 'medium' ? 0.12 : 0.05;
  let best = null;
  let bestP = -1;
  for (const b of raises) {
    // A slightly safer bid is better when several are equally likely; small random noise keeps
    // the computer from being predictable.
    const p = probTrue(b.q, b.f) - 0.002 * b.q + (rng() - 0.5) * noise;
    if (p > bestP) {
      bestP = p;
      best = b;
    }
  }
  if (!s.bid) {
    // Open with a believable bid on a face we hold, not the timid "one of something".
    const openers = raises.concat(faces.map((f) => ({ q: Math.max(1, Math.floor(expected(f))), f }))).filter((b) => probTrue(b.q, b.f) >= 0.6 - rng() * 0.15);
    openers.sort((a, b) => b.q - a.q || own(b.f) - own(a.f));
    const pickFrom = openers.slice(0, 3);
    const open = pickFrom.length ? pickFrom[Math.floor(rng() * pickFrom.length)] : best;
    return { type: 'bid', q: open.q, f: open.f };
  }
  const pBid = probTrue(s.bid.q, s.bid.f);
  const pLiar = 1 - pBid;
  if (s.spot && level === 'hard') {
    const pSpot = probExact(s.bid.q, s.bid.f);
    // Spot on costs everyone else a die, so it is worth a little risk.
    if (pSpot > 0.42 && pSpot > bestP) return { type: 'spot' };
  }
  if (!best || pLiar > bestP + (level === 'medium' ? (rng() - 0.5) * 0.2 : 0)) return { type: 'liar' };
  return { type: 'bid', q: best.q, f: best.f };
}
