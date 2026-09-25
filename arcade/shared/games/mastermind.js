// Mastermind. One player cracks the computer's code, or two players each set a code for the
// other and race to crack it, taking turns (the second player always gets the same number of
// guesses, so cracking it in the same round is a draw).
import { check, clone, isInt } from '../lib/game.js';
import { pick, randInt, shuffle } from '../lib/rng.js';

export const CODES = {
  '4x6': { pegs: 4, colors: 6, guesses: 10 },
  '5x8': { pegs: 5, colors: 8, guesses: 12 },
};

/** { black, white }: right colour in the right place, right colour in the wrong place. */
export function feedback(secret, guess) {
  let black = 0;
  const a = new Array(10).fill(0);
  const b = new Array(10).fill(0);
  for (let i = 0; i < secret.length; i++) {
    if (secret[i] === guess[i]) black++;
    else {
      a[secret[i]]++;
      b[guess[i]]++;
    }
  }
  let white = 0;
  for (let c = 0; c < 10; c++) white += Math.min(a[c], b[c]);
  return { black, white };
}

export function randomCode(rng, pegs, colors) {
  return Array.from({ length: pegs }, () => randInt(rng, colors));
}

function validCode(code, s) {
  return Array.isArray(code) && code.length === s.pegs && code.every((c) => isInt(c, 0, s.colors - 1));
}

export function setup({ players = 1, options, rng = Math.random } = {}) {
  const cfg = CODES[options?.code] || CODES['4x6'];
  const solo = players === 1;
  return {
    pegs: cfg.pegs,
    colors: cfg.colors,
    maxGuesses: cfg.guesses,
    players,
    phase: solo ? 'playing' : 'setup',
    // targets[i] is the code player i is trying to crack.
    targets: solo ? [randomCode(rng, cfg.pegs, cfg.colors)] : [null, null],
    ready: solo ? [true] : [false, false],
    guesses: Array.from({ length: players }, () => []),
    turn: 0,
    solvedAt: Array(players).fill(null),
    winners: null,
    endReason: null,
  };
}

const over = (s) => s.winners !== null;

export function actors(s) {
  if (over(s)) return [];
  if (s.phase === 'setup') return s.ready.map((r, i) => (r ? -1 : i)).filter((i) => i >= 0);
  return [s.turn];
}

function end(s, winners, reason) {
  s.winners = winners;
  s.endReason = reason;
  s.phase = 'over';
}

const plural = (n) => `${n} guess${n === 1 ? '' : 'es'}`;

export function act(state, player, action) {
  check(!over(state), 'The game is over');
  check(action && typeof action === 'object', 'Unknown action');
  if (action.type === 'setCode') {
    check(state.phase === 'setup', 'The codes are already set');
    check(!state.ready[player], 'You already set your code');
    check(validCode(action.code, state), 'Invalid code');
    const s = clone(state);
    s.targets[1 - player] = action.code.slice();
    s.ready[player] = true;
    if (s.ready.every(Boolean)) s.phase = 'playing';
    return s;
  }
  check(action.type === 'guess', 'Unknown action');
  check(state.phase === 'playing', 'Wait until both codes are set');
  check(player === state.turn, 'It is not your turn');
  check(validCode(action.code, state), 'Invalid guess');
  const s = clone(state);
  const fb = feedback(s.targets[player], action.code);
  const mine = s.guesses[player];
  mine.push({ code: action.code.slice(), ...fb });
  const solved = fb.black === s.pegs;
  if (solved) s.solvedAt[player] = mine.length;

  if (s.players === 1) {
    if (solved) end(s, [0], `Cracked in ${plural(mine.length)}`);
    else if (mine.length >= s.maxGuesses) end(s, [], 'Out of guesses');
    return s;
  }
  if (player === 0) {
    // The second player always gets to answer in the same round.
    s.turn = 1;
    return s;
  }
  const first = s.solvedAt[0];
  if (first !== null && solved) end(s, [0, 1], `Both cracked it in ${plural(mine.length)}`);
  else if (first !== null) end(s, [0], `Cracked in ${plural(first)}`);
  else if (solved) end(s, [1], `Cracked in ${plural(mine.length)}`);
  else if (mine.length >= s.maxGuesses) end(s, [0, 1], 'Neither code was cracked');
  else s.turn = 0;
  return s;
}

export function forfeit(state, player, reason) {
  const s = clone(state);
  if (over(s)) return s;
  end(s, s.players === 1 ? [] : [1 - player], reason);
  return s;
}

export function outcome(s) {
  if (!over(s)) return null;
  return { winners: s.winners, draw: s.winners.length > 1, reason: s.endReason };
}

export function view(s, p) {
  const done = over(s);
  return {
    pegs: s.pegs,
    colors: s.colors,
    maxGuesses: s.maxGuesses,
    players: s.players,
    phase: s.phase,
    turn: s.turn,
    ready: s.ready,
    guesses: s.guesses,
    solvedAt: s.solvedAt,
    // The code you set for your opponent (two players), and every code once the game is over.
    myCode: s.players === 2 && p !== null && p !== undefined ? s.targets[1 - p] : null,
    targets: done ? s.targets : null,
    winners: s.winners,
  };
}

// ---------------------------------------------------------------------------
// Computer player.

const allCodesCache = new Map();

export function allCodes(pegs, colors) {
  const key = `${pegs}x${colors}`;
  if (allCodesCache.has(key)) return allCodesCache.get(key);
  const out = [];
  const total = colors ** pegs;
  for (let n = 0; n < total; n++) {
    const code = [];
    let x = n;
    for (let i = 0; i < pegs; i++) {
      code.push(x % colors);
      x = Math.floor(x / colors);
    }
    out.push(code);
  }
  allCodesCache.set(key, out);
  return out;
}

function consistent(code, history) {
  for (const g of history) {
    const fb = feedback(code, g.code);
    if (fb.black !== g.black || fb.white !== g.white) return false;
  }
  return true;
}

/** Guess that splits the remaining candidates into the smallest expected group. */
function bestSplit(candidates, rng, pegs) {
  const guesses = candidates.length > 300 ? shuffle(rng, candidates).slice(0, 300) : candidates;
  const sample = candidates.length > 900 ? shuffle(rng, candidates).slice(0, 900) : candidates;
  let best = guesses[0];
  let bestScore = Infinity;
  const counts = new Map();
  for (const g of guesses) {
    counts.clear();
    for (const c of sample) {
      const fb = feedback(c, g);
      const k = fb.black * 16 + fb.white;
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    let score = 0;
    for (const [k, n] of counts) score += k === pegs * 16 ? 0 : n * n;
    if (score < bestScore) {
      bestScore = score;
      best = g;
    }
  }
  return best;
}

export function bot(s, p, level, ctx) {
  const rng = ctx.rng;
  if (s.phase === 'setup') return { type: 'setCode', code: randomCode(rng, s.pegs, s.colors) };
  const history = s.guesses[p];
  const guess = (code) => ({ type: 'guess', code });
  if (!history.length) {
    if (level === 'hard') return guess(s.pegs === 4 ? [0, 0, 1, 1] : [0, 0, 1, 1, 2]);
    return guess(randomCode(rng, s.pegs, s.colors));
  }
  const all = allCodes(s.pegs, s.colors);
  if (level === 'easy') {
    // Forgetful: only remembers some of what it has learned.
    const remembered = history.filter((_, i) => i === history.length - 1 || rng() < 0.45);
    const cands = all.filter((c) => consistent(c, remembered) && !history.some((g) => g.code.join() === c.join()));
    return guess(cands.length ? pick(rng, cands) : randomCode(rng, s.pegs, s.colors));
  }
  const cands = all.filter((c) => consistent(c, history));
  if (!cands.length) return guess(randomCode(rng, s.pegs, s.colors));
  if (level === 'medium' || cands.length <= 2) return guess(pick(rng, cands));
  return guess(bestSplit(cands, rng, s.pegs));
}
