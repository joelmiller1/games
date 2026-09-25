import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as mc from '../shared/games/mancala.js';
import { seeded } from '../shared/lib/rng.js';

const sow = (pit) => ({ type: 'sow', pit });

test('setup honours the seeds option', () => {
  assert.deepEqual(mc.setup({ options: { seeds: '4' } }).pits, [4, 4, 4, 4, 4, 4, 0, 4, 4, 4, 4, 4, 4, 0]);
  assert.equal(mc.setup({ options: { seeds: '6' } }).pits[0], 6);
  assert.equal(mc.setup({ options: { seeds: 'nonsense' } }).pits[0], 4);
});

test('ending in your own store earns another turn', () => {
  let s = mc.setup({ options: { seeds: '4' } });
  s = mc.act(s, 0, sow(2)); // 3,4,5,store
  assert.equal(s.turn, 0);
  assert.equal(s.last.extra, true);
  assert.deepEqual(s.pits, [4, 4, 0, 5, 5, 5, 1, 4, 4, 4, 4, 4, 4, 0]);
  s = mc.act(s, 0, sow(5)); // 5 seeds: store, 7, 8, 9, 10
  assert.equal(s.turn, 1);
});

test('sowing skips the opponent store', () => {
  const s0 = mc.setup({ options: { seeds: '4' } });
  const pits = [0, 0, 0, 0, 0, 10, 0, 1, 1, 1, 1, 1, 1, 0];
  const s = mc.act({ ...s0, pits }, 0, sow(5));
  // 10 seeds: own store, pits 7..12, skip store 13, then pits 0, 1, 2.
  assert.equal(s.pits[13], 0, 'nothing in player 1 store');
  assert.deepEqual(s.last.path, [6, 7, 8, 9, 10, 11, 12, 0, 1, 2]);
  // The last seed landed in empty pit 2, capturing the two seeds opposite in pit 10.
  assert.deepEqual(s.last.capture, { pit: 2, from: 10, count: 3 });
  assert.equal(s.pits[6], 4);
});

test('landing in an empty pit of your own captures the opposite pit', () => {
  const s0 = mc.setup({ options: { seeds: '4' } });
  const pits = [1, 0, 3, 3, 3, 3, 0, 3, 3, 3, 3, 7, 3, 0];
  const s = mc.act({ ...s0, pits }, 0, sow(0)); // lands in pit 1 (empty); opposite is pit 11 with 7
  assert.deepEqual(s.last.capture, { pit: 1, from: 11, count: 8 });
  assert.equal(s.pits[6], 8);
  assert.equal(s.pits[1], 0);
  assert.equal(s.pits[11], 0);
  assert.equal(s.turn, 1);
});

test('the game ends when a side is empty and the rest is banked', () => {
  const s0 = mc.setup({ options: { seeds: '4' } });
  const pits = [0, 0, 0, 0, 0, 1, 20, 2, 0, 0, 0, 0, 3, 10];
  const s = mc.act({ ...s0, pits }, 0, sow(5)); // last seed into the store; side now empty
  assert.equal(s.pits[6], 21);
  assert.equal(s.pits[13], 15);
  assert.deepEqual(mc.outcome(s), { winners: [0], draw: false, reason: '21–15' });
  assert.equal(s.last.extra, false, 'no extra turn once the game is over');
});

test('illegal moves are rejected', () => {
  const s = mc.setup({ options: { seeds: '4' } });
  assert.throws(() => mc.act(s, 1, sow(8)), /not your turn/);
  assert.throws(() => mc.act(s, 0, sow(8)), /your own pits/);
  assert.throws(() => mc.act(s, 0, sow(6)), /your own pits/);
  const empty = { ...s, pits: [0, ...s.pits.slice(1)] };
  assert.throws(() => mc.act(empty, 0, sow(0)), /empty/);
});

test('computer players move legally and hard beats easy', () => {
  for (const [lv0, lv1, winner] of [
    ['hard', 'easy', 0],
    ['easy', 'hard', 1],
  ]) {
    let s = mc.setup({ options: { seeds: '4' } });
    const rng = seeded(3);
    while (!mc.outcome(s)) {
      const p = s.turn;
      const a = mc.bot(s, p, [lv0, lv1][p], { rng, now: Date.now(), deadline: Date.now() + 100 });
      assert.ok(mc.legalPits(s, p).includes(a.pit));
      s = mc.act(s, p, a);
      assert.equal(s.pits.reduce((x, y) => x + y, 0), 48, 'seeds are conserved');
    }
    assert.deepEqual(mc.outcome(s).winners, [winner]);
  }
});
