// Canvas renderer for the pinball table. Static artwork is cached in an offscreen canvas.
import { W, H, LANE_X, PLUNGER_Y } from './table.js';
import { flipperTip } from './physics.js';

const PINK = '#f472b6';
const GOLD = '#fbbf24';
const BUMPER_COLORS = ['#f472b6', '#22d3ee', '#fbbf24'];

export class Renderer {
  constructor(canvas, rules) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.rules = rules;
    this.scale = 1;
    this.staticLayer = null;
    this.resize();
  }

  setRules(rules) {
    this.rules = rules;
    this.staticLayer = null;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(60, Math.round(rect.width * dpr));
    const h = Math.round((w * H) / W);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.staticLayer = null;
    }
    this.scale = w / W;
  }

  buildStatic() {
    const c = document.createElement('canvas');
    c.width = this.canvas.width;
    c.height = this.canvas.height;
    const g = c.getContext('2d');
    g.scale(this.scale, this.scale);
    // Playfield background.
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#1b0f3d');
    bg.addColorStop(0.55, '#101a44');
    bg.addColorStop(1, '#070b1d');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    // Starfield + subtle grid.
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 90; i++) {
      g.fillStyle = `rgba(255,255,255,${0.15 + rnd() * 0.35})`;
      g.beginPath();
      g.arc(20 + rnd() * 520, 20 + rnd() * 900, rnd() * 1.4 + 0.3, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = 'rgba(139, 92, 246, 0.08)';
    g.lineWidth = 1;
    for (let y = 380; y < 1000; y += 30) {
      g.beginPath();
      g.moveTo(20, y);
      g.lineTo(540, y);
      g.stroke();
    }
    // Title art.
    g.save();
    g.translate(280, 525);
    g.rotate(-0.08);
    g.font = '900 64px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.strokeStyle = 'rgba(244, 114, 182, 0.35)';
    g.lineWidth = 3;
    g.strokeText('ARCADE', 0, 0);
    g.fillStyle = 'rgba(244, 114, 182, 0.08)';
    g.fillText('ARCADE', 0, 0);
    g.font = '800 18px system-ui, sans-serif';
    g.fillStyle = 'rgba(34, 211, 238, 0.45)';
    g.fillText('N I G H T S', 0, 46);
    g.restore();
    // Shooter lane background.
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(540, 240, 40, 760);
    // Inlane arrows.
    g.fillStyle = 'rgba(251, 191, 36, 0.25)';
    for (const x of [72, 488]) {
      for (let k = 0; k < 3; k++) {
        const y = 830 + k * 28;
        g.beginPath();
        g.moveTo(x - 8, y);
        g.lineTo(x + 8, y);
        g.lineTo(x, y + 12);
        g.closePath();
        g.fill();
      }
    }
    // Walls with a neon glow.
    const t = this.rules.t;
    const strokeWalls = (width, color) => {
      g.strokeStyle = color;
      g.lineWidth = width;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.beginPath();
      for (const s of t.walls) {
        g.moveTo(s.ax, s.ay);
        g.lineTo(s.bx, s.by);
      }
      g.stroke();
    };
    strokeWalls(10, 'rgba(34, 211, 238, 0.12)');
    strokeWalls(5, 'rgba(34, 211, 238, 0.35)');
    strokeWalls(2, '#a5f3fc');
    // Posts.
    for (const p of t.posts) {
      g.fillStyle = '#e0f2fe';
      g.beginPath();
      g.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      g.fill();
    }
    // Labels.
    g.font = '700 11px system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillStyle = 'rgba(165, 243, 252, 0.6)';
    g.fillText('SHOOT', 560, 990);
    this.staticLayer = c;
  }

  draw(now) {
    const r = this.rules;
    const g = this.ctx;
    if (!this.staticLayer) this.buildStatic();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    let sx = 0;
    let sy = 0;
    if (r.shake > 0) {
      sx = (Math.random() - 0.5) * 10 * this.scale * r.shake * 4;
      sy = (Math.random() - 0.5) * 6 * this.scale * r.shake * 4;
    }
    g.drawImage(this.staticLayer, sx, sy);
    g.setTransform(this.scale, 0, 0, this.scale, sx, sy);
    const t = r.t;
    const blink = Math.floor(now / 250) % 2 === 0;

    // Top lanes.
    t.lanes.forEach((lane, i) => {
      const lit = r.lanesLit[i];
      const skill = r.phase === 'plunger' && i === r.skillLane;
      if (lit) {
        g.fillStyle = 'rgba(251,191,36,0.25)';
        g.beginPath();
        g.arc(lane.x, lane.y + 24, 13, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = lit ? GOLD : skill && blink ? '#fde68a' : 'rgba(251,191,36,0.18)';
      g.beginPath();
      g.arc(lane.x, lane.y + 24, 7, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(251,191,36,0.4)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(lane.x - 7, lane.y - 8);
      g.lineTo(lane.x, lane.y);
      g.lineTo(lane.x + 7, lane.y - 8);
      g.stroke();
    });

    // Bumpers.
    t.bumpers.forEach((b, i) => {
      const hit = r.lit(b, 0.12);
      const col = BUMPER_COLORS[i % 3];
      g.globalAlpha = hit ? 0.45 : 0.18;
      g.fillStyle = col;
      g.beginPath();
      g.arc(b.x, b.y, b.r + (hit ? 14 : 7), 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
      g.fillStyle = hit ? '#ffffff' : col;
      g.beginPath();
      g.arc(b.x, b.y, b.r + (hit ? 2 : 0), 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#0b1020';
      g.beginPath();
      g.arc(b.x, b.y, b.r - 7, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = hit ? col : '#f8fafc';
      g.beginPath();
      g.arc(b.x, b.y, b.r - 12, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#0b1020';
      g.font = '800 10px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('100', b.x, b.y + 1);
    });

    // Slingshots.
    for (const s of t.slings) {
      const hit = r.lit(s, 0.1);
      g.lineCap = 'round';
      g.strokeStyle = hit ? 'rgba(244,114,182,0.55)' : 'rgba(244,114,182,0.22)';
      g.lineWidth = hit ? 18 : 12;
      g.beginPath();
      g.moveTo(s.ax, s.ay);
      g.lineTo(s.bx, s.by);
      g.stroke();
      g.strokeStyle = hit ? '#ffffff' : PINK;
      g.lineWidth = hit ? 7 : 5;
      g.beginPath();
      g.moveTo(s.ax, s.ay);
      g.lineTo(s.bx, s.by);
      g.stroke();
    }

    // Drop targets.
    t.drops.forEach((d, i) => {
      const down = r.dropsDown[i];
      if (!down) {
        g.fillStyle = 'rgba(251, 146, 60, 0.25)';
        g.fillRect(d.ax - 5, d.ay, 14, d.by - d.ay);
      }
      g.fillStyle = down ? 'rgba(249, 115, 22, 0.18)' : '#fb923c';
      g.fillRect(d.ax - 2, d.ay + 2, 8, d.by - d.ay - 4);
    });

    // Saucer and its progress lights.
    const sc = t.saucer;
    g.fillStyle = '#020617';
    g.beginPath();
    g.arc(sc.x, sc.y, sc.r + 2, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = r.captured ? '#ffffff' : '#a78bfa';
    g.lineWidth = 3;
    g.stroke();
    for (let k = 0; k < 3; k++) {
      const on = r.saucerHits % 3 > k || (r.captured && blink);
      g.fillStyle = on ? '#a78bfa' : 'rgba(167,139,250,0.2)';
      g.beginPath();
      g.arc(sc.x - 44, sc.y - 22 + k * 22, 5, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = 'rgba(196,181,253,0.8)';
    g.font = '800 10px system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText('MULTIBALL', sc.x - 44, sc.y + 50);

    // Kickback light.
    g.fillStyle = r.kickbackLit ? '#34d399' : 'rgba(52,211,153,0.15)';
    g.beginPath();
    g.arc(39, 880, 7, 0, Math.PI * 2);
    g.fill();
    g.font = '800 9px system-ui, sans-serif';
    g.fillStyle = 'rgba(167,243,208,0.8)';
    g.fillText('KICK', 39, 900);

    // Multiplier lights.
    for (let m = 2; m <= 5; m++) {
      const on = r.multiplier >= m;
      const x = 208 + (m - 2) * 48;
      g.fillStyle = on ? GOLD : 'rgba(251,191,36,0.15)';
      g.font = '900 16px system-ui, sans-serif';
      g.fillText(`${m}X`, x, 700);
    }
    // Shoot again (ball save) light.
    const saveOn = r.time < r.ballSaveUntil && r.phase === 'playing';
    g.fillStyle = saveOn ? (blink ? '#f87171' : '#fca5a5') : 'rgba(248,113,113,0.12)';
    g.font = '900 12px system-ui, sans-serif';
    g.fillText('SHOOT AGAIN', 280, 960);

    // Flippers.
    for (const f of [t.leftFlipper, t.rightFlipper]) this.drawFlipper(g, f);

    // Plunger.
    const pull = r.plunger.charging ? r.plunger.charge * 36 : -r.plunger.release * 8;
    const top = PLUNGER_Y + pull;
    g.fillStyle = '#94a3b8';
    g.fillRect(LANE_X - 3, top + 6, 6, 1000 - top);
    g.strokeStyle = '#cbd5e1';
    g.lineWidth = 2;
    g.beginPath();
    const coils = 7;
    for (let i = 0; i <= coils; i++) {
      const y = top + 10 + ((1000 - top - 10) * i) / coils;
      g.lineTo(LANE_X + (i % 2 ? 9 : -9), y);
    }
    g.stroke();
    g.fillStyle = '#e2e8f0';
    g.fillRect(LANE_X - 16, top, 32, 7);
    if (r.plunger.charging) {
      g.fillStyle = `rgba(251, 191, 36, ${0.3 + r.plunger.charge * 0.7})`;
      g.fillRect(583, 990 - r.plunger.charge * 120, 8, r.plunger.charge * 120);
    }

    // Balls.
    for (const b of r.world.balls) {
      if (b.lost) continue;
      const grad = g.createRadialGradient(b.x - 4, b.y - 5, 1, b.x, b.y, b.r);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.35, '#e2e8f0');
      grad.addColorStop(1, '#64748b');
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.beginPath();
      g.arc(b.x + 3, b.y + 4, b.r, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = grad;
      g.beginPath();
      g.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      g.fill();
    }

    // Tilt tint.
    if (r.tilted) {
      g.fillStyle = 'rgba(239, 68, 68, 0.12)';
      g.fillRect(0, 0, W, H);
    }
    this.drawHud(g, now);
  }

  drawFlipper(g, f) {
    const [tx, ty] = flipperTip(f);
    const ang = Math.atan2(ty - f.y, tx - f.x);
    const nx = -Math.sin(ang);
    const ny = Math.cos(ang);
    g.fillStyle = '#f8fafc';
    g.strokeStyle = f.pressed ? '#fbcfe8' : PINK;
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(f.x + nx * f.r0, f.y + ny * f.r0);
    g.lineTo(tx + nx * f.r1, ty + ny * f.r1);
    g.arc(tx, ty, f.r1, ang + Math.PI / 2, ang - Math.PI / 2, true);
    g.lineTo(f.x - nx * f.r0, f.y - ny * f.r0);
    g.arc(f.x, f.y, f.r0, ang - Math.PI / 2, ang + Math.PI / 2, true);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = PINK;
    g.beginPath();
    g.arc(f.x, f.y, 4, 0, Math.PI * 2);
    g.fill();
  }

  drawHud(g, now) {
    const r = this.rules;
    const p = r.player;
    // Score box at the top of the playfield.
    g.fillStyle = 'rgba(2, 6, 23, 0.72)';
    g.strokeStyle = 'rgba(34, 211, 238, 0.35)';
    g.lineWidth = 1.5;
    roundRect(g, 150, 150, 260, 58, 12);
    g.fill();
    g.stroke();
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.fillStyle = '#f8fafc';
    g.font = '900 30px ui-monospace, Menlo, monospace';
    g.fillText(p.score.toLocaleString('en-US'), 280, 185);
    g.font = '700 11px system-ui, sans-serif';
    g.fillStyle = 'rgba(165, 243, 252, 0.85)';
    const who = r.players.length > 1 ? `${p.name.toUpperCase()} · ` : '';
    g.fillText(`${who}BALL ${Math.min(p.ball, r.ballsPerPlayer)} OF ${r.ballsPerPlayer}${r.multiplier > 1 ? ` · BONUS ${r.multiplier}X` : ''}`, 280, 201);

    // Messages.
    const msg = r.messages[r.messages.length - 1];
    if (msg) {
      const age = r.time - msg.start;
      const scale = Math.min(1, age * 8);
      g.save();
      g.translate(280, 610);
      g.scale(0.6 + 0.4 * scale, 0.6 + 0.4 * scale);
      g.font = '900 34px system-ui, sans-serif';
      g.lineWidth = 6;
      g.strokeStyle = 'rgba(2,6,23,0.85)';
      g.strokeText(msg.text, 0, 0);
      g.fillStyle = Math.floor(now / 120) % 2 ? GOLD : '#fef3c7';
      g.fillText(msg.text, 0, 0);
      g.restore();
    }
    if (r.phase === 'bonus' && r.bonusCount) {
      const bc = r.bonusCount;
      g.fillStyle = 'rgba(2, 6, 23, 0.8)';
      roundRect(g, 130, 560, 300, 96, 16);
      g.fill();
      g.fillStyle = '#f8fafc';
      g.font = '800 18px system-ui, sans-serif';
      g.fillText(bc.tilted ? 'TILT: NO BONUS' : `BONUS ${bc.base.toLocaleString('en-US')} × ${bc.mult}`, 280, 596);
      g.font = '900 30px ui-monospace, Menlo, monospace';
      g.fillStyle = GOLD;
      g.fillText(Math.round(bc.shown).toLocaleString('en-US'), 280, 636);
    }
    if (r.phase === 'plunger') {
      g.font = '800 13px system-ui, sans-serif';
      g.fillStyle = Math.floor(now / 400) % 2 ? 'rgba(248,250,252,0.9)' : 'rgba(248,250,252,0.45)';
      g.fillText('HOLD & RELEASE TO LAUNCH', 280, 780);
    }
  }
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
