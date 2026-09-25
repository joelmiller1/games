// Breakout simulation, independent of the screen: paddle, balls, a wall of bricks per level and
// falling power-up capsules.
import { seeded } from './rng.js';

export const W = 600;
export const H = 800;
const TOP = 56; // the ceiling (the score bar sits above it)
const COLS = 12;
const GAP = 4;
const MARGIN = 20;
const BRICK_W = (W - MARGIN * 2 - GAP * (COLS - 1)) / COLS;
const BRICK_H = 20;
const ROW0 = 112;
const PADDLE_Y = 742;
const PADDLE_H = 14;
const BALL_R = 7;
const MAX_SPEED = 820;

// Letters: row colours (points), S = strong (two hits), X = gold (unbreakable), . = empty.
const COLORS = { R: '#ef4444', O: '#f97316', Y: '#facc15', G: '#22c55e', C: '#06b6d4', B: '#3b82f6', P: '#a855f7', S: '#cbd5e1', X: '#eab308' };
const POINTS = { R: 70, O: 60, Y: 50, G: 40, C: 30, B: 20, P: 10, S: 50, X: 0 };
export const LEVELS = [
  ['RRRRRRRRRRRR', 'OOOOOOOOOOOO', 'YYYYYYYYYYYY', 'GGGGGGGGGGGG', 'CCCCCCCCCCCC', 'BBBBBBBBBBBB'],
  ['....RRRR....', '...OOOOOO...', '..YYYYYYYY..', '.GGGGGGGGGG.', 'CCCCCCCCCCCC', 'BBBBBBBBBBBB', 'PPPPPPPPPPPP'],
  ['SSSSSSSSSSSS', 'R.R.R.R.R.R.', '.O.O.O.O.O.O', 'YYYYYYYYYYYY', 'X..GGGGGG..X', 'CCCCCCCCCCCC', 'BB..BBBB..BB'],
  ['PPP......PPP', 'BBBSS..SSBBB', 'CCCCSSSSCCCC', '.GGGGGGGGGG.', '..YYYXXYYY..', '...OOOOOO...', '....RRRR....'],
  ['RSRSRSRSRSRS', 'OOOOOOOOOOOO', 'X.YYYY.YYYY.', 'GGGGGGGGGGGG', 'CSCSCSCSCSCS', 'BBBBBBBBBBBB', '.PPPPXXPPPP.'],
];
const POWERS = ['wide', 'multi', 'slow', 'wide', 'multi', 'slow', 'life'];

export class Breakout {
  constructor({ seed = 1 } = {}) {
    this.rng = seeded(seed);
    this.score = 0;
    this.lives = 3;
    this.level = 0;
    this.hits = 0;
    this.paddle = { x: W / 2, w: 96, vx: 0 };
    this.balls = [];
    this.bricks = [];
    this.capsules = [];
    this.particles = [];
    this.events = [];
    this.wideT = 0;
    this.slowT = 0;
    this.over = false;
    this.ended = false;
    this.endT = 0;
    this.pause = 0; // short breather after losing a ball or clearing a wall
    this.time = 0;
    this.nextLevel();
  }

  emit(type, extra = {}) {
    this.events.push({ type, ...extra });
  }

  drain() {
    const e = this.events;
    this.events = [];
    return e;
  }

  nextLevel() {
    this.level++;
    const rows = LEVELS[(this.level - 1) % LEVELS.length];
    this.bricks = [];
    rows.forEach((row, r) => {
      [...row].forEach((ch, c) => {
        if (ch === '.') return;
        this.bricks.push({
          x: MARGIN + c * (BRICK_W + GAP),
          y: ROW0 + r * (BRICK_H + GAP),
          w: BRICK_W,
          h: BRICK_H,
          kind: ch,
          color: COLORS[ch],
          hp: ch === 'S' ? 2 : ch === 'X' ? Infinity : 1,
        });
      });
    });
    this.capsules = [];
    this.balls = [];
    this.serve();
    if (this.level > 1) this.pause = 1.2;
    this.emit('level', { level: this.level });
  }

  baseSpeed() {
    return Math.min(MAX_SPEED, 360 + (this.level - 1) * 30 + this.hits * 2.2);
  }

  /** Put a ball on the paddle, waiting to be launched. */
  serve() {
    this.balls = [{ x: this.paddle.x, y: PADDLE_Y - PADDLE_H / 2 - BALL_R - 1, vx: 0, vy: 0, stuck: true, offset: 0 }];
  }

  launch() {
    for (const b of this.balls) {
      if (!b.stuck) continue;
      b.stuck = false;
      const angle = -Math.PI / 2 + (this.rng() - 0.5) * 0.9 + Math.max(-0.4, Math.min(0.4, this.paddle.vx / 2000));
      const sp = this.speed();
      b.vx = Math.cos(angle) * sp;
      b.vy = Math.sin(angle) * sp;
      this.emit('launch');
    }
  }

  speed() {
    return this.baseSpeed() * (this.slowT > 0 ? 0.68 : 1);
  }

  get breakable() {
    return this.bricks.filter((b) => b.hp !== Infinity).length;
  }

  burst(x, y, color, n = 10) {
    for (let i = 0; i < n; i++) {
      const a = this.rng() * Math.PI * 2;
      const v = 60 + this.rng() * 160;
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, life: 0.5 + this.rng() * 0.4, max: 0.9, color });
    }
  }

  hitBrick(brick) {
    if (brick.hp === Infinity) {
      this.emit('gold');
      return;
    }
    brick.hp--;
    this.hits++;
    if (brick.hp > 0) {
      this.emit('crack');
      return;
    }
    this.bricks.splice(this.bricks.indexOf(brick), 1);
    this.score += POINTS[brick.kind] * (1 + Math.floor((this.level - 1) / LEVELS.length));
    this.burst(brick.x + brick.w / 2, brick.y + brick.h / 2, brick.color);
    this.emit('brick', { kind: brick.kind });
    if (this.rng() < 0.13 && this.capsules.length < 3) {
      const kind = POWERS[Math.floor(this.rng() * POWERS.length)];
      this.capsules.push({ x: brick.x + brick.w / 2, y: brick.y + brick.h / 2, kind });
    }
    // Keep every ball at the (slowly rising) current speed.
    for (const b of this.balls) if (!b.stuck) this.setSpeed(b, this.speed());
  }

  setSpeed(b, sp) {
    const cur = Math.hypot(b.vx, b.vy) || 1;
    b.vx *= sp / cur;
    b.vy *= sp / cur;
  }

  power(kind) {
    if (kind === 'wide') this.wideT = 15;
    else if (kind === 'slow') {
      this.slowT = 10;
      for (const b of this.balls) if (!b.stuck) this.setSpeed(b, this.speed());
    } else if (kind === 'life') this.lives++;
    else if (kind === 'multi') {
      const src = this.balls.find((b) => !b.stuck) || this.balls[0];
      if (!src) return;
      if (src.stuck) this.launch();
      const sp = this.speed();
      for (const turn of [-0.45, 0.45]) {
        const a = Math.atan2(src.vy, src.vx) + turn;
        this.balls.push({ x: src.x, y: src.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, stuck: false });
      }
    }
    this.emit('power', { kind });
  }

  /** input: { target: world x under the pointer or null, dir: -1/0/1 from keys, launch: bool (consumed) } */
  update(dt, input = {}) {
    this.time += dt;
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 500 * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    if (this.over) {
      this.endT += dt;
      if (this.endT > 1.6) this.ended = true;
      return;
    }
    // paddle
    const pad = this.paddle;
    const targetW = this.wideT > 0 ? 150 : 96;
    pad.w += (targetW - pad.w) * Math.min(1, dt * 10);
    const before = pad.x;
    if (typeof input.target === 'number') pad.x += (input.target - pad.x) * Math.min(1, dt * 22);
    else if (input.dir) pad.x += input.dir * 720 * dt;
    pad.x = Math.max(pad.w / 2 + 8, Math.min(W - pad.w / 2 - 8, pad.x));
    pad.vx = (pad.x - before) / dt;
    this.wideT = Math.max(0, this.wideT - dt);
    const wasSlow = this.slowT > 0;
    this.slowT = Math.max(0, this.slowT - dt);
    if (wasSlow && this.slowT === 0) for (const b of this.balls) if (!b.stuck) this.setSpeed(b, this.speed());

    if (this.pause > 0) {
      this.pause -= dt;
      for (const b of this.balls) if (b.stuck) b.x = pad.x + (b.offset || 0);
      input.launch = false;
      return;
    }
    if (input.launch) {
      this.launch();
      input.launch = false;
    }

    // capsules
    for (const c of this.capsules) c.y += 150 * dt;
    this.capsules = this.capsules.filter((c) => {
      if (c.y > PADDLE_Y - PADDLE_H && c.y < PADDLE_Y + PADDLE_H && Math.abs(c.x - pad.x) < pad.w / 2 + 14) {
        this.power(c.kind);
        return false;
      }
      return c.y < H + 20;
    });

    // balls, in small steps so fast balls never skip through a brick
    const steps = 3;
    for (let s = 0; s < steps; s++) for (const b of this.balls) this.moveBall(b, dt / steps);
    const lost = this.balls.filter((b) => b.y - BALL_R > H);
    if (lost.length) {
      this.balls = this.balls.filter((b) => b.y - BALL_R <= H);
      if (!this.balls.length) {
        this.lives--;
        this.wideT = 0;
        this.slowT = 0;
        this.capsules = [];
        this.emit('lost');
        if (this.lives <= 0) {
          this.over = true;
          this.emit('gameover');
        } else {
          this.serve();
          this.pause = 0.8;
        }
      }
    }
    if (!this.over && this.breakable === 0) {
      this.emit('cleared');
      this.score += 500 * this.level;
      this.nextLevel();
    }
  }

  moveBall(b, dt) {
    const pad = this.paddle;
    if (b.stuck) {
      b.x = pad.x + (b.offset || 0);
      b.y = PADDLE_Y - PADDLE_H / 2 - BALL_R - 1;
      return;
    }
    const px = b.x;
    const py = b.y;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    // walls
    if (b.x < BALL_R) {
      b.x = BALL_R;
      b.vx = Math.abs(b.vx);
      this.emit('wall');
    } else if (b.x > W - BALL_R) {
      b.x = W - BALL_R;
      b.vx = -Math.abs(b.vx);
      this.emit('wall');
    }
    if (b.y < TOP + BALL_R) {
      b.y = TOP + BALL_R;
      b.vy = Math.abs(b.vy);
      this.emit('wall');
    }
    // paddle: angle depends on where the ball lands
    const top = PADDLE_Y - PADDLE_H / 2;
    if (b.vy > 0 && py + BALL_R <= top + 1 && b.y + BALL_R >= top && Math.abs(b.x - pad.x) <= pad.w / 2 + BALL_R) {
      const off = Math.max(-1, Math.min(1, (b.x - pad.x) / (pad.w / 2)));
      const a = -Math.PI / 2 + off * 1.05;
      const sp = this.speed();
      b.vx = Math.cos(a) * sp;
      b.vy = Math.sin(a) * sp;
      b.y = top - BALL_R;
      this.emit('paddle');
    }
    // bricks: the first one touched this step
    for (const br of this.bricks) {
      const cx = Math.max(br.x, Math.min(b.x, br.x + br.w));
      const cy = Math.max(br.y, Math.min(b.y, br.y + br.h));
      if ((b.x - cx) ** 2 + (b.y - cy) ** 2 > BALL_R * BALL_R) continue;
      // Came from the side if the previous position was beside the brick, else from above/below.
      const fromSide = px < br.x || px > br.x + br.w;
      const fromEnd = py < br.y || py > br.y + br.h;
      if (fromSide && !fromEnd) {
        b.vx = px < br.x ? -Math.abs(b.vx) : Math.abs(b.vx);
        b.x = px < br.x ? br.x - BALL_R : br.x + br.w + BALL_R;
      } else {
        b.vy = py < br.y ? -Math.abs(b.vy) : Math.abs(b.vy);
        b.y = py < br.y ? br.y - BALL_R : br.y + br.h + BALL_R;
      }
      // Never let a ball settle into a near-horizontal loop.
      if (Math.abs(b.vy) < this.speed() * 0.25) {
        b.vy = Math.sign(b.vy || 1) * this.speed() * 0.3;
        this.setSpeed(b, this.speed());
      }
      this.hitBrick(br);
      break;
    }
  }
}

export const GEOMETRY = { W, H, TOP, PADDLE_Y, PADDLE_H, BALL_R };
