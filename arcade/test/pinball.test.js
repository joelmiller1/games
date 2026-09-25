import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../public/js/pinball/physics.js';
import { PinballRules, STEP } from '../public/js/pinball/rules.js';
import * as scoreAttack from '../shared/games/pinball.js';
import { seeded } from '../shared/lib/rng.js';

test('a ball bounces off a floor and loses energy', () => {
  const w = new World({ gravity: 1000 });
  w.segment(0, 100, 200, 100, { e: 0.5 });
  const b = w.addBall(100, 50, 0, 0);
  let minY = Infinity;
  let bounced = false;
  for (let i = 0; i < 2000; i++) {
    w.step(1 / 960);
    if (b.vy < 0) bounced = true;
    if (bounced) minY = Math.min(minY, b.y);
    assert.ok(b.y <= 100 - b.r + 0.5, 'ball never sinks into the floor');
  }
  assert.ok(bounced);
  assert.ok(minY > 50, 'bounce is lower than the drop height');
});

test('fast balls do not tunnel through thin walls', () => {
  const w = new World({ gravity: 0 });
  w.segment(100, 0, 100, 200);
  const b = w.addBall(50, 100, 2800, 0);
  for (let i = 0; i < 200; i++) w.step(1 / 960);
  assert.ok(b.x < 100, `ball at x=${b.x}`);
  assert.ok(b.vx < 0, 'ball bounced back');
});

test('a swinging flipper launches the ball', () => {
  const w = new World({ gravity: 1300 });
  const f = w.flipper({ side: 'left', x: 100, y: 300, length: 80, rest: 0.5, active: -0.5 });
  const b = w.addBall(150, 300, 0, 0);
  for (let i = 0; i < 100; i++) w.step(1 / 960); // let it settle on the flipper
  f.pressed = true;
  let maxUp = 0;
  for (let i = 0; i < 300; i++) {
    w.step(1 / 960);
    maxUp = Math.max(maxUp, -b.vy);
  }
  assert.ok(maxUp > 700, `upward speed ${maxUp}`);
});

test('one-way segments only block from the front', () => {
  const w = new World({ gravity: 0 });
  w.segment(0, 100, 200, 100, { oneWay: [0, -1] });
  const up = w.addBall(100, 150, 0, -800); // from behind: passes through
  const down = w.addBall(60, 40, 0, 800); // from the front: bounces
  for (let i = 0; i < 400; i++) w.step(1 / 960);
  assert.ok(up.y < 80, 'passes through from behind');
  assert.ok(down.y < 100 && down.vy < 0, 'blocked from the front');
});

function simulate(seed, seconds = 900) {
  const rng = seeded(seed);
  const r = new PinballRules({ players: ['A', 'B'], balls: 2, random: rng });
  let t = 0;
  let charge = 0;
  let worstStill = 0;
  const still = new Map();
  let holdL = 0;
  let holdR = 0;
  while (r.phase !== 'over' && t < seconds) {
    if (r.world.balls.some((b) => !b.lost && b.x > 541 && b.y > 880 && Math.abs(b.vy) < 60)) {
      if (!r.plunger.charging) {
        r.setPlunger(true);
        charge = 0.2 + rng() * 0.8;
      } else if (r.plunger.charge >= charge) r.setPlunger(false);
    }
    let left = false;
    let right = false;
    for (const b of r.world.balls) {
      if (b.lost || b.held) continue;
      if (b.y > 820 && b.y < 925 && b.vy > 80) {
        if (b.x < 280 && b.x > 150) left = true;
        if (b.x >= 280 && b.x < 410) right = true;
      }
    }
    holdL = left ? holdL + STEP : 0;
    holdR = right ? holdR + STEP : 0;
    r.setFlipper('left', left && holdL < 0.25);
    r.setFlipper('right', right && holdR < 0.25);
    r.update(STEP);
    t += STEP;
    for (const b of r.world.balls) {
      if (b.lost) continue;
      assert.ok(b.x > 5 && b.x < 595 && b.y > 0, `ball escaped the table at ${b.x},${b.y}`);
      const moving = Math.hypot(b.vx, b.vy) > 8 || b.held || (b.x > 541 && b.y > 880);
      const s = moving ? 0 : (still.get(b.id) || 0) + STEP;
      still.set(b.id, s);
      worstStill = Math.max(worstStill, s);
    }
  }
  return { r, t, worstStill };
}

test('simulated games always finish without stuck or escaped balls', () => {
  for (let seed = 1; seed <= 6; seed++) {
    const { r, worstStill } = simulate(seed);
    assert.equal(r.phase, 'over', `game ${seed} finished`);
    assert.ok(worstStill < 2, `ball sat still for ${worstStill}s in game ${seed}`);
    assert.ok(r.players.every((p) => p.done));
    assert.ok(r.players.some((p) => p.score > 0));
  }
});

test('score attack engine: progress, finish and ranking', () => {
  let s = scoreAttack.setup({ players: 2, options: { balls: '3' } });
  assert.deepEqual(scoreAttack.actors(s), [0, 1]);
  s = scoreAttack.act(s, 0, { type: 'progress', score: 1000, stat: 2 });
  assert.equal(scoreAttack.view(s).players[0].stat, 2);
  assert.throws(() => scoreAttack.act(s, 0, { type: 'progress', score: 500 }), /only go up/);
  s = scoreAttack.act(s, 1, { type: 'finish', score: 4000 });
  assert.deepEqual(scoreAttack.actors(s), [0]);
  assert.equal(scoreAttack.outcome(s), null);
  s = scoreAttack.act(s, 0, { type: 'finish', score: 3000 });
  assert.deepEqual(scoreAttack.outcome(s).winners, [1]);
});
