// Yahtzee for 1-6 players with official scoring, Yahtzee bonuses and forced Joker rules.
import { check, clone, isInt } from '../lib/game.js';

export const CATEGORIES = [
  { id: 'ones', name: 'Ones', face: 1 },
  { id: 'twos', name: 'Twos', face: 2 },
  { id: 'threes', name: 'Threes', face: 3 },
  { id: 'fours', name: 'Fours', face: 4 },
  { id: 'fives', name: 'Fives', face: 5 },
  { id: 'sixes', name: 'Sixes', face: 6 },
  { id: 'threeKind', name: '3 of a Kind' },
  { id: 'fourKind', name: '4 of a Kind' },
  { id: 'fullHouse', name: 'Full House' },
  { id: 'smallStraight', name: 'Small Straight' },
  { id: 'largeStraight', name: 'Large Straight' },
  { id: 'yahtzee', name: 'Yahtzee' },
  { id: 'chance', name: 'Chance' },
];
export const CATEGORY_IDS = CATEGORIES.map((c) => c.id);
const UPPER = CATEGORY_IDS.slice(0, 6);
const LOWER = CATEGORY_IDS.slice(6);
export const ROUNDS = 13;
export const UPPER_BONUS = 35;
export const UPPER_TARGET = 63;
export const YAHTZEE_BONUS = 100;

export function faceCounts(dice) {
  const c = [0, 0, 0, 0, 0, 0, 0];
  for (const d of dice) c[d]++;
  return c;
}

const sum = (dice) => dice.reduce((a, b) => a + b, 0);

function hasRun(c, len) {
  let run = 0;
  for (let f = 1; f <= 6; f++) {
    run = c[f] ? run + 1 : 0;
    if (run >= len) return true;
  }
  return false;
}

/** Score for a category ignoring Joker rules. */
export function baseScore(cat, dice) {
  const c = faceCounts(dice);
  const i = UPPER.indexOf(cat);
  if (i >= 0) return c[i + 1] * (i + 1);
  const max = Math.max(...c);
  switch (cat) {
    case 'threeKind':
      return max >= 3 ? sum(dice) : 0;
    case 'fourKind':
      return max >= 4 ? sum(dice) : 0;
    case 'fullHouse':
      return c.includes(3) && c.includes(2) ? 25 : 0;
    case 'smallStraight':
      return hasRun(c, 4) ? 30 : 0;
    case 'largeStraight':
      return hasRun(c, 5) ? 40 : 0;
    case 'yahtzee':
      return max === 5 ? 50 : 0;
    case 'chance':
      return sum(dice);
    default:
      return 0;
  }
}

const isYahtzee = (dice) => dice.every((d) => d === dice[0]);

/**
 * Categories a player may score with these dice, and the points each gives.
 * Returns { options: { [cat]: points }, bonus: 0 | 100 }.
 */
export function scoreOptions(card, dice) {
  const options = {};
  let bonus = 0;
  if (isYahtzee(dice) && card.yahtzee !== null) {
    if (card.yahtzee === 50) bonus = YAHTZEE_BONUS;
    const upper = UPPER[dice[0] - 1];
    if (card[upper] === null) {
      options[upper] = dice[0] * 5;
    } else if (LOWER.some((k) => card[k] === null)) {
      const joker = { fullHouse: 25, smallStraight: 30, largeStraight: 40 };
      for (const k of LOWER) if (card[k] === null) options[k] = joker[k] ?? baseScore(k, dice);
    } else {
      for (const k of UPPER) if (card[k] === null) options[k] = 0;
    }
    return { options, bonus };
  }
  for (const k of CATEGORY_IDS) if (card[k] === null) options[k] = baseScore(k, dice);
  return { options, bonus };
}

export function emptyCard() {
  return Object.fromEntries(CATEGORY_IDS.map((k) => [k, null]));
}

export function totals(card, bonusCount = 0) {
  const upper = UPPER.reduce((a, k) => a + (card[k] || 0), 0);
  const upperBonus = upper >= UPPER_TARGET ? UPPER_BONUS : 0;
  const lower = LOWER.reduce((a, k) => a + (card[k] || 0), 0);
  const yahtzeeBonus = bonusCount * YAHTZEE_BONUS;
  return { upper, upperBonus, lower, yahtzeeBonus, total: upper + upperBonus + lower + yahtzeeBonus };
}

export function setup({ players }) {
  return {
    players,
    cards: Array.from({ length: players }, emptyCard),
    bonus: new Array(players).fill(0),
    turn: 0,
    round: 1,
    dice: [1, 2, 3, 4, 5],
    held: [false, false, false, false, false],
    rollsLeft: 3,
    rollId: 0,
    last: null,
    finished: false,
  };
}

export function actors(s) {
  return s.finished ? [] : [s.turn];
}

function roll(rng) {
  return 1 + Math.floor(rng() * 6);
}

export function act(state, player, action, ctx) {
  check(!state.finished, 'The game is over');
  check(player === state.turn, 'It is not your turn');
  check(action && typeof action.type === 'string', 'Unknown action');
  const rolled = state.rollsLeft < 3;
  if (action.type === 'hold') {
    check(rolled && state.rollsLeft > 0, 'You can only hold dice between rolls');
    check(Array.isArray(action.held) && action.held.length === 5, 'Invalid hold');
    const s = clone(state);
    s.held = action.held.map(Boolean);
    return s;
  }
  if (action.type === 'roll') {
    check(state.rollsLeft > 0, 'No rolls left: choose a box to score');
    const s = clone(state);
    if (!rolled) s.held = [false, false, false, false, false];
    else if (Array.isArray(action.held) && action.held.length === 5) s.held = action.held.map(Boolean);
    check(!s.held.every(Boolean), 'Release at least one die to roll');
    s.dice = s.dice.map((d, i) => (s.held[i] ? d : roll(ctx.rng)));
    s.rollsLeft--;
    s.rollId++;
    return s;
  }
  check(action.type === 'score', 'Unknown action');
  check(rolled, 'Roll the dice first');
  check(CATEGORY_IDS.includes(action.category), 'Unknown category');
  const card = state.cards[player];
  check(card[action.category] === null, 'That box is already filled');
  const { options, bonus } = scoreOptions(card, state.dice);
  check(action.category in options, 'Joker rules: you must use a different box');
  const s = clone(state);
  const points = options[action.category];
  s.cards[player][action.category] = points;
  if (bonus) s.bonus[player]++;
  s.last = { player, category: action.category, points, bonus: !!bonus, dice: s.dice.slice() };
  s.turn = (player + 1) % s.players;
  if (s.turn === 0) s.round++;
  if (s.round > ROUNDS) s.finished = true;
  s.held = [false, false, false, false, false];
  s.rollsLeft = 3;
  return s;
}

export function forfeit(state) {
  // Players leaving a Yahtzee game are replaced by the computer, so nothing to do here.
  return clone(state);
}

export function outcome(s) {
  if (!s.finished) return null;
  const scores = s.cards.map((c, i) => totals(c, s.bonus[i]).total);
  const best = Math.max(...scores);
  const winners = scores.map((x, i) => (x === best ? i : -1)).filter((i) => i >= 0);
  return {
    winners,
    draw: winners.length > 1,
    reason: s.players === 1 ? `Final score ${best}` : `Top score ${best}`,
    scores,
  };
}

export function view(s) {
  const rolled = s.rollsLeft < 3;
  return {
    players: s.players,
    cards: s.cards,
    totals: s.cards.map((c, i) => totals(c, s.bonus[i])),
    bonus: s.bonus,
    turn: s.turn,
    round: Math.min(s.round, ROUNDS),
    dice: s.dice,
    held: s.held,
    rollsLeft: s.rollsLeft,
    rolled,
    rollId: s.rollId,
    options: rolled && !s.finished ? scoreOptions(s.cards[s.turn], s.dice) : null,
    last: s.last,
    finished: s.finished,
  };
}

// ---------------------------------------------------------------------------
// AI. The hard bot solves the rest of the turn exactly (all 462 possible keeps,
// both rerolls) against a heuristic value for each way of ending the turn.

// Average scores per box under strong play, used as the opportunity cost of filling a box now.
const AVG = {
  ones: 2.1, twos: 5.3, threes: 8.6, fours: 12.2, fives: 15.7, sixes: 19.2,
  threeKind: 21.7, fourKind: 13.1, fullHouse: 22.6, smallStraight: 29.5,
  largeStraight: 32.7, yahtzee: 16.5, chance: 22.0,
};

// Enumerate multisets of dice as count vectors [c1..c6].
function multisets(n) {
  const out = [];
  const rec = (face, left, cur) => {
    if (face === 6) {
      cur[5] = left;
      out.push(cur.slice());
      return;
    }
    for (let k = 0; k <= left; k++) {
      cur[face - 1] = k;
      rec(face + 1, left - k, cur);
    }
  };
  rec(1, n, [0, 0, 0, 0, 0, 0]);
  return out;
}

const keyOf = (c) => c.join('');
const FACT = [1, 1, 2, 6, 24, 120];

let model = null;
function buildModel() {
  if (model) return model;
  const finals = multisets(5);
  const finalIndex = new Map(finals.map((c, i) => [keyOf(c), i]));
  const keeps = [];
  for (let k = 0; k <= 5; k++) keeps.push(...multisets(k));
  const keepIndex = new Map(keeps.map((c, i) => [keyOf(c), i]));
  const outcomesBySize = [0, 1, 2, 3, 4, 5].map((r) =>
    multisets(r).map((o) => {
      let p = FACT[r];
      for (const x of o) p /= FACT[x];
      return { o, p: p / Math.pow(6, r) };
    }),
  );
  const trans = keeps.map((kc) => {
    const size = kc.reduce((a, b) => a + b, 0);
    const list = [];
    for (const { o, p } of outcomesBySize[5 - size]) {
      const f = kc.map((x, i) => x + o[i]);
      list.push([finalIndex.get(keyOf(f)), p]);
    }
    return list;
  });
  // Sub-multisets (as keep indexes) of every final.
  const subs = finals.map((fc) => {
    const out = [];
    const rec = (face, cur) => {
      if (face === 6) {
        out.push(keepIndex.get(keyOf(cur)));
        return;
      }
      for (let k = 0; k <= fc[face]; k++) {
        cur[face] = k;
        rec(face + 1, cur);
      }
    };
    rec(0, [0, 0, 0, 0, 0, 0]);
    return out;
  });
  const diceOf = (c) => {
    const d = [];
    c.forEach((n, i) => {
      for (let k = 0; k < n; k++) d.push(i + 1);
    });
    return d;
  };
  model = { finals, finalIndex, keeps, keepIndex, trans, subs, finalDice: finals.map(diceOf), keepDice: keeps.map(diceOf) };
  return model;
}

const sigmoid = (x) => 1 / (1 + Math.exp(-x));

function bonusChance(upperSum, openUpperFaces) {
  const need = UPPER_TARGET - upperSum;
  if (need <= 0) return 1;
  if (!openUpperFaces.length) return 0;
  const par = openUpperFaces.reduce((a, f) => a + 3 * f, 0);
  return sigmoid((par - need + 1) / 4.5);
}

/** Heuristic value of scoring `cat` for `points` given the card (higher is better). */
function categoryValue(card, cat, points, bonus, smart) {
  if (!smart) return points + bonus;
  // The opportunity cost of filling a box shrinks as the game runs out of turns.
  let open = 0;
  for (const k of CATEGORY_IDS) if (card[k] === null) open++;
  const stage = Math.min(1, (open - 1) / 10);
  let v = points + bonus - AVG[cat] * stage;
  const face = UPPER.indexOf(cat) + 1;
  if (face > 0) {
    const upperSum = UPPER.reduce((a, k) => a + (card[k] || 0), 0);
    const faces = UPPER.map((k, i) => (card[k] === null ? i + 1 : 0)).filter(Boolean);
    const before = bonusChance(upperSum, faces);
    const after = bonusChance(upperSum + points, faces.filter((f) => f !== face));
    v += UPPER_BONUS * (after - before);
  }
  return v;
}

function bestCategory(card, dice, smart, rng) {
  const { options, bonus } = scoreOptions(card, dice);
  let best = null;
  let bestV = -Infinity;
  for (const [cat, pts] of Object.entries(options)) {
    const v = categoryValue(card, cat, pts, bonus, smart) + (rng ? rng() * 1e-6 : 0);
    if (v > bestV) {
      bestV = v;
      best = cat;
    }
  }
  return { cat: best, value: bestV };
}

/** Exact expectimax for the rest of the turn. Returns the best keep (as a hold mask) or null to stop and score. */
function planKeep(card, dice, rollsLeft, smart) {
  const m = buildModel();
  const E0 = m.finalDice.map((d) => bestCategory(card, d, smart).value);
  const expectKeep = (E) =>
    m.trans.map((list) => {
      let e = 0;
      for (const [fi, p] of list) e += p * E[fi];
      return e;
    });
  const K0 = expectKeep(E0); // value of each keep with one roll left
  let Kbest = K0;
  if (rollsLeft === 2) {
    const E1 = m.finals.map((_, fi) => Math.max(E0[fi], ...m.subs[fi].map((ki) => K0[ki])));
    Kbest = expectKeep(E1);
  }
  const counts = faceCounts(dice).slice(1);
  const fi = m.finalIndex.get(keyOf(counts));
  let bestKi = -1;
  let bestV = E0[fi]; // value of stopping now
  for (const ki of m.subs[fi]) {
    if (m.keepDice[ki].length === 5) continue; // keeping everything is the same as stopping
    if (Kbest[ki] > bestV + 1e-9) {
      bestV = Kbest[ki];
      bestKi = ki;
    }
  }
  if (bestKi < 0) return null;
  // Convert the kept multiset into a hold mask over the actual dice.
  const want = m.keeps[bestKi].slice();
  return dice.map((d) => {
    if (want[d - 1] > 0) {
      want[d - 1]--;
      return true;
    }
    return false;
  });
}

// Easy keeps whatever face it has most of. Pseudo-random choices are derived from the roll id so the
// decision is stable between the separate "hold" and "roll" steps.
function easyKeep(s) {
  const c = faceCounts(s.dice);
  let face = 6;
  for (let f = 6; f >= 1; f--) if (c[f] > c[face]) face = f;
  const r = (s.rollId * 2654435761) >>> 0;
  if (r % 100 < 15) face = 1 + (r % 6);
  return s.dice.map((d) => d === face);
}

const sameHeld = (a, b) => a.every((x, i) => x === b[i]);

export function bot(s, p, level, ctx) {
  const rng = ctx.rng;
  if (s.rollsLeft === 3) return { type: 'roll' };
  const card = s.cards[p];
  let held = null; // dice to keep for the next roll, or null to stop and score
  if (s.rollsLeft > 0) {
    if (level === 'easy') {
      const { options } = scoreOptions(card, s.dice);
      const best = Math.max(...Object.values(options));
      const stop = best >= 25 && ((s.rollId * 40503) >>> 0) % 10 < 7;
      if (!stop) held = easyKeep(s);
    } else {
      held = planKeep(card, s.dice, s.rollsLeft, level === 'hard');
    }
    if (held && held.every(Boolean)) held = null;
  }
  if (held) {
    // Show the hold first so other players can follow along, then roll.
    return sameHeld(held, s.held) ? { type: 'roll' } : { type: 'hold', held };
  }
  if (level === 'easy') {
    const { options } = scoreOptions(card, s.dice);
    const best = Math.max(...Object.values(options));
    const top = Object.keys(options).filter((k) => options[k] === best);
    return { type: 'score', category: top[Math.floor(rng() * top.length)] };
  }
  return { type: 'score', category: bestCategory(card, s.dice, level === 'hard', rng).cat };
}
