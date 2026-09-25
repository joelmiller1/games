// Asteroids screen: vector-style canvas renderer with glow, keyboard and touch buttons.
import { h } from '../ui.js';
import { play } from '../sound.js';
import { Asteroids } from './asteroids-core.js';
import { seeded } from './rng.js';
import { fitCanvas, Loop, holdButton, listenKeys, onResize } from './common.js';

export const info = {
  intro: 'Blast the rocks before they hit you. Watch out for flying saucers, they shoot back.',
  keys: [
    [['←', '→'], 'Rotate'],
    [['↑'], 'Thrust'],
    [['Space'], 'Fire'],
    [['↓', 'Shift'], 'Hyperspace'],
    [['P'], 'Pause'],
  ],
  touch: 'Use the buttons: rotate on the left, thrust and fire on the right, and the middle one for hyperspace.',
};

const FONT = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
const SHIP = [
  [14, 0],
  [-10, -9],
  [-6, 0],
  [-10, 9],
];

export function create({ host, seed, onProgress, onEnd }) {
  const r = host.getBoundingClientRect();
  const portrait = r.height > r.width * 1.05;
  const W = portrait ? 750 : 1000;
  const H = portrait ? 1000 : 750;
  const game = new Asteroids({ seed, width: W, height: H });
  const canvas = h('canvas', { class: 'ar-canvas', 'aria-label': 'Asteroids' });
  const wrap = h('div', { class: 'ar-canvas-wrap' }, canvas);
  const input = { left: false, right: false, thrust: false, fire: false, hyper: false };
  const touch = { left: false, right: false, thrust: false, fire: false };

  const btn = (label, aria, cls = '') => h('button', { class: `ar-btn ${cls}`, type: 'button', 'aria-label': aria }, label);
  const bL = btn('⟲', 'Rotate left');
  const bR = btn('⟳', 'Rotate right');
  const bHyper = btn(h('small', 'HYPER'), 'Hyperspace', 'wide');
  const bThrust = btn('▲', 'Thrust');
  const bFire = btn('●', 'Fire');
  holdButton(bL, { down: () => (touch.left = true), up: () => (touch.left = false) });
  holdButton(bR, { down: () => (touch.right = true), up: () => (touch.right = false) });
  holdButton(bThrust, { down: () => (touch.thrust = true), up: () => (touch.thrust = false) });
  holdButton(bFire, { down: () => (touch.fire = true), up: () => (touch.fire = false) });
  holdButton(bHyper, { down: () => (input.hyper = true) });
  const pad = h('div', { class: 'ar-pad ast-pad' }, h('div', { class: 'ar-group' }, bL, bR), bHyper, h('div', { class: 'ar-group' }, bThrust, bFire));
  const root = h('div', { class: 'ar-game ast' }, wrap, pad);
  host.append(root);

  // Stars never move: draw them once per size.
  const starRng = seeded(seed ^ 0x5eed);
  const stars = Array.from({ length: 90 }, () => ({ x: starRng() * W, y: starRng() * H, a: 0.25 + starRng() * 0.5, s: starRng() < 0.15 ? 1.6 : 1 }));

  let scale = 1;
  let dpr = 1;
  let cw = 0;
  let ch = 0;
  let started = false;
  let paused = false;
  let ended = false;
  let lastScore = -1;
  let lastWave = -1;
  let banner = { text: 'WAVE 1', t: 2 };
  let thrustSound = 0;

  const keys = new Set();
  const offKeys = listenKeys(
    (e) => {
      const k = e.code;
      const map = { ArrowLeft: 1, KeyA: 1, ArrowRight: 1, KeyD: 1, ArrowUp: 1, KeyW: 1, Space: 1, KeyK: 1, ArrowDown: 1, KeyS: 1, ShiftLeft: 1, ShiftRight: 1 };
      if (!map[k]) return false;
      if (!e.repeat && (k === 'ArrowDown' || k === 'KeyS' || k.startsWith('Shift'))) input.hyper = true;
      keys.add(k);
      return true;
    },
    (e) => {
      if (!keys.has(e.code)) return false;
      keys.delete(e.code);
      return true;
    },
  );

  function resize() {
    const b = wrap.getBoundingClientRect();
    if (!b.width || !b.height) return;
    scale = Math.min(b.width / W, b.height / H);
    cw = Math.floor(W * scale);
    ch = Math.floor(H * scale);
    dpr = fitCanvas(canvas, cw, ch);
    render();
  }

  function readInput() {
    input.left = touch.left || keys.has('ArrowLeft') || keys.has('KeyA');
    input.right = touch.right || keys.has('ArrowRight') || keys.has('KeyD');
    input.thrust = touch.thrust || keys.has('ArrowUp') || keys.has('KeyW');
    input.fire = touch.fire || keys.has('Space') || keys.has('KeyK');
  }

  function update(dt) {
    if (banner) {
      banner.t -= dt;
      if (banner.t <= 0) banner = null;
    }
    if (!started || paused) return;
    readInput();
    game.update(dt, input);
    for (const ev of game.drain()) {
      if (ev.type === 'fire') play('laser', 40);
      else if (ev.type === 'rock') play(ev.size >= 3 ? 'rock' : 'rockSmall', 30);
      else if (ev.type === 'crash') play('crash');
      else if (ev.type === 'extra') {
        play('extra');
        banner = { text: 'EXTRA SHIP', t: 1.6 };
      } else if (ev.type === 'beat') play(ev.hi ? 'beatHi' : 'beatLo');
      else if (ev.type === 'saucerTone') play('saucer', 100);
      else if (ev.type === 'hyper') play('launch');
      else if (ev.type === 'wave' && game.wave > 1) banner = { text: `WAVE ${ev.wave}`, t: 2 };
    }
    if (game.ship?.thrust) {
      thrustSound -= dt;
      if (thrustSound <= 0) {
        play('thrust', 80);
        thrustSound = 0.11;
      }
    }
    if (game.score !== lastScore || game.wave !== lastWave) {
      lastScore = game.score;
      lastWave = game.wave;
      onProgress({ score: game.score, stat: game.wave });
    }
    if (game.ended && !ended) {
      ended = true;
      onEnd({ score: game.score, stat: game.wave, ok: true });
    }
  }

  // ---- drawing ----
  function glowPath(ctx, draw, color, width = 1.6) {
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.18;
    ctx.lineWidth = width * 3.2;
    ctx.beginPath();
    draw();
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.lineWidth = width;
    ctx.beginPath();
    draw();
    ctx.stroke();
  }

  /** Draw something that may straddle an edge at every wrapped position it touches. */
  function wrapped(o, rad, fn) {
    const xs = [0];
    const ys = [0];
    if (o.x < rad) xs.push(W);
    if (o.x > W - rad) xs.push(-W);
    if (o.y < rad) ys.push(H);
    if (o.y > H - rad) ys.push(-H);
    for (const dx of xs) for (const dy of ys) fn(o.x + dx, o.y + dy);
  }

  function shipPath(ctx, x, y, a, s = 1) {
    const c = Math.cos(a);
    const sn = Math.sin(a);
    SHIP.forEach(([px, py], i) => {
      const X = x + (px * c - py * sn) * s;
      const Y = y + (px * sn + py * c) * s;
      if (i === 0) ctx.moveTo(X, Y);
      else ctx.lineTo(X, Y);
    });
    ctx.closePath();
  }

  function render() {
    if (!cw) return;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#04060d';
    ctx.fillRect(0, 0, cw, ch);
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const st of stars) {
      ctx.globalAlpha = st.a;
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(st.x, st.y, st.s * 1.5, st.s * 1.5);
    }
    ctx.globalAlpha = 1;
    // rocks
    for (const rk of game.rocks) {
      wrapped(rk, rk.r, (x, y) =>
        glowPath(
          ctx,
          () => {
            const n = rk.shape.length;
            for (let i = 0; i <= n; i++) {
              const a = rk.rot + (i / n) * Math.PI * 2;
              const rr = rk.r * rk.shape[i % n];
              if (i === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
              else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
            }
          },
          '#e2e8f0',
          2,
        ),
      );
    }
    // saucer
    const s = game.saucer;
    if (s) {
      const k = s.r / 18;
      glowPath(
        ctx,
        () => {
          ctx.moveTo(s.x - 18 * k, s.y);
          ctx.lineTo(s.x + 18 * k, s.y);
          ctx.lineTo(s.x + 10 * k, s.y + 7 * k);
          ctx.lineTo(s.x - 10 * k, s.y + 7 * k);
          ctx.closePath();
          ctx.moveTo(s.x - 18 * k, s.y);
          ctx.lineTo(s.x - 10 * k, s.y - 6 * k);
          ctx.lineTo(s.x + 10 * k, s.y - 6 * k);
          ctx.lineTo(s.x + 18 * k, s.y);
          ctx.moveTo(s.x - 6 * k, s.y - 6 * k);
          ctx.lineTo(s.x - 4 * k, s.y - 12 * k);
          ctx.lineTo(s.x + 4 * k, s.y - 12 * k);
          ctx.lineTo(s.x + 6 * k, s.y - 6 * k);
        },
        '#fda4af',
        2,
      );
    }
    // bullets
    for (const b of game.bullets) {
      ctx.fillStyle = b.mine ? '#fde047' : '#fb7185';
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.arc(b.x, b.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(b.x, b.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    // particles and debris
    for (const p of game.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 1.2, p.y - 1.2, 2.4, 2.4);
    }
    ctx.globalAlpha = 1;
    for (const d of game.debris) {
      ctx.globalAlpha = Math.min(1, d.life);
      const c = Math.cos(d.a);
      const sn = Math.sin(d.a);
      const [x1, y1, x2, y2] = d.seg;
      glowPath(
        ctx,
        () => {
          ctx.moveTo(d.x + x1 * c - y1 * sn, d.y + x1 * sn + y1 * c);
          ctx.lineTo(d.x + x2 * c - y2 * sn, d.y + x2 * sn + y2 * c);
        },
        '#a5f3fc',
      );
    }
    ctx.globalAlpha = 1;
    // ship
    const sh = game.ship;
    if (sh && sh.hidden <= 0 && (sh.invuln <= 0 || Math.floor(game.time * 10) % 2 === 0)) {
      wrapped(sh, 16, (x, y) => {
        glowPath(ctx, () => shipPath(ctx, x, y, sh.a), '#a5f3fc', 2);
        if (sh.thrust && Math.floor(game.time * 30) % 2 === 0) {
          const c = Math.cos(sh.a);
          const sn = Math.sin(sh.a);
          const pt = (px, py) => [x + px * c - py * sn, y + px * sn + py * c];
          glowPath(
            ctx,
            () => {
              ctx.moveTo(...pt(-7, -4));
              ctx.lineTo(...pt(-17 - Math.random() * 5, 0));
              ctx.lineTo(...pt(-7, 4));
            },
            '#fb923c',
            2,
          );
        }
      });
    }
    // HUD
    ctx.fillStyle = '#e2e8f0';
    ctx.textAlign = 'left';
    ctx.font = `700 ${28}px ${FONT}`;
    ctx.fillText(game.score.toLocaleString('en-US'), 18, 40);
    ctx.strokeStyle = '#a5f3fc';
    ctx.lineWidth = 1.6;
    for (let i = 0; i < Math.min(game.lives, 8); i++) {
      ctx.beginPath();
      shipPath(ctx, 28 + i * 22, 66, -Math.PI / 2, 0.75);
      ctx.stroke();
    }
    ctx.textAlign = 'right';
    ctx.font = `700 ${18}px ${FONT}`;
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`WAVE ${game.wave}`, W - 18, 36);
    if (banner || game.over) {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.globalAlpha = game.over ? 1 : Math.min(1, banner.t);
      ctx.font = `800 ${game.over ? 54 : 40}px ${FONT}`;
      ctx.fillText(game.over ? 'GAME OVER' : banner.text, W / 2, H * 0.42);
      ctx.globalAlpha = 1;
    }
    if (!game.ship && !game.over && game.respawnTimer <= 0) {
      ctx.textAlign = 'center';
      ctx.font = `600 ${18}px ${FONT}`;
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('Waiting for a clear space…', W / 2, H / 2);
    }
  }

  const loop = new Loop({ step: 1 / 120, update, render });
  const offResize = onResize(wrap, resize);
  requestAnimationFrame(resize);
  loop.start();

  return {
    start() {
      started = true;
    },
    setPaused(p) {
      paused = p;
      keys.clear();
      Object.keys(touch).forEach((k) => (touch[k] = false));
    },
    destroy() {
      loop.stop();
      offKeys();
      offResize();
    },
  };
}
