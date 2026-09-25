// Asteroids simulation, independent of the screen. The world wraps around at the edges.
import { seeded } from './rng.js';

const ROT = 4.6; // rad/s
const ACCEL = 380; // units/s²
const DRAG = 0.55; // per second
const MAX_SPEED = 470;
const BULLET_SPEED = 640;
const BULLET_LIFE = 0.85;
const MAX_BULLETS = 5;
const ROCK_R = [0, 13, 25, 46];
const ROCK_POINTS = [0, 100, 50, 20];
const SAUCER = {
  large: { r: 18, speed: 110, fire: 1.3, points: 200 },
  small: { r: 10, speed: 150, fire: 0.95, points: 1000 },
};

export class Asteroids {
  constructor({ seed = 1, width = 1000, height = 750 } = {}) {
    this.rng = seeded(seed);
    this.W = width;
    this.H = height;
    this.score = 0;
    this.lives = 3;
    this.wave = 0;
    this.nextLife = 10000;
    this.ship = null;
    this.rocks = [];
    this.bullets = [];
    this.saucer = null;
    this.particles = [];
    this.debris = [];
    this.events = [];
    this.over = false;
    this.ended = false;
    this.time = 0;
    this.waveTime = 0;
    this.respawnTimer = 0;
    this.waveTimer = 0;
    this.endTimer = 0;
    this.fireCooldown = 0;
    this.autoFire = 0;
    this.wasFiring = false;
    this.hyperCooldown = 0;
    this.beatTimer = 1;
    this.beatHi = false;
    this.saucerTimer = 0;
    this.spawnShip();
    this.nextWave();
  }

  r() {
    return this.rng();
  }

  emit(type, extra = {}) {
    this.events.push({ type, ...extra });
  }

  drain() {
    const e = this.events;
    this.events = [];
    return e;
  }

  wrap(o) {
    o.x = ((o.x % this.W) + this.W) % this.W;
    o.y = ((o.y % this.H) + this.H) % this.H;
  }

  /** Distance across the wrapping edges. */
  dist(a, b) {
    let dx = Math.abs(a.x - b.x);
    let dy = Math.abs(a.y - b.y);
    if (dx > this.W / 2) dx = this.W - dx;
    if (dy > this.H / 2) dy = this.H - dy;
    return Math.hypot(dx, dy);
  }

  spawnShip() {
    this.ship = { x: this.W / 2, y: this.H / 2, vx: 0, vy: 0, a: -Math.PI / 2, r: 11, invuln: 2.5, thrust: false, hidden: 0 };
  }

  makeRock(size, x, y, speedBoost = 1) {
    const base = [0, 120, 80, 50][size] * (1 + Math.min(0.6, (this.wave - 1) * 0.06));
    const speed = base * (0.6 + this.r() * 0.7) * speedBoost;
    const dir = this.r() * Math.PI * 2;
    const n = 9 + Math.floor(this.r() * 4);
    const shape = Array.from({ length: n }, () => 0.72 + this.r() * 0.36);
    return { x, y, vx: Math.cos(dir) * speed, vy: Math.sin(dir) * speed, size, r: ROCK_R[size], shape, rot: this.r() * 6.28, spin: (this.r() - 0.5) * 1.6 };
  }

  nextWave() {
    this.wave++;
    this.waveTime = 0;
    this.beatTimer = 1;
    const count = Math.min(3 + this.wave, 11);
    for (let i = 0; i < count; i++) {
      let x;
      let y;
      let tries = 0;
      do {
        // Along the edges, away from the ship.
        if (this.r() < 0.5) {
          x = this.r() * this.W;
          y = this.r() < 0.5 ? 0 : this.H * 0.999;
        } else {
          x = this.r() < 0.5 ? 0 : this.W * 0.999;
          y = this.r() * this.H;
        }
      } while (this.ship && this.dist({ x, y }, this.ship) < 220 && ++tries < 20);
      this.rocks.push(this.makeRock(3, x, y));
    }
    this.saucerTimer = Math.max(7, 18 - this.wave * 1.5) + this.r() * 6;
    this.emit('wave', { wave: this.wave });
  }

  addScore(points) {
    this.score += points;
    while (this.score >= this.nextLife) {
      this.lives++;
      this.nextLife += 10000;
      this.emit('extra');
    }
  }

  burst(x, y, n, speed, life = 0.8, color = '#e2e8f0') {
    for (let i = 0; i < n; i++) {
      const a = this.r() * Math.PI * 2;
      const v = speed * (0.3 + this.r() * 0.9);
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: life * (0.5 + this.r() * 0.6), max: life, color });
    }
  }

  splitRock(i, byPlayer, push = null) {
    const rock = this.rocks[i];
    this.rocks.splice(i, 1);
    if (byPlayer) this.addScore(ROCK_POINTS[rock.size]);
    this.burst(rock.x, rock.y, 6 + rock.size * 4, 60 + rock.size * 25);
    this.emit('rock', { size: rock.size });
    if (rock.size > 1) {
      for (let k = 0; k < 2; k++) {
        const child = this.makeRock(rock.size - 1, rock.x, rock.y, 1.1);
        if (push) {
          child.vx += push.vx * 0.08;
          child.vy += push.vy * 0.08;
        }
        this.rocks.push(child);
      }
    }
  }

  killShip() {
    const s = this.ship;
    this.burst(s.x, s.y, 26, 160, 1.2, '#a5f3fc');
    const parts = [
      [14, 0, -10, -9],
      [-10, -9, -10, 9],
      [-10, 9, 14, 0],
    ];
    for (const [x1, y1, x2, y2] of parts) {
      const a = this.r() * Math.PI * 2;
      this.debris.push({ x: s.x, y: s.y, vx: s.vx * 0.3 + Math.cos(a) * 60, vy: s.vy * 0.3 + Math.sin(a) * 60, a: s.a, spin: (this.r() - 0.5) * 6, seg: [x1, y1, x2, y2], life: 1.6 });
    }
    this.ship = null;
    this.lives--;
    this.emit('crash');
    if (this.lives > 0) this.respawnTimer = 2;
    else {
      this.over = true;
      this.endTimer = 2.2;
      this.emit('gameover');
    }
  }

  spawnSaucer() {
    const smallChance = Math.min(0.85, Math.max(0.1, (this.score - 2000) / 20000));
    const kind = this.r() < smallChance ? 'small' : 'large';
    const cfg = SAUCER[kind];
    const fromLeft = this.r() < 0.5;
    this.saucer = {
      kind,
      r: cfg.r,
      x: fromLeft ? 0 : this.W,
      y: this.H * (0.15 + this.r() * 0.7),
      vx: fromLeft ? cfg.speed : -cfg.speed,
      vy: 0,
      fire: 0.8,
      turn: 1 + this.r(),
      warble: 0,
    };
    this.emit('saucer');
  }

  shoot(from, angle, speed, life, mine) {
    this.bullets.push({ x: from.x + Math.cos(angle) * (from.r + 2), y: from.y + Math.sin(angle) * (from.r + 2), vx: Math.cos(angle) * speed + (mine ? from.vx : 0), vy: Math.sin(angle) * speed + (mine ? from.vy : 0), life, mine });
  }

  /** input: { left, right, thrust, fire, hyper } (hyper is consumed). */
  update(dt, input = {}) {
    this.time += dt;
    this.waveTime += dt;
    const ship = this.ship;
    this.fireCooldown -= dt;
    this.autoFire -= dt;
    this.hyperCooldown -= dt;

    // --- ship ---
    if (ship) {
      if (ship.hidden > 0) {
        ship.hidden -= dt;
      } else {
        if (input.left) ship.a -= ROT * dt;
        if (input.right) ship.a += ROT * dt;
        ship.thrust = !!input.thrust;
        if (ship.thrust) {
          ship.vx += Math.cos(ship.a) * ACCEL * dt;
          ship.vy += Math.sin(ship.a) * ACCEL * dt;
          if (this.r() < dt * 30) this.particles.push({ x: ship.x - Math.cos(ship.a) * 9, y: ship.y - Math.sin(ship.a) * 9, vx: ship.vx - Math.cos(ship.a) * 90, vy: ship.vy - Math.sin(ship.a) * 90, life: 0.25, max: 0.25, color: '#fdba74' });
        }
        const damp = Math.exp(-DRAG * dt);
        ship.vx *= damp;
        ship.vy *= damp;
        const sp = Math.hypot(ship.vx, ship.vy);
        if (sp > MAX_SPEED) {
          ship.vx *= MAX_SPEED / sp;
          ship.vy *= MAX_SPEED / sp;
        }
        ship.x += ship.vx * dt;
        ship.y += ship.vy * dt;
        this.wrap(ship);
        ship.invuln -= dt;
        const mine = this.bullets.filter((b) => b.mine).length;
        if (input.fire && this.fireCooldown <= 0 && mine < MAX_BULLETS && (!this.wasFiring || this.autoFire <= 0)) {
          this.shoot(ship, ship.a, BULLET_SPEED, BULLET_LIFE, true);
          this.fireCooldown = 0.1;
          this.autoFire = 0.24;
          this.emit('fire');
        }
        if (input.hyper && this.hyperCooldown <= 0) {
          let spot = null;
          for (let t = 0; t < 12 && !spot; t++) {
            const cand = { x: this.r() * this.W, y: this.r() * this.H };
            if (this.rocks.every((rk) => this.dist(rk, cand) > rk.r + 70)) spot = cand;
          }
          spot ||= { x: this.r() * this.W, y: this.r() * this.H };
          ship.x = spot.x;
          ship.y = spot.y;
          ship.vx = 0;
          ship.vy = 0;
          ship.hidden = 0.35;
          ship.invuln = Math.max(ship.invuln, 0.6);
          this.hyperCooldown = 1.5;
          this.emit('hyper');
        }
      }
    } else if (!this.over) {
      this.respawnTimer -= dt;
      const centre = { x: this.W / 2, y: this.H / 2 };
      const clear = this.rocks.every((rk) => this.dist(rk, centre) > rk.r + 110) && !(this.saucer && this.dist(this.saucer, centre) < 160);
      if (this.respawnTimer <= 0 && clear) this.spawnShip();
    }
    this.wasFiring = !!input.fire;
    input.hyper = false;

    // --- rocks, bullets, saucer, particles ---
    for (const rk of this.rocks) {
      rk.x += rk.vx * dt;
      rk.y += rk.vy * dt;
      rk.rot += rk.spin * dt;
      this.wrap(rk);
    }
    for (const b of this.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      this.wrap(b);
    }
    this.bullets = this.bullets.filter((b) => b.life > 0);
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - dt * 1.5;
      p.vy *= 1 - dt * 1.5;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const d of this.debris) {
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.a += d.spin * dt;
      d.life -= dt;
    }
    this.debris = this.debris.filter((d) => d.life > 0);

    this.updateSaucer(dt);
    this.collide();

    // --- waves, heartbeat, the end ---
    if (!this.rocks.length && !this.over) {
      if (this.waveTimer <= 0) this.waveTimer = 2;
      this.waveTimer -= dt;
      if (this.waveTimer <= 0) this.nextWave();
    }
    if (this.ship && !this.over && this.rocks.length) {
      this.beatTimer -= dt;
      if (this.beatTimer <= 0) {
        this.beatHi = !this.beatHi;
        this.emit('beat', { hi: this.beatHi });
        this.beatTimer = Math.max(0.28, 1 - this.waveTime * 0.012);
      }
    }
    if (this.over && !this.ended) {
      this.endTimer -= dt;
      if (this.endTimer <= 0) this.ended = true;
    }
  }

  updateSaucer(dt) {
    if (!this.saucer) {
      if (this.over) return;
      this.saucerTimer -= dt;
      if (this.saucerTimer <= 0 && this.rocks.length) {
        this.spawnSaucer();
        this.saucerTimer = Math.max(7, 16 - this.wave) + this.r() * 8;
      }
      return;
    }
    const s = this.saucer;
    const cfg = SAUCER[s.kind];
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.y = ((s.y % this.H) + this.H) % this.H;
    s.turn -= dt;
    if (s.turn <= 0) {
      s.turn = 1 + this.r() * 1.2;
      const k = this.r();
      s.vy = k < 0.33 ? 0 : (k < 0.66 ? 1 : -1) * Math.abs(s.vx) * 0.6;
    }
    s.warble -= dt;
    if (s.warble <= 0) {
      s.warble = 0.28;
      this.emit('saucerTone');
    }
    s.fire -= dt;
    if (s.fire <= 0) {
      s.fire = cfg.fire;
      let angle;
      if (s.kind === 'small' && this.ship) {
        const err = Math.max(0.06, 0.4 - this.score / 100000);
        angle = Math.atan2(this.ship.y - s.y, this.ship.x - s.x) + (this.r() - 0.5) * 2 * err;
      } else angle = this.r() * Math.PI * 2;
      this.shoot(s, angle, 360, 1.7, false);
    }
    if (s.x < -40 || s.x > this.W + 40) this.saucer = null;
  }

  collide() {
    const ship = this.ship;
    for (let bi = this.bullets.length - 1; bi >= 0; bi--) {
      const b = this.bullets[bi];
      let hit = false;
      for (let i = this.rocks.length - 1; i >= 0; i--) {
        if (this.dist(b, this.rocks[i]) < this.rocks[i].r) {
          this.splitRock(i, b.mine, b);
          hit = true;
          break;
        }
      }
      if (!hit && b.mine && this.saucer && this.dist(b, this.saucer) < this.saucer.r + 2) {
        this.destroySaucer(true);
        hit = true;
      }
      if (!hit && !b.mine && ship && ship.hidden <= 0 && ship.invuln <= 0 && this.dist(b, ship) < ship.r) {
        this.killShip();
        hit = true;
      }
      if (hit) this.bullets.splice(bi, 1);
    }
    if (this.ship && this.ship.hidden <= 0 && this.ship.invuln <= 0) {
      for (let i = this.rocks.length - 1; i >= 0; i--) {
        if (this.dist(this.ship, this.rocks[i]) < this.rocks[i].r + this.ship.r * 0.75) {
          this.splitRock(i, true);
          this.killShip();
          break;
        }
      }
    }
    if (this.saucer) {
      if (this.ship && this.ship.hidden <= 0 && this.ship.invuln <= 0 && this.dist(this.ship, this.saucer) < this.saucer.r + this.ship.r) {
        this.destroySaucer(true);
        this.killShip();
        return;
      }
      for (let i = this.rocks.length - 1; i >= 0; i--) {
        if (this.dist(this.saucer, this.rocks[i]) < this.rocks[i].r + this.saucer.r) {
          this.splitRock(i, false);
          this.destroySaucer(false);
          break;
        }
      }
    }
  }

  destroySaucer(byPlayer) {
    const s = this.saucer;
    if (byPlayer) this.addScore(SAUCER[s.kind].points);
    this.burst(s.x, s.y, 20, 140, 1, '#fda4af');
    this.emit('rock', { size: 3 });
    this.saucer = null;
  }
}
