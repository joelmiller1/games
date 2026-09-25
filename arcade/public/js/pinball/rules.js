// Pinball game rules: scoring, lights, ball save, kickback, saucer, multiball, tilt, players and balls.
// DOM-free so it can run headless in tests.
import { buildTable, onPlunger, LANE_X, PLUNGER_Y, DRAIN_Y } from './table.js';

export const STEP = 1 / 240;
const SUBSTEPS = 4;
const BALL_SAVE_SECONDS = 8;

export class PinballRules {
  constructor({ players = ['Player 1'], balls = 3, onEvent = () => {}, random = Math.random } = {}) {
    this.t = buildTable();
    this.world = this.t.world;
    this.onEvent = onEvent;
    this.random = random;
    this.ballsPerPlayer = balls;
    this.players = players.map((name) => ({ name, score: 0, ball: 1, done: false }));
    this.current = 0;
    this.phase = 'plunger'; // plunger | playing | bonus | over
    this.time = 0;
    this.plunger = { charge: 0, charging: false, release: 0 };
    this.messages = [];
    this.flash = new Map(); // element -> time when lit up by a hit
    this.shake = 0;
    this.timers = [];
    this.acc = 0;
    this.resetBallState();
    this.newBall();
  }

  get player() {
    return this.players[this.current];
  }

  resetBallState() {
    this.lanesLit = [false, false, false];
    this.multiplier = 1;
    this.bonus = 0;
    this.dropsDown = [false, false, false, false];
    for (const d of this.t.drops) d.active = true;
    this.kickbackLit = true;
    this.saucerHits = 0;
    this.tilt = 0;
    this.tilted = false;
    this.ballSaveUntil = 0;
    this.skillLane = -1;
    this.skillUntil = 0;
    this.captured = null;
    this.bonusCount = null;
  }

  message(text, seconds = 2) {
    this.messages.push({ text, until: this.time + seconds, start: this.time });
    this.onEvent({ type: 'message', text });
  }

  emit(type, extra = {}) {
    this.onEvent({ type, ...extra });
  }

  score(points, bonus = 0) {
    if (this.tilted) return;
    const mult = this.activeBalls().length > 1 ? 2 : 1;
    this.player.score += points * mult;
    this.bonus += bonus;
    this.emit('score', { score: this.player.score });
  }

  activeBalls() {
    return this.world.balls.filter((b) => !b.lost);
  }

  newBall() {
    this.world.balls = this.world.balls.filter((b) => !b.lost);
    this.world.addBall(LANE_X, PLUNGER_Y - 11.5);
    this.phase = 'plunger';
    this.skillLane = Math.floor(this.random() * 3);
    this.emit('newBall', { player: this.current, ball: this.player.ball });
  }

  // ---- input ----
  setFlipper(side, down) {
    const f = side === 'left' ? this.t.leftFlipper : this.t.rightFlipper;
    const wasDown = f.pressed;
    f.pressed = down && !this.tilted && this.phase !== 'over' && this.phase !== 'bonus';
    if (f.pressed && !wasDown) {
      this.emit('flipper');
      // Lane change: rotate the lit top lanes.
      if (this.lanesLit.some(Boolean) && !this.lanesLit.every(Boolean)) {
        const l = this.lanesLit;
        this.lanesLit = side === 'left' ? [l[1], l[2], l[0]] : [l[2], l[0], l[1]];
      }
    }
  }

  setPlunger(down) {
    if (this.phase === 'over' || this.phase === 'bonus') return;
    if (down) {
      this.plunger.charging = true;
    } else if (this.plunger.charging) {
      this.plunger.charging = false;
      this.launch(this.plunger.charge);
      this.plunger.release = this.plunger.charge;
      this.plunger.charge = 0;
    }
  }

  launch(charge) {
    const ball = this.world.balls.find((b) => !b.lost && onPlunger(b));
    if (!ball) return;
    ball.vy = -(1450 + 1100 * Math.min(1, charge)) * (0.98 + this.random() * 0.04);
    ball.vx = 0;
    this.emit('launch');
    if (this.phase === 'plunger') {
      this.phase = 'playing';
      this.ballSaveUntil = this.time + BALL_SAVE_SECONDS;
      this.skillUntil = this.time + 6;
    }
  }

  nudge() {
    if (this.phase !== 'playing' || this.tilted) return;
    const dir = this.random() < 0.5 ? -1 : 1;
    for (const b of this.activeBalls()) {
      if (onPlunger(b)) continue;
      b.vx += dir * (90 + this.random() * 90);
      b.vy -= 60 + this.random() * 100;
    }
    this.shake = 0.25;
    this.tilt += 1;
    this.emit('nudge');
    if (this.tilt > 3.2) {
      this.tilted = true;
      this.t.leftFlipper.pressed = false;
      this.t.rightFlipper.pressed = false;
      this.message('TILT', 3);
      this.emit('tilt');
    } else if (this.tilt > 2.2) this.message('DANGER', 1.2);
  }

  after(seconds, fn) {
    this.timers.push({ at: this.time + seconds, fn });
  }

  // ---- simulation ----
  /** Advance by real time; physics runs in fixed steps. */
  update(dt) {
    this.acc = Math.min(this.acc + dt, 0.1);
    while (this.acc >= STEP) {
      this.tick(STEP);
      this.acc -= STEP;
    }
  }

  tick(dt) {
    this.time += dt;
    if (this.timers.length) {
      const due = this.timers.filter((t) => t.at <= this.time);
      if (due.length) {
        this.timers = this.timers.filter((t) => t.at > this.time);
        for (const t of due) t.fn();
      }
    }
    this.shake = Math.max(0, this.shake - dt);
    this.tilt = Math.max(0, this.tilt - dt * 0.45);
    if (this.plunger.charging) this.plunger.charge = Math.min(1, this.plunger.charge + dt * 1.25);
    else this.plunger.release = Math.max(0, this.plunger.release - dt * 8);
    this.messages = this.messages.filter((m) => m.until > this.time);

    if (this.phase === 'bonus') return this.tickBonus(dt);
    if (this.phase === 'over') return;

    if (this.captured) {
      const c = this.captured;
      if (this.time >= c.until) {
        c.ball.held = false;
        c.ball.x = this.t.saucer.x - 20;
        c.ball.y = this.t.saucer.y + 4;
        c.ball.vx = -520 - this.random() * 120;
        c.ball.vy = -260 - this.random() * 120;
        this.captured = null;
        this.emit('kicker');
      }
    }

    const sub = dt / SUBSTEPS;
    for (let i = 0; i < SUBSTEPS; i++) this.world.step(sub);
    for (const ev of this.world.events) this.handle(ev);
    this.world.events.length = 0;

    for (const b of this.world.balls) {
      if (!b.lost && b.y > DRAIN_Y) {
        b.lost = true;
        this.drained(b);
      }
    }
    // A ball that settles in the shooter lane during multiball is launched automatically.
    if (this.phase === 'playing') {
      for (const b of this.world.balls) {
        if (!b.lost && !b.held && onPlunger(b) && b.autoLaunch) {
          b.autoLaunch = false;
          b.vy = -2300;
          this.emit('launch');
        }
      }
    }
  }

  handle(ev) {
    const target = ev.target;
    const kind = target.kind;
    if (kind === 'bumper') {
      this.flash.set(target, this.time);
      this.score(100, 20);
      this.emit('bumper');
    } else if (kind === 'sling') {
      this.flash.set(target, this.time);
      this.score(50, 10);
      this.emit('sling');
    } else if (kind === 'flipper') {
      // no score
    } else if (kind === 'drop' && ev.type === 'hit') {
      if (ev.speed < 120) return;
      const i = target.data.index;
      target.active = false;
      this.dropsDown[i] = true;
      this.score(250, 100);
      this.emit('target');
      if (this.dropsDown.every(Boolean)) {
        this.score(5000, 500);
        this.kickbackLit = true;
        this.message('TARGETS COMPLETE +5000');
        this.emit('bonus');
        this.after(1, () => {
          this.dropsDown = [false, false, false, false];
          for (const d of this.t.drops) d.active = true;
        });
      }
    } else if (kind === 'lane' && ev.type === 'enter') {
      const i = target.data.index;
      this.score(500, 100);
      this.emit('lane');
      if (this.skillUntil > this.time) {
        this.skillUntil = 0;
        if (i === this.skillLane) {
          this.score(5000);
          this.message('SKILL SHOT +5000');
          this.emit('bonus');
        }
      }
      this.lanesLit[i] = true;
      if (this.lanesLit.every(Boolean)) {
        this.multiplier = Math.min(5, this.multiplier + 1);
        this.score(2000);
        this.message(`BONUS ${this.multiplier}X`);
        this.emit('bonus');
        this.after(0.6, () => (this.lanesLit = [false, false, false]));
      }
    } else if (kind === 'saucer' && ev.type === 'enter') {
      if (this.captured || ev.speed > 1150) return;
      const b = ev.ball;
      b.held = true;
      b.x = target.x;
      b.y = target.y;
      b.vx = 0;
      b.vy = 0;
      this.captured = { ball: b, until: this.time + 1.1 };
      this.saucerHits++;
      this.score(2500, 500);
      this.emit('saucer');
      if (this.saucerHits % 3 === 0) this.startMultiball();
      else this.message(`${3 - (this.saucerHits % 3)} MORE FOR MULTIBALL`, 1.6);
    } else if (kind === 'kickback' && ev.type === 'enter') {
      if (!this.kickbackLit || this.tilted) return;
      this.kickbackLit = false;
      const b = ev.ball;
      b.vx = 40;
      b.vy = -1750;
      this.score(500);
      this.message('KICKBACK');
      this.emit('kicker');
    }
  }

  startMultiball() {
    this.message('MULTIBALL!', 2.5);
    this.emit('multiball');
    this.ballSaveUntil = Math.max(this.ballSaveUntil, this.time + 10);
    for (let i = 0; i < 2; i++) {
      this.after(0.6 + i * 1.2, () => {
        if (this.phase !== 'playing') return;
        const b = this.world.addBall(LANE_X, PLUNGER_Y - 11.5 - i * 0.1);
        b.autoLaunch = true;
      });
    }
  }

  drained(ball) {
    this.world.balls = this.world.balls.filter((b) => b !== ball);
    if (this.phase !== 'playing' && this.phase !== 'plunger') return;
    const remaining = this.activeBalls();
    if (remaining.length > 0) {
      if (remaining.length === 1) this.emit('multiballEnd');
      return;
    }
    if (this.time < this.ballSaveUntil && !this.tilted) {
      this.message('BALL SAVED', 2);
      this.emit('saved');
      const b = this.world.addBall(LANE_X, PLUNGER_Y - 11.5);
      b.autoLaunch = true;
      this.ballSaveUntil = 0;
      return;
    }
    this.emit('drain');
    this.endOfBall();
  }

  endOfBall() {
    this.phase = 'bonus';
    this.t.leftFlipper.pressed = false;
    this.t.rightFlipper.pressed = false;
    const total = this.tilted ? 0 : this.bonus * this.multiplier;
    this.bonusCount = { total, shown: 0, until: this.time + 1.6, base: this.bonus, mult: this.multiplier, tilted: this.tilted };
  }

  tickBonus(dt) {
    const bc = this.bonusCount;
    const rate = Math.max(bc.total / 1.0, 1);
    const prev = bc.shown;
    bc.shown = Math.min(bc.total, bc.shown + rate * dt);
    if (Math.floor(bc.shown / 100) !== Math.floor(prev / 100)) this.emit('tick');
    if (this.time < bc.until) return;
    this.player.score += bc.total;
    this.emit('score', { score: this.player.score });
    this.nextBall();
  }

  nextBall() {
    const p = this.player;
    if (p.ball >= this.ballsPerPlayer) p.done = true;
    else p.ball++;
    const n = this.players.length;
    let next = -1;
    for (let k = 1; k <= n; k++) {
      const i = (this.current + k) % n;
      if (!this.players[i].done) {
        next = i;
        break;
      }
    }
    if (next === -1) {
      this.phase = 'over';
      this.emit('gameOver', { scores: this.players.map((x) => x.score) });
      return;
    }
    const changed = next !== this.current;
    this.current = next;
    this.resetBallState();
    this.newBall();
    if (changed && n > 1) this.message(`${this.player.name.toUpperCase()} UP`, 2);
  }

  lit(el, ms = 0.12) {
    const t = this.flash.get(el);
    return t !== undefined && this.time - t < ms;
  }
}

export { onPlunger };
