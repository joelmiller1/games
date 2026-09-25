import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as y from '../shared/games/yahtzee.js';
import { seeded } from '../shared/lib/rng.js';

test('base scores', () => {
  assert.equal(y.baseScore('threes', [3, 3, 1, 3, 6]), 9);
  assert.equal(y.baseScore('threeKind', [2, 2, 2, 5, 6]), 17);
  assert.equal(y.baseScore('threeKind', [2, 2, 1, 5, 6]), 0);
  assert.equal(y.baseScore('fourKind', [4, 4, 4, 4, 1]), 17);
  assert.equal(y.baseScore('fullHouse', [3, 3, 5, 5, 5]), 25);
  assert.equal(y.baseScore('fullHouse', [5, 5, 5, 5, 5]), 0);
  assert.equal(y.baseScore('smallStraight', [1, 2, 3, 4, 6]), 30);
  assert.equal(y.baseScore('smallStraight', [3, 4, 5, 6, 6]), 30);
  assert.equal(y.baseScore('smallStraight', [1, 2, 4, 5, 6]), 0);
  assert.equal(y.baseScore('largeStraight', [2, 3, 4, 5, 6]), 40);
  assert.equal(y.baseScore('largeStraight', [1, 2, 3, 4, 6]), 0);
  assert.equal(y.baseScore('yahtzee', [6, 6, 6, 6, 6]), 50);
  assert.equal(y.baseScore('chance', [1, 2, 3, 4, 6]), 16);
});

test('joker rules and yahtzee bonus', () => {
  const card = y.emptyCard();
  card.yahtzee = 50;
  // Upper box open: must use it.
  let r = y.scoreOptions(card, [4, 4, 4, 4, 4]);
  assert.deepEqual(r, { options: { fours: 20 }, bonus: 100 });
  // Upper box filled: any open lower box, straights and full house at full value.
  card.fours = 12;
  r = y.scoreOptions(card, [4, 4, 4, 4, 4]);
  assert.equal(r.options.largeStraight, 40);
  assert.equal(r.options.fullHouse, 25);
  assert.equal(r.options.chance, 20);
  assert.equal(r.options.ones, undefined);
  // Everything in the lower section filled: zero an upper box.
  for (const k of ['threeKind', 'fourKind', 'fullHouse', 'smallStraight', 'largeStraight', 'chance']) card[k] = 0;
  r = y.scoreOptions(card, [4, 4, 4, 4, 4]);
  assert.deepEqual(r.options, { ones: 0, twos: 0, threes: 0, fives: 0, sixes: 0 });
  // Yahtzee box zeroed: no bonus, but jokers still apply.
  const card2 = y.emptyCard();
  card2.yahtzee = 0;
  assert.equal(y.scoreOptions(card2, [2, 2, 2, 2, 2]).bonus, 0);
});

test('totals include the upper bonus', () => {
  const card = y.emptyCard();
  Object.assign(card, { ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18, chance: 20 });
  assert.deepEqual(y.totals(card, 1), { upper: 63, upperBonus: 35, lower: 20, yahtzeeBonus: 100, total: 218 });
});

test('turn flow: roll, hold, score, next player; game ends after 13 rounds', () => {
  const rng = seeded(1);
  const ctx = { rng };
  let s = y.setup({ players: 2 });
  assert.throws(() => y.act(s, 0, { type: 'score', category: 'chance' }, ctx), /Roll the dice/);
  s = y.act(s, 0, { type: 'roll' }, ctx);
  assert.equal(s.rollsLeft, 2);
  s = y.act(s, 0, { type: 'hold', held: [true, false, false, false, true] }, ctx);
  const kept = [s.dice[0], s.dice[4]];
  s = y.act(s, 0, { type: 'roll' }, ctx);
  assert.deepEqual([s.dice[0], s.dice[4]], kept);
  s = y.act(s, 0, { type: 'roll' }, ctx);
  assert.throws(() => y.act(s, 0, { type: 'roll' }, ctx), /No rolls left/);
  s = y.act(s, 0, { type: 'score', category: 'chance' }, ctx);
  assert.equal(s.turn, 1);
  assert.throws(() => y.act(s, 0, { type: 'roll' }, ctx), /not your turn/);
  // Play everything out with bots.
  while (!y.outcome(s)) {
    const p = s.turn;
    s = y.act(s, p, y.bot(s, p, 'medium', ctx), ctx);
  }
  const o = y.outcome(s);
  assert.equal(o.scores.length, 2);
  assert.ok(s.cards.every((c) => Object.values(c).every((v) => v !== null)));
});

function average(level, games, seed) {
  const rng = seeded(seed);
  const ctx = { rng };
  let total = 0;
  for (let g = 0; g < games; g++) {
    let s = y.setup({ players: 1 });
    while (!y.outcome(s)) s = y.act(s, 0, y.bot(s, 0, level, ctx), ctx);
    total += y.outcome(s).scores[0];
  }
  return total / games;
}

test('bot strength is ordered easy < medium < hard', () => {
  const easy = average('easy', 40, 11);
  const medium = average('medium', 40, 11);
  const hard = average('hard', 40, 11);
  console.log(`# yahtzee averages: easy ${easy.toFixed(1)}, medium ${medium.toFixed(1)}, hard ${hard.toFixed(1)}`);
  assert.ok(easy < medium && medium < hard, `${easy} ${medium} ${hard}`);
  assert.ok(hard > 205, `hard average ${hard}`);
});
