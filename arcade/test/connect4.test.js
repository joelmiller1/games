import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as c4 from '../shared/games/connect4.js';
import { seeded } from '../shared/lib/rng.js';

const drop = (col) => ({ type: 'drop', col });

function play(cols) {
  let s = c4.setup();
  for (const col of cols) s = c4.act(s, s.turn, drop(col));
  return s;
}

test('vertical win', () => {
  const s = play([0, 1, 0, 1, 0, 1, 0]);
  assert.deepEqual(c4.outcome(s).winners, [0]);
  assert.equal(s.line.length, 4);
});

test('diagonal win', () => {
  // Red builds a / diagonal from (0,0) to (3,3)
  const s = play([0, 1, 1, 2, 2, 3, 2, 3, 3, 6, 3]);
  assert.deepEqual(c4.outcome(s).winners, [0]);
});

test('full column is rejected', () => {
  const s = play([0, 0, 0, 0, 0, 0]);
  assert.throws(() => c4.act(s, s.turn, drop(0)), /full/);
});

test('draw on a full board without four in a row', () => {
  // Target board: colour depends on the column pair and the row, which never makes four.
  const color = (c, r) => ((Math.floor(c / 2) + r) % 2 === 0 ? 0 : 1);
  // Find an interleaving of column drops that alternates colours, starting with Red.
  const heights = Array(7).fill(0);
  const order = [];
  const dfs = (turn) => {
    if (order.length === 42) return true;
    for (let c = 0; c < 7; c++) {
      if (heights[c] < 6 && color(c, heights[c]) === turn) {
        heights[c]++;
        order.push(c);
        if (dfs(1 - turn)) return true;
        order.pop();
        heights[c]--;
      }
    }
    return false;
  };
  assert.ok(dfs(0));
  const s = play(order);
  assert.deepEqual(c4.outcome(s), { winners: [], draw: true, reason: 'The board is full' });
});

test('bot takes an immediate win and blocks an immediate loss', () => {
  const ctx = { rng: seeded(3), now: Date.now(), deadline: Date.now() + 300 };
  // Red (0) has three in column 0 and it is Red's turn.
  let s = play([0, 1, 0, 1, 0, 6]);
  for (const level of ['medium', 'hard']) assert.deepEqual(c4.bot(s, 0, level, ctx), drop(0));
  // Yellow to move must block column 0.
  s = play([0, 1, 0, 1, 0]);
  for (const level of ['medium', 'hard']) assert.deepEqual(c4.bot(s, 1, level, ctx), drop(0));
});

function game(levels, seed, budget = 150) {
  const rng = seeded(seed);
  let s = c4.setup();
  while (!c4.outcome(s)) {
    const p = s.turn;
    const a = c4.bot(s, p, levels[p], { rng, now: Date.now(), deadline: Date.now() + budget });
    s = c4.act(s, p, a);
  }
  return c4.outcome(s);
}

test('hard beats easy convincingly', () => {
  let hardWins = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const o = game(seed % 2 ? ['hard', 'easy'] : ['easy', 'hard'], seed);
    const hardSeat = seed % 2 ? 0 : 1;
    if (!o.draw && o.winners[0] === hardSeat) hardWins++;
  }
  assert.ok(hardWins >= 5, `hard won only ${hardWins}/6`);
});
