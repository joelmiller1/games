import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tetris, COLS, ROWS, TYPES, gravity } from '../public/js/arcade/tetris-core.js';
import { Snake } from '../public/js/arcade/snake-core.js';
import { Minefield, LEVELS } from '../public/js/arcade/minesweeper-core.js';
import { Asteroids } from '../public/js/arcade/asteroids-core.js';

// ---- Tetris ----

test('tetris: the same seed deals the same pieces, seven to a bag', () => {
  const a = new Tetris({ seed: 42 });
  const b = new Tetris({ seed: 42 });
  const seq = (t) => [t.piece.type, ...t.queue.slice(0, 13)].join('');
  assert.equal(seq(a), seq(b));
  assert.equal(new Set(seq(a).slice(0, 7)).size, 7, 'the first bag holds every piece once');
  assert.notEqual(seq(new Tetris({ seed: 43 })), seq(a));
  assert.deepEqual([...TYPES].sort(), ['I', 'J', 'L', 'O', 'S', 'T', 'Z']);
});

test('tetris: an I piece completing four rows scores a Tetris', () => {
  const t = new Tetris({ seed: 1, startLevel: 2 });
  // Fill the bottom four rows except column 0.
  for (let y = ROWS - 4; y < ROWS; y++) for (let x = 1; x < COLS; x++) t.board[y][x] = 'J';
  t.piece = { type: 'I', rot: 1, x: -2, y: 0 }; // vertical I in column 0
  assert.ok(t.fits(t.piece));
  t.drain();
  t.hardDrop();
  const clear = t.drain().find((e) => e.type === 'clear');
  assert.equal(clear.lines, 4);
  assert.equal(clear.label, 'Tetris');
  assert.equal(clear.points, 800 * 2);
  t.update(0.3);
  assert.equal(t.lines, 4);
  assert.ok(t.board.slice(ROWS - 4).every((row) => row.every((c) => c === null)), 'the rows collapsed');
});

test('tetris: hold works once per piece and swaps back', () => {
  const t = new Tetris({ seed: 5 });
  const first = t.piece.type;
  const next = t.queue[0];
  assert.ok(t.holdPiece());
  assert.equal(t.hold, first);
  assert.equal(t.piece.type, next);
  assert.equal(t.holdPiece(), false, 'only once until the piece locks');
  t.hardDrop();
  assert.ok(t.holdPiece());
  assert.equal(t.piece.type, first, 'the held piece comes back');
});

test('tetris: pieces fall with gravity, lock after a delay, and stacking out ends the game', () => {
  const t = new Tetris({ seed: 9 });
  const y0 = t.piece.y;
  t.update(gravity(1) * 3.5);
  assert.equal(t.piece.y, y0 + 3);
  let locks = 0;
  for (let i = 0; i < 20000 && !t.over; i++) {
    t.update(1 / 60);
    locks += t.drain().filter((e) => e.type === 'lock').length;
  }
  assert.ok(t.over, 'unattended pieces pile up to the top');
  assert.ok(locks > 10);
});

test('tetris: every tenth line raises the level', () => {
  const t = new Tetris({ seed: 2, startLevel: 1 });
  for (let n = 0; n < 3; n++) {
    for (let y = ROWS - 4; y < ROWS; y++) for (let x = 1; x < COLS; x++) t.board[y][x] = 'S';
    t.piece = { type: 'I', rot: 1, x: -2, y: 0 };
    t.hardDrop();
    t.update(0.3);
  }
  assert.equal(t.lines, 12);
  assert.equal(t.level, 2);
  assert.ok(t.drain().some((e) => e.type === 'levelup'));
});

// ---- Snake ----

test('snake: moves, eats, grows and speeds up', () => {
  const s = new Snake({ seed: 3, cols: 20, rows: 20 });
  const head = s.body[0];
  s.food = { x: head.x + 2, y: head.y };
  const speed = s.speed;
  s.update(1 / s.speed + 0.001);
  assert.deepEqual(s.body[0], { x: head.x + 1, y: head.y });
  s.update(1 / s.speed + 0.001);
  assert.equal(s.score, 10);
  assert.ok(s.speed > speed);
  s.update(1 / s.speed + 0.001);
  assert.equal(s.body.length, 4, 'one longer after eating');
  assert.ok(s.food && !s.occupied(s.food.x, s.food.y));
});

test('snake: reversing is ignored; walls kill unless they wrap', () => {
  const s = new Snake({ seed: 1, cols: 10, rows: 10 });
  assert.equal(s.turn(-1, 0), false, 'cannot reverse into yourself');
  assert.equal(s.turn(0, 1), true);
  s.food = { x: 0, y: 0 };
  for (let i = 0; i < 20 && !s.over; i++) s.update(1 / s.speed + 0.001);
  assert.ok(s.over, 'hit the bottom wall');
  const w = new Snake({ seed: 1, cols: 10, rows: 10, wrap: true });
  w.food = { x: 0, y: 0 };
  w.turn(0, 1);
  for (let i = 0; i < 15; i++) w.update(1 / w.speed + 0.001);
  assert.equal(w.over, false, 'wraps around instead');
});

test('snake: running into your own body ends the game', () => {
  const s = new Snake({ seed: 2, cols: 12, rows: 12 });
  s.body = [
    { x: 5, y: 5 },
    { x: 4, y: 5 },
    { x: 4, y: 6 },
    { x: 5, y: 6 },
    { x: 6, y: 6 },
    { x: 6, y: 5 },
  ];
  s.dir = { x: 1, y: 0 };
  s.food = { x: 0, y: 0 };
  s.turn(0, 1); // down into (5,6), which is body
  s.update(1 / s.speed + 0.001);
  assert.ok(s.over);
});

// ---- Minesweeper ----

test('minesweeper: the first click opens a safe area and mines are placed from the seed', () => {
  const { w, h, mines } = LEVELS.intermediate;
  const f = new Minefield({ w, h, mines, seed: 77 });
  const first = f.idx(8, 8);
  const opened = f.reveal(first);
  assert.ok(opened.length >= 9, 'an opening, not a single number');
  assert.equal(f.mine.reduce((a, b) => a + b, 0), mines);
  for (const j of [first, ...f.neighbours(first)]) assert.equal(f.mine[j], 0);
  const g = new Minefield({ w, h, mines, seed: 77 });
  g.reveal(first);
  assert.deepEqual([...g.mine], [...f.mine], 'same seed and first click: same minefield');
});

test('minesweeper: flags, chording and winning', () => {
  const f = new Minefield({ w: 5, h: 5, mines: 3, seed: 5 });
  f.reveal(f.idx(2, 2));
  // Flag every mine, then chord every number: the whole board opens.
  for (let i = 0; i < f.n; i++) if (f.mine[i]) f.toggleFlag(i);
  assert.equal(f.flags, 3);
  for (let pass = 0; pass < 5 && !f.won; pass++) {
    for (let i = 0; i < f.n; i++) if (f.open[i] && f.count[i]) f.chord(i);
  }
  assert.ok(f.won);
  assert.equal(f.progress(), 100);
  assert.equal(f.lost, false);
});

test('minesweeper: uncovering a mine loses', () => {
  const f = new Minefield({ w: 9, h: 9, mines: 10, seed: 3 });
  f.reveal(0);
  const mine = f.mine.findIndex((m) => m === 1);
  f.reveal(mine);
  assert.ok(f.lost);
  assert.equal(f.boom, mine);
  assert.deepEqual(f.reveal(1), [], 'nothing more happens after a loss');
});

// ---- Asteroids ----

test('asteroids: the same seed and inputs replay identically', () => {
  const run = () => {
    const g = new Asteroids({ seed: 11 });
    for (let i = 0; i < 1200; i++) g.update(1 / 120, { right: i % 240 < 120, fire: i % 30 === 0, thrust: i % 400 < 60 });
    return JSON.stringify({ score: g.score, rocks: g.rocks.map((r) => [Math.round(r.x), Math.round(r.y), r.size]) });
  };
  assert.equal(run(), run());
});

test('asteroids: a big rock splits in two and scores; extra ships every 10,000', () => {
  const g = new Asteroids({ seed: 4 });
  const n = g.rocks.length;
  g.splitRock(0, true);
  assert.equal(g.score, 20);
  assert.equal(g.rocks.length, n + 1);
  assert.equal(g.rocks.filter((r) => r.size === 2).length, 2);
  const lives = g.lives;
  g.addScore(10000);
  assert.equal(g.lives, lives + 1);
  assert.ok(g.drain().some((e) => e.type === 'extra'));
});

test('asteroids: an idle ship eventually loses all its lives', () => {
  const g = new Asteroids({ seed: 8 });
  let t = 0;
  while (!g.ended && t < 600) {
    g.update(1 / 60, {});
    t += 1 / 60;
  }
  assert.ok(g.ended);
  assert.equal(g.lives, 0);
});
