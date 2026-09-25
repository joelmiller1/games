// Snake rules, independent of the screen.
import { seeded } from './rng.js';

const START_SPEED = 7; // cells per second
const MAX_SPEED = 16;
const GOLDEN_EVERY = 5;
const GOLDEN_TIME = 6;

export class Snake {
  constructor({ seed = 1, cols = 20, rows = 20, wrap = false } = {}) {
    this.rng = seeded(seed);
    this.cols = cols;
    this.rows = rows;
    this.wrapWalls = wrap;
    const y = Math.floor(rows / 2);
    const x = Math.floor(cols / 3);
    this.body = [
      { x, y },
      { x: x - 1, y },
      { x: x - 2, y },
    ];
    this.prev = this.body.map((c) => ({ ...c }));
    this.dir = { x: 1, y: 0 };
    this.queue = [];
    this.grow = 0;
    this.apples = 0;
    this.score = 0;
    this.speed = START_SPEED;
    this.acc = 0;
    this.over = false;
    this.golden = null;
    this.events = [];
    this.food = this.freeCell();
  }

  emit(type, extra = {}) {
    this.events.push({ type, ...extra });
  }

  drain() {
    const e = this.events;
    this.events = [];
    return e;
  }

  occupied(x, y) {
    return this.body.some((c) => c.x === x && c.y === y);
  }

  freeCell() {
    for (let tries = 0; tries < 1000; tries++) {
      const x = Math.floor(this.rng() * this.cols);
      const y = Math.floor(this.rng() * this.rows);
      if (!this.occupied(x, y) && !(this.food && this.food.x === x && this.food.y === y) && !(this.golden && this.golden.x === x && this.golden.y === y)) return { x, y };
    }
    for (let y = 0; y < this.rows; y++) for (let x = 0; x < this.cols; x++) if (!this.occupied(x, y)) return { x, y };
    return null;
  }

  /** Queue a turn; reversing onto yourself is ignored. */
  turn(dx, dy) {
    const last = this.queue.length ? this.queue[this.queue.length - 1] : this.dir;
    if ((dx === -last.x && dy === -last.y) || (dx === last.x && dy === last.y)) return false;
    if (this.queue.length >= 2) return false;
    this.queue.push({ x: dx, y: dy });
    return true;
  }

  applePoints() {
    return 10 + Math.floor(this.speed - START_SPEED) * 2;
  }

  step() {
    if (this.queue.length) this.dir = this.queue.shift();
    this.prev = this.body.map((c) => ({ ...c }));
    const head = this.body[0];
    let nx = head.x + this.dir.x;
    let ny = head.y + this.dir.y;
    if (this.wrapWalls) {
      nx = (nx + this.cols) % this.cols;
      ny = (ny + this.rows) % this.rows;
    } else if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) {
      this.die('wall');
      return;
    }
    // The tail moves out of the way this step, unless the snake is growing.
    const tailFree = this.grow === 0;
    const hitsBody = this.body.some((c, i) => c.x === nx && c.y === ny && !(tailFree && i === this.body.length - 1));
    if (hitsBody) {
      this.die('self');
      return;
    }
    this.body.unshift({ x: nx, y: ny });
    if (this.grow > 0) this.grow--;
    else this.body.pop();
    if (this.food && nx === this.food.x && ny === this.food.y) {
      this.apples++;
      this.grow += 1;
      const pts = this.applePoints();
      this.score += pts;
      this.speed = Math.min(MAX_SPEED, START_SPEED + this.apples * 0.25);
      this.emit('eat', { x: nx, y: ny, points: pts });
      this.food = this.freeCell();
      if (this.apples % GOLDEN_EVERY === 0 && !this.golden) {
        const cell = this.freeCell();
        if (cell) this.golden = { ...cell, t: GOLDEN_TIME };
      }
    } else if (this.golden && nx === this.golden.x && ny === this.golden.y) {
      const pts = 50 + Math.ceil(this.golden.t) * 10;
      this.score += pts;
      this.grow += 2;
      this.emit('golden', { x: nx, y: ny, points: pts });
      this.golden = null;
    }
    if (!this.food) this.die('full');
  }

  die(why) {
    this.over = true;
    this.emit('crash', { why });
  }

  update(dt) {
    if (this.over) return;
    if (this.golden) {
      this.golden.t -= dt;
      if (this.golden.t <= 0) this.golden = null;
    }
    this.acc += dt * this.speed;
    while (this.acc >= 1 && !this.over) {
      this.acc -= 1;
      this.step();
    }
  }

  /** How far (0..1) the snake has moved towards its next cell, for smooth drawing. */
  progress() {
    return this.over ? 1 : Math.min(1, this.acc);
  }
}
