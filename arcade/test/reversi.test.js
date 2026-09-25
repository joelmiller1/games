import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as rv from '../shared/games/reversi.js';
import { seeded } from '../shared/lib/rng.js';

const place = (sq) => ({ type: 'place', sq });
const sq = (name) => (Number(name[1]) - 1) * 8 + 'abcdefgh'.indexOf(name[0]);

test('opening position and legal moves', () => {
  const s = rv.setup();
  assert.deepEqual(rv.counts(s.board), [2, 2]);
  assert.deepEqual(rv.legalMoves(s.board, 0).sort((a, b) => a - b), ['d3', 'c4', 'f5', 'e6'].map(sq).sort((a, b) => a - b));
  assert.deepEqual(rv.view(s).legal.length, 4);
});

test('a move flips the outflanked discs', () => {
  let s = rv.setup();
  s = rv.act(s, 0, place(sq('d3')));
  assert.equal(s.board[sq('d4')], 0, 'd4 flipped to black');
  assert.deepEqual(rv.counts(s.board), [4, 1]);
  assert.deepEqual(s.last.flips, [sq('d4')]);
  assert.equal(s.turn, 1);
  assert.deepEqual(s.moves, ['d3']);
});

test('illegal moves are rejected', () => {
  const s = rv.setup();
  assert.throws(() => rv.act(s, 1, place(sq('d3'))), /not your turn/);
  assert.throws(() => rv.act(s, 0, place(sq('a1'))), /flip at least one/);
  assert.throws(() => rv.act(s, 0, place(sq('d4'))), /taken/);
  assert.throws(() => rv.act(s, 0, place(64)), /Invalid square/);
});

test('a player with no moves passes, and the game ends when nobody can move', () => {
  // Rows 1 and 5: an empty edge square, one white disc, then black to the far edge.
  // Black can outflank either white disc; White can never move.
  const board = Array(64).fill(-1);
  for (const row of ['1', '5']) {
    board[sq('b' + row)] = 1;
    for (const f of 'cdefgh') board[sq(f + row)] = 0;
  }
  let s = { ...rv.setup(), board };
  s = rv.act(s, 0, place(sq('a1')));
  assert.equal(s.turn, 0, 'White has no move, so Black goes again');
  assert.equal(s.passed, 1);
  assert.deepEqual(s.moves, ['a1', 'pass']);
  assert.equal(rv.outcome(s), null);
  s = rv.act(s, 0, place(sq('a5')));
  assert.deepEqual(rv.outcome(s), { winners: [0], draw: false, reason: '16–0' });
});

test('resigning hands the game to the opponent', () => {
  const s = rv.forfeit(rv.setup(), 0, 'Black resigned');
  assert.deepEqual(rv.outcome(s), { winners: [1], draw: false, reason: 'Black resigned' });
});

test('the endgame search matches brute force on a small position', () => {
  // Fill most of the board pseudo-randomly by playing random legal moves, then solve.
  const rng = seeded(11);
  let s = rv.setup();
  while (rv.counts(s.board)[0] + rv.counts(s.board)[1] < 57 && !rv.outcome(s)) {
    const moves = rv.legalMoves(s.board, s.turn);
    s = rv.act(s, s.turn, place(moves[Math.floor(rng() * moves.length)]));
  }
  if (rv.outcome(s)) return;
  const brute = (st) => {
    const out = rv.outcome(st);
    if (out) {
      const [b, w] = rv.counts(st.board);
      return st.turn === 0 ? b - w : w - b; // from the side "to move" at the end (turn unchanged at end)
    }
    let best = -Infinity;
    for (const m of rv.legalMoves(st.board, st.turn)) {
      const next = rv.act(st, st.turn, place(m));
      const [b, w] = rv.counts(next.board);
      let v;
      if (rv.outcome(next)) v = st.turn === 0 ? b - w : w - b;
      else if (next.turn === st.turn) v = brute(next);
      else v = -brute(next);
      if (v > best) best = v;
    }
    return best;
  };
  const exact = brute(s);
  const srch = new rv.Searcher(s.board, s.turn);
  const move = srch.think(64, Date.now() + 5000);
  const after = rv.act(s, s.turn, place(move));
  let v;
  const [b, w] = rv.counts(after.board);
  if (rv.outcome(after)) v = s.turn === 0 ? b - w : w - b;
  else if (after.turn === s.turn) v = brute(after);
  else v = -brute(after);
  assert.equal(v, exact, 'the searched move is optimal');
});

test('computer players always move legally and hard beats easy', () => {
  for (const [lv0, lv1, winner] of [
    ['hard', 'easy', 0],
    ['easy', 'hard', 1],
  ]) {
    let s = rv.setup();
    const rng = seeded(5);
    const lv = [lv0, lv1];
    while (!rv.outcome(s)) {
      const a = rv.bot(s, s.turn, lv[s.turn], { rng, now: Date.now(), deadline: Date.now() + 150 });
      assert.ok(rv.legalMoves(s.board, s.turn).includes(a.sq));
      s = rv.act(s, s.turn, a);
    }
    assert.deepEqual(rv.outcome(s).winners, [winner]);
  }
});
