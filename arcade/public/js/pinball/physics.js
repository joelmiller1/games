// A small 2D pinball physics engine: balls against segments, circles and rotating flippers,
// plus pass-through sensors. Pure JavaScript with no DOM access so it can be tested in Node.

export const BALL_RADIUS = 11;
const MAX_SPEED = 2800;

export class World {
  constructor({ gravity = 1300 } = {}) {
    this.gravity = gravity;
    this.segments = [];
    this.circles = [];
    this.flippers = [];
    this.sensors = [];
    this.balls = [];
    this.events = [];
    this.nextId = 1;
  }

  // ---- building ----
  segment(ax, ay, bx, by, opts = {}) {
    const len = Math.hypot(bx - ax, by - ay);
    const s = {
      id: opts.id ?? this.nextId++,
      kind: opts.kind || 'wall',
      ax,
      ay,
      bx,
      by,
      len,
      e: opts.e ?? 0.45,
      friction: opts.friction ?? 0.12,
      kick: opts.kick || 0,
      active: true,
      // One-way segments only collide from the side their normal points to.
      oneWay: opts.oneWay || null,
      data: opts.data || null,
    };
    this.segments.push(s);
    return s;
  }

  polyline(points, opts = {}) {
    const out = [];
    for (let i = 0; i + 1 < points.length; i++) out.push(this.segment(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1], opts));
    return out;
  }

  arc(cx, cy, r, a0, a1, steps, opts = {}) {
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const a = a0 + ((a1 - a0) * i) / steps;
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    return this.polyline(pts, opts);
  }

  circle(x, y, r, opts = {}) {
    const c = {
      id: opts.id ?? this.nextId++,
      kind: opts.kind || 'post',
      x,
      y,
      r,
      e: opts.e ?? 0.5,
      kick: opts.kick || 0,
      active: true,
      data: opts.data || null,
    };
    this.circles.push(c);
    return c;
  }

  sensor(x, y, r, opts = {}) {
    const s = { id: opts.id ?? this.nextId++, kind: opts.kind || 'sensor', x, y, r, active: true, inside: new Set(), data: opts.data || null };
    this.sensors.push(s);
    return s;
  }

  flipper({ x, y, length, r0 = 12, r1 = 7, rest, active, speedUp = 26, speedDown = 14, side }) {
    const f = { kind: 'flipper', side, x, y, length, r0, r1, rest, activeAngle: active, angle: rest, omega: 0, speedUp, speedDown, pressed: false, e: 0.25 };
    this.flippers.push(f);
    return f;
  }

  addBall(x, y, vx = 0, vy = 0) {
    const b = { x, y, vx, vy, r: BALL_RADIUS, id: this.nextId++, held: false, lost: false };
    this.balls.push(b);
    return b;
  }

  // ---- simulation ----
  step(dt) {
    for (const f of this.flippers) updateFlipper(f, dt);
    for (const b of this.balls) {
      if (b.held || b.lost) continue;
      b.vy += this.gravity * dt;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > MAX_SPEED) {
        b.vx *= MAX_SPEED / sp;
        b.vy *= MAX_SPEED / sp;
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      for (const s of this.segments) if (s.active) this.collideSegment(b, s);
      for (const c of this.circles) if (c.active) this.collideCircle(b, c);
      for (const f of this.flippers) this.collideFlipper(b, f);
      for (const s of this.sensors) {
        if (!s.active) continue;
        const inside = (b.x - s.x) ** 2 + (b.y - s.y) ** 2 < (s.r + b.r * 0.5) ** 2;
        if (inside && !s.inside.has(b.id)) {
          s.inside.add(b.id);
          this.events.push({ type: 'enter', target: s, ball: b, speed: Math.hypot(b.vx, b.vy) });
        } else if (!inside && s.inside.has(b.id)) s.inside.delete(b.id);
      }
    }
    // Ball-ball collisions (multiball).
    const bs = this.balls;
    for (let i = 0; i < bs.length; i++) {
      for (let j = i + 1; j < bs.length; j++) {
        const a = bs[i];
        const b = bs[j];
        if (a.lost || b.lost || a.held || b.held) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const min = a.r + b.r;
        if (d >= min || d === 0) continue;
        const nx = dx / d;
        const ny = dy / d;
        const push = (min - d) / 2;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
        const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rel < 0) {
          const imp = -rel * 0.95;
          a.vx -= nx * imp;
          a.vy -= ny * imp;
          b.vx += nx * imp;
          b.vy += ny * imp;
        }
      }
    }
  }

  bounce(b, nx, ny, e, friction, kick, target) {
    const vn = b.vx * nx + b.vy * ny;
    if (vn >= 0) return;
    // Slow contacts (rolling along a wall) don't bounce, so the ball doesn't chatter.
    const rest = -vn < 40 ? 0 : e;
    const jn = -(1 + rest) * vn;
    b.vx += jn * nx;
    b.vy += jn * ny;
    if (friction && rest) {
      // Friction on impacts only (proportional to the impact, never reversing the slide);
      // a ball rolling along a surface keeps rolling.
      const tx = -ny;
      const ty = nx;
      const vt = b.vx * tx + b.vy * ty;
      const dv = Math.min(Math.abs(vt), friction * jn);
      b.vx -= Math.sign(vt) * dv * tx;
      b.vy -= Math.sign(vt) * dv * ty;
    }
    if (kick && -vn > 60) {
      b.vx += nx * kick;
      b.vy += ny * kick;
    }
    if (target) this.events.push({ type: 'hit', target, ball: b, speed: -vn });
  }

  collideSegment(b, s) {
    const abx = s.bx - s.ax;
    const aby = s.by - s.ay;
    const l2 = abx * abx + aby * aby;
    let t = l2 ? ((b.x - s.ax) * abx + (b.y - s.ay) * aby) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = s.ax + abx * t;
    const cy = s.ay + aby * t;
    let dx = b.x - cx;
    let dy = b.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= b.r * b.r) return;
    if (s.oneWay) {
      const side = (b.x - s.ax) * s.oneWay[0] + (b.y - s.ay) * s.oneWay[1];
      if (side < 0) return;
    }
    let d = Math.sqrt(d2);
    if (d < 1e-6) {
      // Centre exactly on the line: push back the way the ball came (or out of a one-way gate's front).
      if (s.oneWay) {
        dx = s.oneWay[0];
        dy = s.oneWay[1];
      } else {
        dx = -aby / Math.sqrt(l2);
        dy = abx / Math.sqrt(l2);
        if (dx * b.vx + dy * b.vy > 0) {
          dx = -dx;
          dy = -dy;
        }
      }
      d = 1e-6;
    } else {
      dx /= d;
      dy /= d;
    }
    const pen = b.r - d;
    b.x += dx * pen;
    b.y += dy * pen;
    this.bounce(b, dx, dy, s.e, s.friction, s.kick, s.kind === 'wall' ? null : s);
  }

  collideCircle(b, c) {
    const dx = b.x - c.x;
    const dy = b.y - c.y;
    const min = b.r + c.r;
    const d2 = dx * dx + dy * dy;
    if (d2 >= min * min) return;
    const d = Math.sqrt(d2) || 1e-6;
    const nx = dx / d;
    const ny = dy / d;
    b.x = c.x + nx * min;
    b.y = c.y + ny * min;
    this.bounce(b, nx, ny, c.e, 0.1, c.kick, c.kind === 'post' ? null : c);
  }

  collideFlipper(b, f) {
    const tipx = f.x + Math.cos(f.angle) * f.length;
    const tipy = f.y + Math.sin(f.angle) * f.length;
    const abx = tipx - f.x;
    const aby = tipy - f.y;
    let t = ((b.x - f.x) * abx + (b.y - f.y) * aby) / (f.length * f.length);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = f.x + abx * t;
    const cy = f.y + aby * t;
    const rad = f.r0 + (f.r1 - f.r0) * t;
    let dx = b.x - cx;
    let dy = b.y - cy;
    const d = Math.hypot(dx, dy);
    const min = b.r + rad;
    if (d >= min) return;
    const nx = d > 1e-6 ? dx / d : -Math.sin(f.angle);
    const ny = d > 1e-6 ? dy / d : Math.cos(f.angle);
    b.x = cx + nx * min;
    b.y = cy + ny * min;
    // Velocity of the flipper surface at the contact point.
    const px = cx + nx * rad - f.x;
    const py = cy + ny * rad - f.y;
    const svx = -f.omega * py;
    const svy = f.omega * px;
    const rvx = b.vx - svx;
    const rvy = b.vy - svy;
    const vn = rvx * nx + rvy * ny;
    if (vn < 0) {
      const e = Math.abs(f.omega) > 1 ? 0.55 : -vn < 40 ? 0 : f.e;
      const jn = -(1 + e) * vn;
      b.vx += jn * nx;
      b.vy += jn * ny;
      // Some grip between the rubber and the ball on real impacts.
      if (e > 0) {
        const tx = -ny;
        const ty = nx;
        const vt = (b.vx - svx) * tx + (b.vy - svy) * ty;
        const dv = Math.min(Math.abs(vt), 0.08 * jn);
        b.vx -= Math.sign(vt) * dv * tx;
        b.vy -= Math.sign(vt) * dv * ty;
      }
      if (-vn > 250) this.events.push({ type: 'hit', target: f, ball: b, speed: -vn });
    }
  }
}

function updateFlipper(f, dt) {
  const target = f.pressed ? f.activeAngle : f.rest;
  const diff = target - f.angle;
  if (Math.abs(diff) < 1e-4) {
    f.omega = 0;
    f.angle = target;
    return;
  }
  const speed = f.pressed ? f.speedUp : f.speedDown;
  const stepA = Math.sign(diff) * speed * dt;
  if (Math.abs(stepA) >= Math.abs(diff)) {
    f.angle = target;
    f.omega = diff / dt;
    // Stop immediately at the end stop, like a real flipper.
    f.omega = 0;
  } else {
    f.angle += stepA;
    f.omega = Math.sign(diff) * speed;
  }
}

export function flipperTip(f) {
  return [f.x + Math.cos(f.angle) * f.length, f.y + Math.sin(f.angle) * f.length];
}
