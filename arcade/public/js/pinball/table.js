// Table layout for the "Arcade Nights" pinball table (logical size 600 x 1000, y grows downwards).
import { World } from './physics.js';

export const W = 600;
export const H = 1000;
export const LANE_X = 560; // shooter lane centre
export const PLUNGER_Y = 952; // top of the plunger (lane floor)
export const DRAIN_Y = 1040;

const mirror = (x) => 560 - x;

export function buildTable() {
  const world = new World({ gravity: 1300 });
  const t = { world, walls: [], lanes: [], drops: [], bumpers: [], slings: [], posts: [], decor: [] };
  const wall = (pts, opts) => t.walls.push(...world.polyline(pts, opts));
  const post = (x, y, r = 5, opts = {}) => {
    const c = world.circle(x, y, r, { kind: 'post', e: 0.5, ...opts });
    t.posts.push(c);
    return c;
  };

  // Outer shell: top arc, left wall, shooter lane.
  t.walls.push(...world.arc(300, 290, 280, Math.PI, 2 * Math.PI, 48, { e: 0.3, friction: 0.004 }));
  wall([[20, 290], [20, 1060]]);
  wall([[580, 290], [580, 1060]]);
  wall([[540, 1060], [540, 246]]);
  post(540, 246, 2.5);
  // One-way gate: the ball leaves the shooter lane but cannot fall back into it.
  t.gate = world.segment(580, 213, 540, 243, { kind: 'gate', e: 0.3, oneWay: [-0.6, -0.8] });
  t.plunger = world.segment(540, PLUNGER_Y, 580, PLUNGER_Y, { kind: 'plungerTop', e: 0.05 });

  // Orbit exit: deflects balls coming round the top arc into the playfield instead of down the left wall.
  const exitA = [300 + 280 * Math.cos(Math.PI * 1.11), 290 + 280 * Math.sin(Math.PI * 1.11)];
  wall([exitA, [98, 280]], { e: 0.35 });
  post(98, 280, 5);

  // Top rollover lanes with separators.
  for (const x of [200, 260, 320, 380]) {
    wall([[x, 64], [x, 118]], { e: 0.4 });
    post(x, 64, 4);
    post(x, 118, 4);
  }
  for (const [i, x] of [230, 290, 350].entries()) t.lanes.push(world.sensor(x, 96, 10, { kind: 'lane', data: { index: i } }));

  // Pop bumpers.
  for (const [x, y] of [[205, 245], [355, 245], [280, 332]]) {
    t.bumpers.push(world.circle(x, y, 26, { kind: 'bumper', e: 0.85, kick: 520 }));
  }

  // Drop target bank on the left wall.
  for (let i = 0; i < 4; i++) {
    const y0 = 392 + i * 40;
    t.drops.push(world.segment(33, y0, 33, y0 + 32, { kind: 'drop', e: 0.35, oneWay: [1, 0], data: { index: i } }));
  }

  // Kick-out saucer on the right with a curved backstop.
  t.saucer = world.sensor(476, 440, 13, { kind: 'saucer' });
  t.walls.push(...world.arc(476, 440, 32, -Math.PI / 2.2, Math.PI / 2.6, 8, { e: 0.35 }));

  // Mid-field posts.
  post(128, 600, 7, { e: 0.6 });
  post(mirror(128), 600, 7, { e: 0.6 });

  // Lower playfield, left side then mirrored: inlane guide, slingshot.
  for (const side of [0, 1]) {
    const X = side ? mirror : (x) => x;
    // The guide runs in line with the flipper's top edge so the ball rolls straight onto it
    // (a kink here leaves a pocket where a slow ball can come to rest).
    const guide = [[58, 700], [58, 784], [189, 870.3]].map(([x, y]) => [X(x), y]);
    wall(guide, { e: 0.3 });
    post(X(58), 700, 6);
    const A = [X(98), 690];
    const B = [X(98), 775];
    const C = [X(160), 815];
    wall([A, B, C], { e: 0.3 });
    const sling = world.segment(...(side ? [...C, ...A] : [...A, ...C]), { kind: 'sling', e: 0.6, kick: 620, data: { side } });
    t.slings.push(sling);
    post(A[0], A[1], 5);
    post(B[0], B[1], 5);
    post(C[0], C[1], 5);
  }

  // Kickback in the left outlane.
  t.kickback = world.sensor(39, 950, 14, { kind: 'kickback' });

  // Flippers.
  t.leftFlipper = world.flipper({ side: 'left', x: 185, y: 882, length: 82, rest: 0.52, active: -0.5 });
  t.rightFlipper = world.flipper({ side: 'right', x: mirror(185), y: 882, length: 82, rest: Math.PI - 0.52, active: Math.PI + 0.5 });

  return t;
}

/** Is the ball resting in the shooter lane, ready to be plunged? */
export function onPlunger(ball) {
  return ball.x > 541 && ball.y > PLUNGER_Y - 60 && Math.abs(ball.vy) < 60;
}
