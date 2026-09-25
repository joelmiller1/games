import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as ttt from '../shared/games/tictactoe.js';
import { seeded } from '../shared/lib/rng.js';

const ctx = (seed = 1) => ({ rng: seeded(seed), now: Date.now() });

test('X wins with a row', () => {
  let s = ttt.setup();
  for (const [p, cell] of [[0, 0], [1, 3], [0, 1], [1, 4], [0, 2]]) s = ttt.act(s, p, { type: 'place', cell });
  assert.deepEqual(ttt.outcome(s).winners, [0]);
  assert.deepEqual(s.line, [0, 1, 2]);
  assert.deepEqual(ttt.actors(s), []);
});

test('rejects illegal moves', () => {
  const s = ttt.act(ttt.setup(), 0, { type: 'place', cell: 4 });
  assert.throws(() => ttt.act(s, 0, { type: 'place', cell: 0 }), /not your turn/);
  assert.throws(() => ttt.act(s, 1, { type: 'place', cell: 4 }), /taken/);
  assert.throws(() => ttt.act(s, 1, { type: 'place', cell: 9 }), /Invalid/);
});

test('draw when board is full', () => {
  let s = ttt.setup();
  // X O X / X O O / O X X
  const seq = [0, 1, 2, 4, 3, 5, 7, 6, 8];
  seq.forEach((cell, i) => (s = ttt.act(s, i % 2, { type: 'place', cell })));
  const o = ttt.outcome(s);
  assert.equal(o.draw, true);
});

function playOut(levels, seed) {
  const c = ctx(seed);
  let s = ttt.setup();
  while (!ttt.outcome(s)) {
    const p = s.turn;
    s = ttt.act(s, p, ttt.bot(s, p, levels[p], c));
  }
  return ttt.outcome(s);
}

test('hard bot never loses (vs random/easy/medium, either side)', () => {
  for (let seed = 1; seed <= 60; seed++) {
    for (const other of ['easy', 'medium']) {
      const a = playOut(['hard', other], seed);
      assert.ok(a.draw || a.winners[0] === 0, `hard as X lost to ${other} (seed ${seed})`);
      const b = playOut([other, 'hard'], seed);
      assert.ok(b.draw || b.winners[0] === 1, `hard as O lost to ${other} (seed ${seed})`);
    }
  }
});

test('hard vs hard is always a draw', () => {
  for (let seed = 1; seed <= 10; seed++) assert.equal(playOut(['hard', 'hard'], seed).draw, true);
});

test('forfeit awards the other player', () => {
  const s = ttt.forfeit(ttt.setup(), 0, 'Resigned');
  assert.deepEqual(ttt.outcome(s), { winners: [1], draw: false, reason: 'Resigned' });
});
