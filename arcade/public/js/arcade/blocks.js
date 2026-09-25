// Falling Blocks screen: jewels drawn with a distinct shape per colour (easy to tell apart for
// colour-blind players), keyboard controls with auto-repeat, touch gestures and buttons.
import { h } from '../ui.js';
import { play } from '../sound.js';
import { FallingBlocks, COLS, ROWS, HIDDEN } from './blocks-core.js';
import { fitCanvas, Loop, holdButton, listenKeys, onResize } from './common.js';

export const info = {
  intro: 'Line up three or more jewels of one colour, across, down or diagonally. Falling jewels can set off chains.',
  keys: [
    [['←', '→'], 'Move'],
    [['↑', 'X'], 'Cycle the jewels'],
    [['Z'], 'Cycle the other way'],
    [['↓'], 'Soft drop'],
    [['Space'], 'Hard drop'],
    [['P'], 'Pause'],
  ],
  touch: 'Tap to cycle the jewels, drag to move, drag down to drop faster and flick down to drop.',
};

const VISIBLE = ROWS - HIDDEN;
const JEWEL = [
  { color: '#ef4444', shape: 'circle' },
  { color: '#facc15', shape: 'diamond' },
  { color: '#22c55e', shape: 'square' },
  { color: '#22d3ee', shape: 'hexagon' },
  { color: '#3b82f6', shape: 'triangle' },
  { color: '#c084fc', shape: 'star' },
];
const DAS = 0.17;
const ARR = 0.06;
const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

function light(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(v + (f > 0 ? (255 - v) * f : v * f))));
  return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

function shapePath(ctx, shape, cx, cy, r) {
  ctx.beginPath();
  if (shape === 'circle') ctx.arc(cx, cy, r * 0.9, 0, Math.PI * 2);
  else if (shape === 'diamond') {
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r * 0.85, cy);
    ctx.lineTo(cx, cy + r);
    ctx.lineTo(cx - r * 0.85, cy);
  } else if (shape === 'square') {
    const s = r * 0.8;
    ctx.moveTo(cx - s + r * 0.25, cy - s);
    ctx.arcTo(cx + s, cy - s, cx + s, cy + s, r * 0.25);
    ctx.arcTo(cx + s, cy + s, cx - s, cy + s, r * 0.25);
    ctx.arcTo(cx - s, cy + s, cx - s, cy - s, r * 0.25);
    ctx.arcTo(cx - s, cy - s, cx + s, cy - s, r * 0.25);
  } else if (shape === 'hexagon') {
    for (let k = 0; k < 6; k++) {
      const a = (Math.PI / 3) * k + Math.PI / 6;
      ctx[k ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * r * 0.95, cy + Math.sin(a) * r * 0.95);
    }
  } else if (shape === 'triangle') {
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r * 0.95, cy + r * 0.75);
    ctx.lineTo(cx - r * 0.95, cy + r * 0.75);
  } else {
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (Math.PI / 5) * k;
      const rr = k % 2 ? r * 0.45 : r;
      ctx[k ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
  }
  ctx.closePath();
}

function jewel(ctx, c, x, y, s, alpha = 1) {
  const { color, shape } = JEWEL[c];
  const cx = x + s / 2;
  const cy = y + s / 2;
  const r = s * 0.42;
  ctx.globalAlpha = alpha;
  const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r * 1.1);
  g.addColorStop(0, light(color, 0.55));
  g.addColorStop(0.55, color);
  g.addColorStop(1, light(color, -0.45));
  shapePath(ctx, shape, cx, cy, r);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = Math.max(1, s * 0.05);
  ctx.strokeStyle = light(color, -0.55);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath();
  ctx.arc(cx - r * 0.32, cy - r * 0.38, Math.max(1.2, r * 0.13), 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

export function create({ host, seed, onProgress, onEnd }) {
  const game = new FallingBlocks({ seed });
  const canvas = h('canvas', { class: 'ar-canvas', 'aria-label': 'Falling Blocks well' });
  const wrap = h('div', { class: 'ar-canvas-wrap' }, canvas);
  const keys = { left: false, right: false, soft: false };
  let softTouch = false;
  let dir = 0;
  let das = 0;
  let arr = 0;
  let cell = 30;
  let dpr = 1;
  let W = 0;
  let H = 0;
  let started = false;
  let paused = false;
  let ended = false;
  let endTimer = 0;
  let clock = 0;
  let lastScore = -1;
  let lastJewels = -1;
  const popups = [];
  const L = {};

  const btn = (label, aria) => h('button', { class: 'ar-btn', type: 'button', 'aria-label': aria }, label);
  const bCycle = btn('⟳', 'Cycle the jewels');
  const bLeft = btn('◀', 'Move left');
  const bSoft = btn('▼', 'Soft drop');
  const bRight = btn('▶', 'Move right');
  const bDrop = btn('⤓', 'Hard drop');
  const pad = h('div', { class: 'ar-pad' }, bCycle, bLeft, bSoft, bRight, bDrop);
  const root = h('div', { class: 'ar-game fb' }, wrap, pad);
  host.append(root);

  const live = () => started && !paused && !game.over;
  holdButton(bCycle, { down: () => live() && game.cycle(1) });
  holdButton(bLeft, { down: () => live() && game.move(-1), repeat: { delay: 170, every: 60 } });
  holdButton(bRight, { down: () => live() && game.move(1), repeat: { delay: 170, every: 60 } });
  holdButton(bSoft, { down: () => (softTouch = true), up: () => (softTouch = false) });
  holdButton(bDrop, { down: () => live() && game.hardDrop() });

  function resize() {
    const r = wrap.getBoundingClientRect();
    if (!r.width || !r.height) return;
    cell = Math.max(10, Math.floor(Math.min(r.width / 11.2, r.height / (VISIBLE + 0.5))));
    W = Math.round(cell * 11.2);
    H = Math.round(cell * (VISIBLE + 0.5));
    dpr = fitCanvas(canvas, W, H);
    L.bx = Math.round(cell * 0.2);
    L.by = Math.round(cell * 0.25);
    L.sx = L.bx + cell * COLS + cell * 0.6;
    L.sw = W - L.sx - cell * 0.2;
    render();
  }

  // ---- keyboard ----
  const offKeys = listenKeys(
    (e) => {
      const k = e.code;
      if (!['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'Space', 'KeyX', 'KeyZ', 'KeyA', 'KeyD', 'KeyS', 'KeyW'].includes(k)) return false;
      if (!live() || e.repeat) return true;
      if (k === 'ArrowLeft' || k === 'KeyA') {
        keys.left = true;
        dir = -1;
        das = arr = 0;
        game.move(-1);
      } else if (k === 'ArrowRight' || k === 'KeyD') {
        keys.right = true;
        dir = 1;
        das = arr = 0;
        game.move(1);
      } else if (k === 'ArrowDown' || k === 'KeyS') keys.soft = true;
      else if (k === 'Space') game.hardDrop();
      else if (k === 'ArrowUp' || k === 'KeyX' || k === 'KeyW') game.cycle(1);
      else if (k === 'KeyZ') game.cycle(-1);
      return true;
    },
    (e) => {
      const k = e.code;
      if (k === 'ArrowLeft' || k === 'KeyA') {
        keys.left = false;
        if (dir === -1) dir = keys.right ? 1 : 0;
      } else if (k === 'ArrowRight' || k === 'KeyD') {
        keys.right = false;
        if (dir === 1) dir = keys.left ? -1 : 0;
      } else if (k === 'ArrowDown' || k === 'KeyS') keys.soft = false;
      else return false;
      return true;
    },
  );

  // ---- touch gestures ----
  let g = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || !live()) return;
    e.preventDefault();
    g = { id: e.pointerId, x0: e.clientX, y0: e.clientY, sx: e.clientX, sy: e.clientY, t0: performance.now(), moved: false };
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!g || e.pointerId !== g.id || !live()) return;
    const step = cell * 0.9;
    while (e.clientX - g.sx >= step) {
      game.move(1);
      g.sx += step;
      g.moved = true;
    }
    while (g.sx - e.clientX >= step) {
      game.move(-1);
      g.sx -= step;
      g.moved = true;
    }
    while (e.clientY - g.sy >= step) {
      if (game.piece && game.stepDown()) game.score += 1;
      g.sy += step;
      g.moved = true;
    }
    if (g.sy - e.clientY > step) g.sy = e.clientY;
  });
  const endGesture = (e) => {
    if (!g || e.pointerId !== g.id) return;
    const t = Math.max(1, performance.now() - g.t0);
    const dx = e.clientX - g.x0;
    const dy = e.clientY - g.y0;
    const moved = g.moved;
    g = null;
    if (e.type === 'pointercancel' || !live()) return;
    if (dy > cell * 1.4 && dy / t > 0.8) game.hardDrop();
    else if (!moved && Math.hypot(dx, dy) < 14 && t < 400) game.cycle(1);
  };
  canvas.addEventListener('pointerup', endGesture);
  canvas.addEventListener('pointercancel', endGesture);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---- simulation ----
  function update(dt) {
    clock += dt;
    for (const p of popups) p.t -= dt;
    while (popups.length && popups[0].t <= 0) popups.shift();
    if (!started || paused) return;
    if (game.over) {
      if (!ended) {
        endTimer += dt;
        if (endTimer > 1.3) {
          ended = true;
          onEnd({ score: game.score, stat: game.jewels, ok: true });
        }
      }
      return;
    }
    if (dir !== 0 && (dir === -1 ? keys.left : keys.right)) {
      das += dt;
      if (das >= DAS) {
        arr += dt;
        while (arr >= ARR) {
          arr -= ARR;
          if (!game.move(dir)) break;
        }
      }
    }
    game.update(dt, keys.soft || softTouch);
    for (const ev of game.drain()) {
      if (ev.type === 'move') play('shift', 30);
      else if (ev.type === 'cycle') play('rotate', 30);
      else if (ev.type === 'lock') play('lock', 40);
      else if (ev.type === 'clear') {
        play(ev.chain > 1 ? 'tetris' : 'lines');
        popups.push({ text: ev.chain > 1 ? `Chain ×${ev.chain}!` : `${ev.count} jewels`, points: ev.points, t: 1.3 });
      } else if (ev.type === 'levelup') {
        play('levelup');
        popups.push({ text: `Level ${ev.level}`, t: 1.6 });
      } else if (ev.type === 'gameover') play('crash');
    }
    if (game.score !== lastScore || game.jewels !== lastJewels) {
      lastScore = game.score;
      lastJewels = game.jewels;
      onProgress({ score: game.score, stat: game.jewels });
    }
  }

  function render() {
    if (!W) return;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const c = cell;
    const { bx, by, sx, sw } = L;
    // well
    const bg = ctx.createLinearGradient(0, by, 0, by + VISIBLE * c);
    bg.addColorStop(0, '#1a1036');
    bg.addColorStop(1, '#0a0a1f');
    ctx.fillStyle = bg;
    ctx.fillRect(bx - 2, by - 2, COLS * c + 4, VISIBLE * c + 4);
    ctx.strokeStyle = 'rgba(192,132,252,0.45)';
    ctx.lineWidth = 2;
    ctx.strokeRect(bx - 2, by - 2, COLS * c + 4, VISIBLE * c + 4);
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    for (let x = 0; x < COLS; x++) for (let y = 0; y < VISIBLE; y++) if ((x + y) % 2) ctx.fillRect(bx + x * c, by + y * c, c, c);
    const gy = (y) => by + (y - HIDDEN) * c;
    const flash = game.phase === 'clearing' ? new Set(game.matched) : null;
    const over = game.over;
    const grey = over ? Math.floor(endTimer * 14) : 0;
    for (let y = HIDDEN; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const v = game.board[y][x];
        if (v === null) continue;
        if (flash && flash.has(y * COLS + x)) {
          const on = Math.floor(clock * 16) % 2 === 0;
          jewel(ctx, v, bx + x * c, gy(y), c, on ? 1 : 0.35);
          if (on) {
            ctx.fillStyle = 'rgba(255,255,255,0.35)';
            ctx.fillRect(bx + x * c + 2, gy(y) + 2, c - 4, c - 4);
          }
        } else if (over && y >= ROWS - grey) {
          ctx.globalAlpha = 0.5;
          jewel(ctx, v, bx + x * c, gy(y), c, 0.35);
          ctx.globalAlpha = 1;
        } else jewel(ctx, v, bx + x * c, gy(y), c);
      }
    }
    if (game.piece && !over) {
      const ghost = game.ghost();
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = 2;
      for (const [x, y] of game.cells(ghost)) if (y >= HIDDEN) ctx.strokeRect(bx + x * c + 3, gy(y) + 3, c - 6, c - 6);
      for (const [x, y, v] of game.cells()) if (y >= HIDDEN) jewel(ctx, v, bx + x * c, gy(y), c);
    }
    // pop-ups
    ctx.textAlign = 'center';
    for (const p of popups) {
      const rise = (1.4 - p.t) * c * 0.8;
      ctx.globalAlpha = Math.min(1, p.t / 0.4);
      ctx.fillStyle = '#fff';
      ctx.font = `800 ${Math.round(c * 0.72)}px ${FONT}`;
      ctx.fillText(p.text, bx + (COLS * c) / 2, by + c * 5 - rise);
      if (p.points) {
        ctx.fillStyle = '#fde68a';
        ctx.font = `700 ${Math.round(c * 0.5)}px ${FONT}`;
        ctx.fillText(`+${p.points.toLocaleString('en-US')}`, bx + (COLS * c) / 2, by + c * 5.8 - rise);
      }
      ctx.globalAlpha = 1;
    }
    if (over) {
      ctx.fillStyle = 'rgba(5,8,22,0.6)';
      ctx.fillRect(bx, by + c * 5, COLS * c, c * 2.4);
      ctx.fillStyle = '#fff';
      ctx.font = `800 ${Math.round(c * 0.85)}px ${FONT}`;
      ctx.fillText('GAME OVER', bx + (COLS * c) / 2, by + c * 6.5);
    }
    // side column
    ctx.textAlign = 'left';
    const label = (text, y) => {
      ctx.fillStyle = '#94a3b8';
      ctx.font = `800 ${Math.round(c * 0.38)}px ${FONT}`;
      ctx.fillText(text, sx, y);
    };
    label('NEXT', by + c * 0.45);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(sx, by + c * 0.65, sw, c * 3.3);
    const ns = c * 0.95;
    game.next.forEach((v, k) => jewel(ctx, v, sx + (sw - ns) / 2, by + c * 0.8 + k * ns, ns));
    const stat = (name, value, y) => {
      label(name, y);
      ctx.fillStyle = '#fff';
      ctx.font = `800 ${Math.round(c * 0.62)}px ${FONT}`;
      ctx.fillText(value, sx, y + c * 0.7);
    };
    stat('SCORE', game.score.toLocaleString('en-US'), by + c * 5);
    stat('LEVEL', String(game.level), by + c * 6.7);
    stat('JEWELS', String(game.jewels), by + c * 8.4);
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
      keys.left = keys.right = keys.soft = false;
      softTouch = false;
      dir = 0;
    },
    destroy() {
      loop.stop();
      offKeys();
      offResize();
    },
  };
}
