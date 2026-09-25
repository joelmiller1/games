import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tetris, minesweeper, snake } from '../shared/games/arcade.js';
import { boardFor, getGame, formatTime } from '../shared/games/meta.js';

test('points games: shared seed, rising scores, best score wins', () => {
  let s = tetris.setup({ players: 3, options: { start: '5' }, rng: () => 0.5 });
  const v = tetris.view(s);
  assert.equal(v.seed, Math.floor(0.5 * 2147483647));
  assert.deepEqual(v.options, { start: '5' });
  s = tetris.act(s, 0, { type: 'progress', score: 900, stat: 4 });
  assert.throws(() => tetris.act(s, 0, { type: 'progress', score: 800 }), /only go up/);
  assert.throws(() => tetris.act(s, 0, { type: 'progress', score: -1 }), /Invalid score/);
  s = tetris.act(s, 0, { type: 'finish', score: 1200, stat: 6 });
  s = tetris.act(s, 1, { type: 'finish', score: 5000, stat: 20 });
  assert.deepEqual(tetris.actors(s), [2]);
  s = tetris.forfeit(s, 2);
  const out = tetris.outcome(s);
  assert.deepEqual(out.winners, [1]);
  assert.deepEqual(out.scores, [1200, 5000, 0]);
  assert.equal(out.order, 'desc');
});

test('timed games: the fastest finisher wins and explosions do not count', () => {
  let s = minesweeper.setup({ players: 3, options: { level: 'expert' } });
  s = minesweeper.act(s, 0, { type: 'finish', score: 91000, stat: 100, ok: true });
  s = minesweeper.act(s, 1, { type: 'finish', score: 30000, stat: 40, ok: false });
  s = minesweeper.act(s, 2, { type: 'finish', score: 120000, stat: 100, ok: true });
  const out = minesweeper.outcome(s);
  assert.deepEqual(out.winners, [0]);
  assert.deepEqual(out.scores, [91000, null, 120000]);
  assert.equal(out.reason, `Fastest: ${formatTime(91000)}`);
});

test('timed games: if nobody finishes, the furthest wins; alone it is a loss', () => {
  let s = minesweeper.setup({ players: 2, options: {} });
  s = minesweeper.act(s, 0, { type: 'finish', score: 1000, stat: 30, ok: false });
  s = minesweeper.forfeit(s, 1);
  assert.deepEqual(minesweeper.outcome(s).winners, [0]);
  let solo = minesweeper.setup({ players: 1, options: {} });
  solo = minesweeper.act(solo, 0, { type: 'finish', score: 5000, stat: 12, ok: false });
  assert.deepEqual(minesweeper.outcome(solo).winners, []);
});

test('high score tables per variant', () => {
  assert.equal(boardFor(getGame('minesweeper'), { level: 'expert' }), 'minesweeper:expert');
  assert.equal(boardFor(getGame('minesweeper'), { level: 'bogus' }), 'minesweeper:beginner');
  assert.equal(boardFor(getGame('snake'), { walls: 'wrap' }), 'snake:wrap');
  assert.equal(boardFor(getGame('tetris'), { start: '10' }), 'tetris');
  assert.equal(boardFor(getGame('2048'), { time: '120' }), '2048:120');
  assert.equal(boardFor(getGame('2048'), {}), '2048:none');
  assert.equal(snake.setup({ players: 1, options: { walls: 'wrap' } }).options.walls, 'wrap');
});
