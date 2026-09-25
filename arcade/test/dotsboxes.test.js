import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../shared/games/dotsboxes.js';
import { seeded } from '../shared/lib/rng.js';

const line = (l) => ({ type: 'line', line: l });

test('geometry: lines and boxes of a 3×3 board', () => {
  const g = db.geometry(3);
  assert.equal(g.L, 24);
  assert.equal(g.boxLines.length, 9);
  assert.deepEqual(g.boxLines[0], [g.hIdx(0, 0), g.hIdx(1, 0), g.vIdx(0, 0), g.vIdx(0, 1)]);
  assert.equal(g.lineBoxes[g.hIdx(1, 0)].length, 2, 'inner line borders two boxes');
  assert.equal(g.lineBoxes[g.hIdx(0, 0)].length, 1, 'edge line borders one box');
});

test('closing a box scores it and gives another turn', () => {
  const g = db.geometry(3);
  let s = db.setup({ players: 2, options: { size: '3' } });
  s = db.act(s, 0, line(g.hIdx(0, 0)));
  s = db.act(s, 1, line(g.hIdx(1, 0)));
  s = db.act(s, 0, line(g.vIdx(0, 0)));
  assert.equal(s.turn, 1);
  s = db.act(s, 1, line(g.vIdx(0, 1)));
  assert.equal(s.boxes[0], 1);
  assert.deepEqual(s.scores, [0, 1]);
  assert.equal(s.turn, 1, 'the player who closed a box moves again');
  assert.deepEqual(s.last.boxes, [0]);
  assert.throws(() => db.act(s, 1, line(g.vIdx(0, 1))), /already drawn/);
  assert.throws(() => db.act(s, 0, line(0)), /not your turn/);
});

test('one line can close two boxes', () => {
  const g = db.geometry(3);
  let s = db.setup({ players: 2, options: { size: '3' } });
  const moves = [g.hIdx(0, 0), g.hIdx(0, 1), g.hIdx(1, 0), g.hIdx(1, 1), g.vIdx(0, 0), g.vIdx(0, 2)];
  for (const m of moves) s = db.act(s, s.turn, line(m));
  const who = s.turn;
  s = db.act(s, who, line(g.vIdx(0, 1)));
  assert.equal(s.scores[who], 2);
  assert.deepEqual(s.last.boxes.sort(), [0, 1]);
});

test('three players finish with every box claimed', () => {
  const rng = seeded(4);
  let s = db.setup({ players: 3, options: { size: '4' } });
  while (!db.outcome(s)) s = db.act(s, s.turn, db.bot(s, s.turn, 'medium', { rng, now: Date.now() }));
  assert.equal(s.scores.reduce((a, b) => a + b, 0), 16);
  const out = db.outcome(s);
  assert.ok(out.winners.every((w) => s.scores[w] === Math.max(...s.scores)));
});

test('a player leaving a three-player game is skipped', () => {
  let s = db.setup({ players: 3, options: { size: '3' } });
  s = db.forfeit(s, 0, 'left');
  assert.equal(s.turn, 1);
  s = db.act(s, 1, line(0));
  assert.equal(s.turn, 2);
  s = db.act(s, 2, line(1));
  assert.equal(s.turn, 1, 'player 0 is out');
  s = db.forfeit(s, 2, 'left too');
  assert.deepEqual(db.outcome(s).winners, [1]);
});

test('computers take free boxes and avoid giving them away', () => {
  const g = db.geometry(3);
  const rng = seeded(1);
  let s = db.setup({ players: 2, options: { size: '3' } });
  for (const m of [g.hIdx(0, 0), g.hIdx(1, 0), g.vIdx(0, 0)]) s = db.act(s, s.turn, line(m));
  for (const level of ['medium', 'hard']) {
    assert.deepEqual(db.bot(s, s.turn, level, { rng, now: Date.now() }), line(g.vIdx(0, 1)), `${level} takes the box`);
  }
  // Early on, medium never draws a box's third side.
  const fresh = db.setup({ players: 2, options: { size: '4' } });
  const a = db.bot(fresh, 0, 'medium', { rng, now: Date.now() });
  const after = db.act(fresh, 0, a);
  const g4 = db.geometry(4);
  assert.ok(g4.boxLines.every((ls) => ls.filter((l) => after.lines[l] !== -1).length < 3));
});

test('hard beats medium on small boards', () => {
  let hardWins = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const rng = seeded(seed * 17);
    const hardSeat = seed % 2;
    let s = db.setup({ players: 2, options: { size: '3' } });
    while (!db.outcome(s)) {
      const level = s.turn === hardSeat ? 'hard' : 'medium';
      s = db.act(s, s.turn, db.bot(s, s.turn, level, { rng, now: Date.now(), deadline: Date.now() + 500 }));
    }
    const out = db.outcome(s);
    if (!out.draw && out.winners[0] === hardSeat) hardWins++;
  }
  assert.ok(hardWins >= 5, `hard won ${hardWins} of 6`);
});
