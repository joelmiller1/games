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

// ---- 2048 ----
import { Game2048 } from '../public/js/arcade/g2048-core.js';
import { Match3, SIZE as BJ_SIZE } from '../public/js/arcade/bejeweled-core.js';
import { Breakout, LEVELS as BO_LEVELS } from '../public/js/arcade/breakout-core.js';

function board2048(values) {
  const g = new Game2048({ seed: 1 });
  g.cells = values.map((v) => (v ? { id: g.nextId++, value: v } : null));
  g.best = Math.max(...values);
  return g;
}

test('2048: tiles slide and merge once per move, from the wall inwards', () => {
  const g = board2048([2, 2, 2, 0, 4, 4, 8, 0, 2, 2, 2, 2, 0, 0, 0, 0]);
  const res = g.move('left');
  const row = (r) => g.cells.slice(r * 4, r * 4 + 4).map((t) => t?.value ?? 0);
  assert.deepEqual(row(0).slice(0, 2), [4, 2]);
  assert.deepEqual(row(1).slice(0, 2), [8, 8], 'a merged tile does not merge again in the same move');
  assert.deepEqual(row(2).slice(0, 2), [4, 4]);
  assert.equal(res.gained, 4 + 8 + 4 + 4);
  assert.equal(g.score, 20);
  assert.equal(res.merged.length, 4);
  assert.ok(res.spawned, 'a new tile appears after a move');
  assert.equal(g.tiles().length, 6 + 1, 'ten tiles became six, plus the new one');
});

test('2048: a move that changes nothing is refused, and a full stuck board is game over', () => {
  const g = board2048([2, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 2]);
  assert.equal(g.canMove(), false);
  assert.equal(g.move('left'), null);
  const h = board2048([2, 4, 8, 16, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(h.move('left'), null, 'already packed to the left');
  assert.ok(h.move('down'));
});

test('2048: the same seed and moves give the same game; reaching 2048 is flagged once', () => {
  const play = () => {
    const g = new Game2048({ seed: 99 });
    for (let i = 0; i < 60; i++) g.move(['left', 'up', 'right', 'down'][i % 4]);
    return JSON.stringify(g.cells.map((t) => t?.value ?? 0)) + g.score;
  };
  assert.equal(play(), play());
  const g = board2048([1024, 1024, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const res = g.move('left');
  assert.equal(res.justWon, true);
  assert.equal(g.won, true);
  assert.equal(g.best, 2048);
});

// ---- Bejeweled ----

const at = (r, c) => r * BJ_SIZE + c;

/**
 * A board of colours 2–6 where no two neighbours match, so it has no lines and no moves.
 * `layout` puts other gems on it: cell -> colour, or [colour, special].
 */
function gems(layout = {}, seed = 1, mode = 'classic') {
  const g = new Match3({ seed, mode });
  g.board = Array.from({ length: BJ_SIZE * BJ_SIZE }, (_, i) => {
    const v = layout[i] ?? 2 + ((i % BJ_SIZE) + 2 * Math.floor(i / BJ_SIZE)) % 5;
    return Array.isArray(v) ? g.gem(v[0], v[1]) : g.gem(v);
  });
  return g;
}

const sorted = (cells) => [...cells].sort((a, b) => a - b);
const firstClear = (res) => res.steps.find((s) => s.type === 'clear');
const THREE = { [at(7, 0)]: 0, [at(7, 1)]: 0, [at(6, 2)]: 0 }; // one move: drop the 0 into row 7

test('bejeweled: a new board has no lines but has a move, and the same seed deals the same gems', () => {
  const colours = (g) => g.board.map((x) => x.color).join('');
  assert.equal(colours(new Match3({ seed: 7 })), colours(new Match3({ seed: 7 })));
  assert.notEqual(colours(new Match3({ seed: 8 })), colours(new Match3({ seed: 7 })));
  for (let seed = 1; seed <= 40; seed++) {
    const g = new Match3({ seed });
    assert.equal(g.groups().length, 0, `seed ${seed} starts with a line`);
    assert.ok(g.findMoves().length > 0, `seed ${seed} has no move`);
  }
  assert.equal(gems().hasMoves(), false);
  assert.equal(gems().hint(), null);
});

test('bejeweled: a swap that lines up three clears and refills; any other swap is undone', () => {
  const g = gems(THREE);
  assert.deepEqual(g.findMoves(), [[at(6, 2), at(7, 2)]]);
  assert.deepEqual(g.hint(), [at(6, 2), at(7, 2)]);
  const before = g.board.map((x) => x.id);
  const bad = g.swap(at(0, 0), at(0, 1));
  assert.equal(bad.valid, false);
  assert.deepEqual(bad.steps.map((s) => s.type), ['swap', 'swapback']);
  assert.deepEqual(g.board.map((x) => x.id), before, 'the board is unchanged');
  assert.equal(g.swap(at(0, 0), at(0, 2)), null, 'only neighbours swap');
  assert.equal(g.moves, 0);

  const res = g.swap(at(6, 2), at(7, 2));
  assert.equal(res.valid, true);
  const clear = firstClear(res);
  assert.deepEqual(sorted(clear.cells), [at(7, 0), at(7, 1), at(7, 2)]);
  assert.equal(clear.points, 50);
  assert.deepEqual(clear.created, []);
  const fall = res.steps.find((s) => s.type === 'fall');
  assert.equal(fall.spawns.length, 3, 'three new gems drop in');
  assert.ok(fall.spawns.every((s) => s.fromRow < 0));
  assert.equal(g.moves, 1);
  assert.ok(g.score >= 50);
  assert.ok(g.board.every(Boolean), 'the board is full again');
  assert.equal(g.groups().length, 0, 'nothing is left lined up');
});

test('bejeweled: four in a row makes a flame gem, five a hypercube and an L a star gem', () => {
  const four = firstClear(gems({ ...THREE, [at(7, 3)]: 0 }).swap(at(6, 2), at(7, 2)));
  assert.deepEqual(four.created.map(({ cell, color, special }) => ({ cell, color, special })), [{ cell: at(7, 2), color: 0, special: 'flame' }]);
  assert.deepEqual(sorted(four.cells), [at(7, 0), at(7, 1), at(7, 3)], 'the new gem takes the square the gem was moved to');
  assert.equal(four.points, 100);

  const five = firstClear(gems({ ...THREE, [at(7, 3)]: 0, [at(7, 4)]: 0 }).swap(at(6, 2), at(7, 2)));
  assert.equal(five.created[0].special, 'cube');
  assert.equal(five.created[0].color, null);

  const ell = gems({ [at(6, 2)]: 0, [at(6, 3)]: 0, [at(5, 1)]: 0, [at(4, 1)]: 0, [at(7, 1)]: 0 });
  const star = firstClear(ell.swap(at(7, 1), at(6, 1)));
  assert.deepEqual(star.created.map((c) => [c.cell, c.special]), [[at(6, 1), 'star']]);
  assert.equal(star.points, 150);
});

test('bejeweled: flame gems explode, star gems clear a row and column, hypercubes take a colour', () => {
  const line = { [at(4, 3)]: 0, [at(3, 5)]: 0 }; // swapping (3,5) down lines up (4,3) (4,4) (4,5)
  const flame = firstClear(gems({ ...line, [at(4, 4)]: [0, 'flame'] }).swap(at(3, 5), at(4, 5)));
  assert.deepEqual(flame.blasts.map((b) => [b.cell, b.kind]), [[at(4, 4), 'flame']]);
  assert.deepEqual(sorted(flame.cells), sorted([3, 4, 5].flatMap((r) => [at(r, 3), at(r, 4), at(r, 5)])));
  assert.equal(flame.points, 50 + 6 * 20);

  const star = firstClear(gems({ ...line, [at(4, 4)]: [0, 'star'] }).swap(at(3, 5), at(4, 5)));
  assert.equal(star.blasts[0].kind, 'star');
  assert.equal(star.cells.length, 15, 'row 4 and column 4');
  assert.ok(star.cells.includes(at(4, 0)) && star.cells.includes(at(0, 4)) && star.cells.includes(at(7, 4)));

  const g = gems({ [at(2, 2)]: [null, 'cube'] });
  const colour = g.board[at(2, 3)].color;
  const count = g.board.filter((x) => x.color === colour).length;
  const res = g.swap(at(2, 2), at(2, 3));
  assert.equal(res.valid, true, 'a hypercube swap needs no line');
  assert.deepEqual(res.steps.slice(0, 3).map((s) => s.type), ['swap', 'cube', 'clear']);
  assert.equal(res.steps[1].color, colour);
  assert.equal(res.steps[2].cells.length, count + 1, 'every gem of that colour, and the cube');

  const two = gems({ [at(2, 2)]: [null, 'cube'], [at(2, 3)]: [null, 'cube'] });
  assert.equal(firstClear(two.swap(at(2, 2), at(2, 3))).cells.length, BJ_SIZE * BJ_SIZE, 'two hypercubes clear the board');
});

test('bejeweled: gems that fall into a line cascade for more points', () => {
  // Clearing row 7 drops the 1s at (6,1) and (6,2) next to the 1 at (7,3).
  const g = gems({ [at(7, 1)]: 0, [at(7, 2)]: 0, [at(6, 0)]: 0, [at(6, 1)]: 1, [at(6, 2)]: 1, [at(7, 3)]: 1 });
  const res = g.swap(at(6, 0), at(7, 0));
  const clears = res.steps.filter((s) => s.type === 'clear');
  assert.ok(clears.length >= 2);
  assert.equal(clears[1].cascade, 2);
  for (const c of [at(7, 1), at(7, 2), at(7, 3)]) assert.ok(clears[1].cells.includes(c));
  assert.ok(clears[1].points >= 100, 'the second step of a cascade counts double');
  assert.ok(g.bestCascade >= 2);
});

test('bejeweled: filling the bar goes up a level, and every level multiplies the points', () => {
  const g = gems(THREE);
  g.progress = g.goal() - 10;
  const res = g.swap(at(6, 2), at(7, 2));
  const up = res.steps.find((s) => s.type === 'level');
  assert.deepEqual({ level: up.level, progress: up.progress, goal: up.goal }, { level: 2, progress: 40, goal: 1500 });
  assert.ok(g.level >= 2);
  const h = gems(THREE);
  h.level = 3;
  assert.equal(firstClear(h.swap(at(6, 2), at(7, 2))).points, 150);
});

test('bejeweled: with no move left, classic ends and blitz reshuffles', () => {
  const classic = gems(THREE);
  classic.hasMoves = () => false;
  const res = classic.swap(at(6, 2), at(7, 2));
  assert.equal(res.steps.at(-1).type, 'over');
  assert.equal(classic.over, true);
  assert.equal(classic.swap(at(0, 0), at(0, 1)), null, 'no more swaps');

  const blitz = gems(THREE, 1, 'blitz');
  let stuck = true;
  blitz.hasMoves = function () {
    if (stuck) return (stuck = false);
    return Match3.prototype.hasMoves.call(this);
  };
  const shuffle = blitz.swap(at(6, 2), at(7, 2)).steps.at(-1);
  assert.equal(shuffle.type, 'shuffle');
  assert.equal(blitz.over, false);
  assert.deepEqual(shuffle.gems.map((x) => x.id), blitz.board.map((x) => x.id));
  assert.equal(blitz.groups().length, 0);
  assert.ok(blitz.findMoves().length > 0, 'the shuffled board has a move');
});

// ---- Breakout ----

test('breakout: bricks score and break, and every level can be cleared', () => {
  const g = new Breakout({ seed: 1 });
  const n = g.bricks.length;
  const top = g.bricks[0];
  g.hitBrick(top);
  assert.equal(g.bricks.length, n - 1);
  assert.equal(g.score, 70, 'the top row is worth the most');
  for (const rows of BO_LEVELS) for (const row of rows) assert.equal(row.length, 12);
  g.bricks = g.bricks.filter((b) => b.hp === Infinity);
  g.update(1 / 120, {});
  assert.equal(g.level, 2, 'only unbreakable bricks left counts as cleared');
});

test('breakout: silver bricks take two hits; losing every ball costs a life', () => {
  const g = new Breakout({ seed: 2 });
  const silver = { x: 0, y: 0, w: 10, h: 10, kind: 'S', color: '#ccc', hp: 2 };
  g.bricks.push(silver);
  g.hitBrick(silver);
  assert.ok(g.bricks.includes(silver));
  g.hitBrick(silver);
  assert.ok(!g.bricks.includes(silver));
  const lives = g.lives;
  g.launch();
  g.balls[0].y = 900;
  g.update(1 / 120, {});
  assert.equal(g.lives, lives - 1);
  assert.ok(g.balls[0].stuck, 'a new ball waits on the paddle');
});

test('breakout: an automatic paddle keeps the ball in play and clears the first wall', () => {
  const g = new Breakout({ seed: 7 });
  const input = { launch: true };
  let t = 0;
  while (g.level === 1 && t < 600 && !g.over) {
    const b = g.balls.filter((x) => !x.stuck).sort((p, q) => q.y - p.y)[0];
    input.target = b ? b.x + Math.sin(t * 2) * 25 : 300;
    input.launch = true;
    g.update(1 / 120, input);
    t += 1 / 120;
  }
  assert.equal(g.over, false);
  assert.equal(g.level, 2);
});
