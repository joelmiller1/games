import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as ld from '../shared/games/liarsdice.js';
import { seeded } from '../shared/lib/rng.js';

const bid = (q, f) => ({ type: 'bid', q, f });

function table(dice, options = {}) {
  const s = ld.setup({ players: dice.length, options, rng: seeded(1) });
  s.dice = dice.map((d) => d.slice());
  s.counts = dice.map((d) => d.length);
  return s;
}

test('everyone sees only their own dice', () => {
  const s = ld.setup({ players: 3, options: {}, rng: seeded(5) });
  assert.deepEqual(s.counts, [5, 5, 5]);
  const v = ld.view(s, 1);
  assert.equal(v.dice[0], null);
  assert.equal(v.dice[2], null);
  assert.equal(v.dice[1].length, 5);
  assert.ok(ld.view(s, null).dice.every((d) => d === null), 'spectators see no dice');
  assert.equal(v.total, 15);
});

test('bids must go up, and ones cannot be bid when they are wild', () => {
  let s = table([[2, 3, 4], [5, 5, 6]]);
  assert.throws(() => ld.act(s, 0, bid(2, 1)), /2 to 6/);
  assert.throws(() => ld.act(s, 0, bid(7, 3)), /between 1 and 6/);
  assert.throws(() => ld.act(s, 0, { type: 'liar' }), /no bid/);
  s = ld.act(s, 0, bid(2, 4));
  assert.throws(() => ld.act(s, 1, bid(2, 3)), /higher/);
  assert.throws(() => ld.act(s, 1, bid(2, 4)), /higher/);
  s = ld.act(s, 1, bid(2, 5));
  s = ld.act(s, 0, bid(3, 2));
  assert.deepEqual(s.bids.map((b) => [b.q, b.f]), [[2, 4], [2, 5], [3, 2]]);
  const plain = table([[1, 1, 1], [2, 2, 2]], { wild: false });
  assert.equal(ld.act(plain, 0, bid(2, 1)).bid.f, 1, 'without wild ones you can bid on 1s');
});

test('calling liar: ones are wild, and the loser starts the next round', () => {
  // Fours on the table: 4, 4 and a wild 1 = three.
  const base = table([[1, 4, 6], [4, 2, 3], [5, 5, 5]]);
  let s = ld.act(base, 0, bid(3, 4));
  s = ld.act(s, 1, { type: 'liar' }, { rng: seeded(2) });
  assert.equal(s.last.count, 3);
  assert.equal(s.last.correct, false, 'the bid was true');
  assert.deepEqual(s.last.losers, [1]);
  assert.deepEqual(s.counts, [3, 2, 3]);
  assert.equal(s.turn, 1, 'the caller lost a die and starts');
  assert.equal(s.round, 2);
  assert.deepEqual(s.last.hands, [[1, 4, 6], [4, 2, 3], [5, 5, 5]], 'the reveal shows every hand');
  assert.equal(s.bid, null);

  s = ld.act(base, 0, bid(4, 4));
  s = ld.act(s, 1, { type: 'liar' }, { rng: seeded(2) });
  assert.equal(s.last.correct, true, 'only three fours');
  assert.deepEqual(s.counts, [2, 3, 3]);
  assert.equal(s.turn, 0);
});

test('spot on costs everyone else a die, or the caller one', () => {
  const base = table([[2, 2, 6], [2, 4, 1], [3, 5, 6]]);
  let s = ld.act(base, 0, bid(4, 2)); // 2, 2, 2 and a wild 1 = exactly four
  s = ld.act(s, 1, { type: 'spot' }, { rng: seeded(3) });
  assert.equal(s.last.correct, true);
  assert.deepEqual(s.counts, [2, 3, 2]);
  assert.equal(s.turn, 1, 'the successful caller starts');
  s = ld.act(base, 0, bid(3, 2));
  s = ld.act(s, 1, { type: 'spot' }, { rng: seeded(3) });
  assert.equal(s.last.correct, false);
  assert.deepEqual(s.counts, [3, 2, 3]);
  const noSpot = ld.act(table([[2], [3]], { spot: false }), 0, bid(1, 2));
  assert.throws(() => ld.act(noSpot, 1, { type: 'spot' }), /not allowed/);
});

test('losing your last die knocks you out; the last one standing wins', () => {
  let s = table([[3], [4, 4], [6]]);
  s = ld.act(s, 0, bid(3, 4)); // only two fours
  s = ld.act(s, 1, { type: 'liar' }, { rng: seeded(4) });
  assert.deepEqual(s.last.eliminated, [0]);
  assert.equal(s.counts[0], 0);
  assert.equal(s.turn, 1, 'the next player after the knocked-out one starts');
  assert.equal(s.dice[0].length, 0);
  // Play it out with computers.
  const rng = seeded(8);
  while (!ld.outcome(s)) s = ld.act(s, s.turn, ld.bot(s, s.turn, 'medium', { rng }), { rng });
  assert.equal(s.counts.filter((n) => n > 0).length, 1);
  assert.equal(ld.outcome(s).winners[0], s.counts.findIndex((n) => n > 0));
});

test('computer players only make legal moves', () => {
  for (const options of [{}, { wild: false, spot: false }, { dice: '3' }]) {
    for (let seed = 1; seed <= 15; seed++) {
      const rng = seeded(seed);
      const n = 2 + (seed % 5);
      const levels = ['easy', 'medium', 'hard'];
      let s = ld.setup({ players: n, options, rng });
      let steps = 0;
      while (!ld.outcome(s)) {
        const p = s.turn;
        s = ld.act(s, p, ld.bot(s, p, levels[(p + seed) % 3], { rng }), { rng });
        assert.ok(++steps < 3000);
      }
    }
  }
});

test('binomial helper', () => {
  assert.equal(ld.atLeast(5, 0, 0.5), 1);
  assert.equal(ld.atLeast(3, 4, 0.5), 0);
  assert.ok(Math.abs(ld.atLeast(3, 2, 0.5) - 0.5) < 1e-9);
});
