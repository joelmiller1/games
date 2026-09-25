// Snake screen: smooth canvas renderer, keyboard, swipes and an on-screen arrow pad.
import { h } from '../ui.js';
import { play } from '../sound.js';
import { Snake } from './snake-core.js';
import { fitCanvas, Loop, holdButton, listenKeys, onResize } from './common.js';

export const info = {
  intro: 'Eat the apples to grow longer and faster. Grab the golden ones before they vanish.',
  keys: [
    [['←', '↑', '→', '↓'], 'Steer'],
    [['W', 'A', 'S', 'D'], 'Steer'],
    [['P'], 'Pause'],
  ],
  touch: 'Swipe on the board to steer, or use the arrow pad.',
};

const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

export function create({ host, options, seed, onProgress, onEnd }) {
  const box = host.getBoundingClientRect();
  const ratio = box.width / Math.max(1, box.height);
  const [cols, rows] = ratio > 1.15 ? [24, 18] : ratio < 0.87 ? [18, 24] : [20, 20];
  const game = new Snake({ seed, cols, rows, wrap: options?.walls === 'wrap' });
  const canvas = h('canvas', { class: 'ar-canvas', 'aria-label': 'Snake' });
  const wrap = h('div', { class: 'ar-canvas-wrap' }, canvas);

  const btn = (label, aria, d) => {
    const b = h('button', { class: 'ar-btn', type: 'button', 'aria-label': aria }, label);
    holdButton(b, { down: () => steer(d) });
    return b;
  };
  const pad = h('div', { class: 'ar-pad snake-pad' }, h('div', { class: 'dpad' }, btn('▲', 'Up', 'up'), btn('◀', 'Left', 'left'), btn('▼', 'Down', 'down'), btn('▶', 'Right', 'right')));
  const root = h('div', { class: 'ar-game snake' }, wrap, pad);
  host.append(root);

  let cell = 20;
  let dpr = 1;
  let cw = 0;
  let ch = 0;
  let started = false;
  let paused = false;
  let ended = false;
  let endTimer = 0;
  let lastScore = -1;
  let clock = 0;
  const pops = [];

  function steer(d) {
    if (!started || paused || game.over) return;
    const [dx, dy] = DIRS[d];
    game.turn(dx, dy);
  }

  const KEYMAP = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
  const offKeys = listenKeys((e) => {
    const d = KEYMAP[e.code];
    if (!d) return false;
    if (!e.repeat) steer(d);
    return true;
  });

  // Swipes: every 24px of travel in a clear direction is a turn.
  let sw = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    e.preventDefault();
    sw = { id: e.pointerId, x: e.clientX, y: e.clientY };
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!sw || e.pointerId !== sw.id) return;
    const dx = e.clientX - sw.x;
    const dy = e.clientY - sw.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    if (Math.abs(dx) > Math.abs(dy) * 1.2) steer(dx > 0 ? 'right' : 'left');
    else if (Math.abs(dy) > Math.abs(dx) * 1.2) steer(dy > 0 ? 'down' : 'up');
    sw.x = e.clientX;
    sw.y = e.clientY;
  });
  const endSwipe = (e) => {
    if (sw && e.pointerId === sw.id) sw = null;
  };
  canvas.addEventListener('pointerup', endSwipe);
  canvas.addEventListener('pointercancel', endSwipe);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  function resize() {
    const b = wrap.getBoundingClientRect();
    if (!b.width || !b.height) return;
    cell = Math.max(6, Math.floor(Math.min((b.width - 8) / cols, (b.height - 8) / rows)));
    cw = cell * cols;
    ch = cell * rows;
    dpr = fitCanvas(canvas, cw, ch);
    render();
  }

  function update(dt) {
    clock += dt;
    for (const p of pops) p.t -= dt;
    while (pops.length && pops[0].t <= 0) pops.shift();
    if (!started || paused) return;
    if (game.over) {
      endTimer += dt;
      if (!ended && endTimer > 1.2) {
        ended = true;
        onEnd({ score: game.score, stat: game.body.length, ok: true });
      }
      return;
    }
    game.update(dt);
    for (const ev of game.drain()) {
      if (ev.type === 'eat') {
        play('eat');
        pops.push({ x: ev.x, y: ev.y, text: `+${ev.points}`, t: 0.9 });
      } else if (ev.type === 'golden') {
        play('bonus');
        pops.push({ x: ev.x, y: ev.y, text: `+${ev.points}`, t: 1.2, gold: true });
      } else if (ev.type === 'crash') play('crash');
    }
    if (game.score !== lastScore) {
      lastScore = game.score;
      onProgress({ score: game.score, stat: game.body.length });
    }
  }

  function apple(ctx, x, y, r, gold) {
    const bob = Math.sin(clock * 4 + x) * r * 0.06;
    ctx.fillStyle = gold ? '#facc15' : '#ef4444';
    ctx.beginPath();
    ctx.arc(x, y + bob, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = gold ? '#fef9c3' : '#fecaca';
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.arc(x - r * 0.35, y - r * 0.35 + bob, r * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#65a30d';
    ctx.lineWidth = Math.max(1.5, r * 0.22);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y - r * 0.8 + bob);
    ctx.quadraticCurveTo(x + r * 0.2, y - r * 1.3 + bob, x + r * 0.55, y - r * 1.25 + bob);
    ctx.stroke();
  }

  function render() {
    if (!cw) return;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const c = cell;
    // board
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        ctx.fillStyle = (x + y) % 2 ? '#14532d' : '#166534';
        ctx.fillRect(x * c, y * c, c, c);
      }
    }
    if (!game.wrapWalls) {
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, cw - 4, ch - 4);
    }
    // food
    if (game.food) apple(ctx, (game.food.x + 0.5) * c, (game.food.y + 0.55) * c, c * 0.36, false);
    if (game.golden) {
      const gx = (game.golden.x + 0.5) * c;
      const gy = (game.golden.y + 0.55) * c;
      ctx.strokeStyle = 'rgba(250,204,21,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(gx, gy - c * 0.05, c * 0.5, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * game.golden.t) / 6);
      ctx.stroke();
      apple(ctx, gx, gy, c * 0.34 * (1 + Math.sin(clock * 8) * 0.06), true);
    }
    // snake: interpolate every segment between its last and current cell
    const t = game.progress();
    const pts = game.body.map((cur, i) => {
      const prev = game.prev[i] || game.prev[game.prev.length - 1] || cur;
      const jump = Math.abs(cur.x - prev.x) + Math.abs(cur.y - prev.y) > 1;
      const k = game.over ? 1 : t;
      return jump ? { x: cur.x, y: cur.y } : { x: prev.x + (cur.x - prev.x) * k, y: prev.y + (cur.y - prev.y) * k };
    });
    const dead = game.over && Math.floor(endTimer * 8) % 2 === 0;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = pts.length - 1; i > 0; i--) {
      const a = pts[i];
      const b = pts[i - 1];
      if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) > 1.5) continue;
      const f = i / Math.max(1, pts.length - 1);
      ctx.strokeStyle = dead ? '#9ca3af' : `hsl(${95 - f * 25}, 75%, ${58 - f * 18}%)`;
      ctx.lineWidth = c * (0.78 - f * 0.22);
      ctx.beginPath();
      ctx.moveTo((a.x + 0.5) * c, (a.y + 0.5) * c);
      ctx.lineTo((b.x + 0.5) * c, (b.y + 0.5) * c);
      ctx.stroke();
    }
    const head = pts[0];
    const hx = (head.x + 0.5) * c;
    const hy = (head.y + 0.5) * c;
    ctx.fillStyle = dead ? '#9ca3af' : '#bef264';
    ctx.beginPath();
    ctx.arc(hx, hy, c * 0.44, 0, Math.PI * 2);
    ctx.fill();
    const d = game.dir;
    const px = -d.y;
    const py = d.x;
    for (const side of [-1, 1]) {
      const ex = hx + d.x * c * 0.14 + px * side * c * 0.2;
      const ey = hy + d.y * c * 0.14 + py * side * c * 0.2;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(ex, ey, c * 0.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#111827';
      ctx.beginPath();
      ctx.arc(ex + d.x * c * 0.04, ey + d.y * c * 0.04, c * 0.06, 0, Math.PI * 2);
      ctx.fill();
    }
    if (!game.over && Math.floor(clock * 2) % 3 === 0) {
      ctx.strokeStyle = '#f43f5e';
      ctx.lineWidth = Math.max(1.5, c * 0.07);
      ctx.beginPath();
      ctx.moveTo(hx + d.x * c * 0.42, hy + d.y * c * 0.42);
      ctx.lineTo(hx + d.x * c * 0.62, hy + d.y * c * 0.62);
      ctx.stroke();
    }
    // score pop-ups and HUD
    ctx.textAlign = 'center';
    for (const p of pops) {
      ctx.globalAlpha = Math.min(1, p.t * 2);
      ctx.fillStyle = p.gold ? '#fde047' : '#fff';
      ctx.font = `800 ${Math.round(c * 0.6)}px ${FONT}`;
      ctx.fillText(p.text, (p.x + 0.5) * c, (p.y + 0.2) * c - (1 - p.t) * c);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
    ctx.font = `800 ${Math.max(14, Math.round(c * 0.75))}px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(game.score.toLocaleString('en-US'), c * 0.4, c * 0.95);
    if (game.over) {
      ctx.fillStyle = 'rgba(5,8,22,0.5)';
      ctx.fillRect(0, ch / 2 - c * 1.2, cw, c * 2.2);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.font = `800 ${Math.round(c * 1.2)}px ${FONT}`;
      ctx.fillText('GAME OVER', cw / 2, ch / 2 + c * 0.35);
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
    },
    destroy() {
      loop.stop();
      offKeys();
      offResize();
    },
  };
}
