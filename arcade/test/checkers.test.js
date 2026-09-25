import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as ck from '../shared/games/checkers.js';
import { seeded } from '../shared/lib/rng.js';

const sq = (r, c) => r * 8 + c;
const empty = () => new Array(64).fill(0);

function stateWith(board, turn = 0, forcedCapture = true) {
  const s = ck.setup({ options: { forcedCapture } });
  s.board = board;
  s.turn = turn;
  s.keys = {};
  return s;
}

test('opening position has seven moves in standard notation', () => {
  const s = ck.setup({ options: {} });
  const moves = ck.legalMoves(s.board, 0).map(ck.moveText).sort();
  assert.deepEqual(moves, ['10-14', '10-15', '11-15', '11-16', '12-16', '9-13', '9-14']);
});

test('captures are mandatory and multi-jumps must be completed', () => {
  const b = empty();
  b[sq(5, 0)] = 1; // red man
  b[sq(4, 1)] = 3; // white man to jump
  b[sq(2, 3)] = 3; // second white man for a double jump
  b[sq(7, 6)] = 1; // another red man that could step
  const s = stateWith(b);
  const moves = ck.legalMoves(s.board, 0);
  assert.equal(moves.length, 1);
  assert.deepEqual(moves[0].path, [sq(5, 0), sq(3, 2), sq(1, 4)]);
  assert.deepEqual(moves[0].captures.sort((a, b) => a - b), [sq(2, 3), sq(4, 1)].sort((a, b) => a - b));
  assert.throws(() => ck.act(s, 0, { type: 'move', path: [sq(7, 6), sq(6, 5)] }), /must capture/);
  assert.throws(() => ck.act(s, 0, { type: 'move', path: [sq(5, 0), sq(3, 2)] }), /complete the jump/);
  const after = ck.act(s, 0, { type: 'move', path: [sq(5, 0), sq(3, 2), sq(1, 4)] });
  assert.equal(after.board[sq(4, 1)], 0);
  assert.equal(after.board[sq(2, 3)], 0);
  assert.equal(after.board[sq(1, 4)], 1);
});

test('optional captures when the rule is off', () => {
  const b = empty();
  b[sq(5, 0)] = 1;
  b[sq(4, 1)] = 3;
  b[sq(7, 6)] = 1;
  b[sq(0, 7)] = 3;
  const s = stateWith(b, 0, false);
  const moves = ck.legalMoves(s.board, 0, false);
  assert.ok(moves.some((m) => m.captures.length === 0));
  const after = ck.act(s, 0, { type: 'move', path: [sq(7, 6), sq(6, 5)] });
  assert.equal(after.board[sq(6, 5)], 1);
});

test('a man is crowned on the far row and the jump ends there', () => {
  const b = empty();
  b[sq(2, 1)] = 1; // red man close to the top
  b[sq(1, 2)] = 3; // white man: jump lands on row 0
  b[sq(1, 4)] = 3; // would allow a king to continue, but crowning ends the move
  b[sq(7, 0)] = 3;
  const s = stateWith(b);
  const moves = ck.legalMoves(s.board, 0);
  assert.deepEqual(moves.map((m) => m.path), [[sq(2, 1), sq(0, 3)]]);
  const after = ck.act(s, 0, { type: 'move', path: moves[0].path });
  assert.equal(after.board[sq(0, 3)], 2, 'crowned');
});

test('kings move and jump backwards', () => {
  const b = empty();
  b[sq(3, 4)] = 2; // red king
  b[sq(4, 5)] = 3; // white man behind it
  b[sq(0, 1)] = 3;
  const s = stateWith(b);
  const moves = ck.legalMoves(s.board, 0);
  assert.deepEqual(moves.map((m) => m.path), [[sq(3, 4), sq(5, 6)]]);
});

test('capturing the last piece wins', () => {
  const b = empty();
  b[sq(5, 2)] = 1;
  b[sq(4, 3)] = 3;
  const s = ck.act(stateWith(b), 0, { type: 'move', path: [sq(5, 2), sq(3, 4)] });
  assert.deepEqual(ck.outcome(s), { winners: [0], draw: false, reason: 'All pieces captured' });
});

test('a side with no legal moves loses', () => {
  const b = empty();
  b[sq(6, 7)] = 3; // white man on the edge, its only forward square is taken
  b[sq(7, 6)] = 1; // red man blocking it (and it cannot be jumped: landing is off the board)
  b[sq(5, 2)] = 1;
  const s = ck.act(stateWith(b), 0, { type: 'move', path: [sq(5, 2), sq(4, 3)] });
  assert.deepEqual(ck.outcome(s), { winners: [0], draw: false, reason: 'No legal moves left' });
});

test('draw offers can be made, declined and accepted', () => {
  let s = ck.setup({ options: {} });
  s = ck.act(s, 0, { type: 'offerDraw' });
  assert.deepEqual(ck.actors(s).sort(), [0, 1]);
  assert.throws(() => ck.act(s, 0, { type: 'acceptDraw' }), /no draw offer/);
  s = ck.act(s, 1, { type: 'declineDraw' });
  assert.equal(s.drawOffer, null);
  assert.throws(() => ck.act(s, 0, { type: 'offerDraw' }), /already offered/);
  s = ck.act(s, 0, { type: 'move', path: ck.legalMoves(s.board, 0)[0].path });
  s = ck.act(s, 1, { type: 'offerDraw' });
  s = ck.act(s, 0, { type: 'acceptDraw' });
  assert.equal(ck.outcome(s).draw, true);
});

function playGame(levels, seed, budget = 120) {
  const rng = seeded(seed);
  let s = ck.setup({ options: {} });
  let plies = 0;
  while (!ck.outcome(s) && plies < 300) {
    const p = s.turn;
    const a = ck.bot(s, p, levels[p], { rng, now: Date.now(), deadline: Date.now() + budget });
    s = ck.act(s, p, a);
    plies++;
  }
  return ck.outcome(s);
}

test('bots only play legal moves and hard beats easy', () => {
  let hard = 0;
  const games = 4;
  for (let seed = 1; seed <= games; seed++) {
    const hardSeat = seed % 2;
    const levels = hardSeat === 0 ? ['hard', 'easy'] : ['easy', 'hard'];
    const o = playGame(levels, seed);
    if (o && !o.draw && o.winners[0] === hardSeat) hard++;
  }
  assert.ok(hard >= 3, `hard only won ${hard}/${games}`);
});

test('bot answers draw offers', () => {
  const s = ck.act(ck.setup({ options: {} }), 0, { type: 'offerDraw' });
  const a = ck.bot(s, 1, 'hard', { rng: seeded(1), now: Date.now(), deadline: Date.now() + 100 });
  assert.equal(a.type, 'declineDraw');
});
