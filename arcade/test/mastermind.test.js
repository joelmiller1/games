import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as mm from '../shared/games/mastermind.js';
import { seeded } from '../shared/lib/rng.js';

const guess = (code) => ({ type: 'guess', code });

test('feedback counts black and white pins, including repeated colours', () => {
  assert.deepEqual(mm.feedback([0, 1, 2, 3], [0, 1, 2, 3]), { black: 4, white: 0 });
  assert.deepEqual(mm.feedback([0, 1, 2, 3], [3, 2, 1, 0]), { black: 0, white: 4 });
  assert.deepEqual(mm.feedback([0, 0, 1, 1], [0, 1, 0, 2]), { black: 1, white: 2 });
  assert.deepEqual(mm.feedback([1, 1, 1, 1], [1, 2, 2, 2]), { black: 1, white: 0 });
  assert.deepEqual(mm.feedback([1, 2, 3, 4], [5, 5, 5, 5]), { black: 0, white: 0 });
});

test('solo: crack the code, the secret stays hidden until the end', () => {
  let s = mm.setup({ players: 1, options: { code: '4x6' }, rng: seeded(2) });
  assert.deepEqual(mm.actors(s), [0]);
  assert.equal(mm.view(s, 0).targets, null);
  const secret = s.targets[0];
  s = mm.act(s, 0, guess(secret.map((c) => (c + 1) % 6)));
  assert.equal(mm.outcome(s), null);
  s = mm.act(s, 0, guess(secret));
  assert.deepEqual(mm.outcome(s), { winners: [0], draw: false, reason: 'Cracked in 2 guesses' });
  assert.deepEqual(mm.view(s, 0).targets[0], secret);
});

test('solo: running out of guesses loses', () => {
  let s = mm.setup({ players: 1, options: { code: '4x6' }, rng: seeded(3) });
  const wrong = s.targets[0].map((c) => (c + 1) % 6);
  for (let i = 0; i < 10; i++) s = mm.act(s, 0, guess(wrong));
  assert.deepEqual(mm.outcome(s), { winners: [], draw: false, reason: 'Out of guesses' });
  assert.throws(() => mm.act(s, 0, guess(wrong)), /over/);
});

test('invalid guesses are rejected', () => {
  const s = mm.setup({ players: 1, options: { code: '5x8' }, rng: seeded(1) });
  assert.throws(() => mm.act(s, 0, guess([0, 1, 2, 3])), /Invalid/);
  assert.throws(() => mm.act(s, 0, guess([0, 1, 2, 3, 8])), /Invalid/);
  assert.throws(() => mm.act(s, 0, { type: 'guess', code: 'RGBYO' }), /Invalid/);
  assert.equal(mm.act(s, 0, guess([0, 1, 2, 3, 7])).guesses[0].length, 1);
});

test('two players: codes are secret and the second player answers in the same round', () => {
  let s = mm.setup({ players: 2, options: { code: '4x6' } });
  assert.deepEqual(mm.actors(s), [0, 1]);
  assert.throws(() => mm.act(s, 0, guess([0, 0, 0, 0])), /both codes/);
  s = mm.act(s, 0, { type: 'setCode', code: [1, 2, 3, 4] });
  assert.deepEqual(mm.actors(s), [1]);
  s = mm.act(s, 1, { type: 'setCode', code: [5, 5, 0, 0] });
  assert.equal(s.phase, 'playing');
  assert.deepEqual(mm.view(s, 0).myCode, [1, 2, 3, 4]);
  assert.deepEqual(mm.view(s, 1).myCode, [5, 5, 0, 0]);
  assert.equal(mm.view(s, null).targets, null, 'spectators do not see the codes');
  s = mm.act(s, 0, guess([5, 5, 0, 0]));
  assert.equal(mm.outcome(s), null, 'player 2 still gets their guess');
  assert.equal(s.turn, 1);
  const tie = mm.act(s, 1, guess([1, 2, 3, 4]));
  assert.deepEqual(mm.outcome(tie), { winners: [0, 1], draw: true, reason: 'Both cracked it in 1 guess' });
  const win = mm.act(s, 1, guess([1, 2, 3, 3]));
  assert.deepEqual(mm.outcome(win).winners, [0]);
});

test('the hard codebreaker cracks the classic code quickly', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const rng = seeded(seed);
    let s = mm.setup({ players: 1, options: { code: '4x6' }, rng });
    while (!mm.outcome(s)) s = mm.act(s, 0, mm.bot(s, 0, 'hard', { rng, now: Date.now() }));
    assert.deepEqual(mm.outcome(s).winners, [0]);
    assert.ok(s.guesses[0].length <= 6, `seed ${seed} took ${s.guesses[0].length}`);
  }
});

test('the computer sets a valid code and plays a two-player game to the end', () => {
  const rng = seeded(9);
  let s = mm.setup({ players: 2, options: { code: '5x8' } });
  while (!mm.outcome(s)) {
    const p = mm.actors(s)[0];
    s = mm.act(s, p, mm.bot(s, p, p === 0 ? 'hard' : 'easy', { rng, now: Date.now() }));
  }
  assert.ok(mm.outcome(s).winners.length >= 1);
});
