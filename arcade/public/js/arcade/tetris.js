// Tetris screen: canvas renderer, keyboard controls with auto-repeat, touch gestures and buttons.
import { h } from '../ui.js';
import { play } from '../sound.js';
import { Tetris, COLS, HIDDEN, CELLS } from './tetris-core.js';
import { fitCanvas, Loop, holdButton, listenKeys, onResize } from './common.js';

export const info = {
  intro: 'Clear lines, chain T-spins and Tetrises, and hang on as the pieces speed up.',
  keys: [
    [['←', '→'], 'Move'],
    [['↓'], 'Soft drop'],
    [['Space'], 'Hard drop'],
    [['↑', 'X'], 'Rotate'],
    [['Z'], 'Rotate back'],
    [['C'], 'Hold'],
    [['P'], 'Pause'],
  ],
  touch: 'Tap to rotate, drag to move, drag down to drop faster, flick down to drop and flick up (or tap HOLD) to hold.',
};

export const COLORS = { I: '#22d3ee', O: '#facc15', T: '#a855f7', S: '#22c55e', Z: '#ef4444', J: '#3b82f6', L: '#f97316' };
const DAS = 0.17;
const ARR = 0.05;
const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

function block(ctx, x, y, s, color, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(x + 1, y + 1, s - 2, s - 2);
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fillRect(x + 1, y + 1, s - 2, Math.max(1, s * 0.16));
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(x + 1, y + s * 0.8, s - 2, s * 0.2 - 1);
  ctx.globalAlpha = 1;
}

function miniPiece(ctx, type, cx, cy, s) {
  const cells = CELLS[type][0];
  const xs = cells.map((c) => c[0]);
  const ys = cells.map((c) => c[1]);
  const w = Math.max(...xs) - Math.min(...xs) + 1;
  const hgt = Math.max(...ys) - Math.min(...ys) + 1;
  const ox = cx - (w * s) / 2 - Math.min(...xs) * s;
  const oy = cy - (hgt * s) / 2 - Math.min(...ys) * s;
  for (const [x, y] of cells) block(ctx, ox + x * s, oy + y * s, s, COLORS[type]);
}

export function create({ host, options, seed, onProgress, onEnd }) {
  const start = Math.min(20, Math.max(1, Number(options?.start) || 1));
  const game = new Tetris({ seed, startLevel: start });
  const canvas = h('canvas', { class: 'ar-canvas', 'aria-label': 'Tetris board' });
  const wrap = h('div', { class: 'ar-canvas-wrap' }, canvas);

  const keys = { left: false, right: false, soft: false };
  let softTouch = false;
  let dir = 0;
  let das = 0;
  let arr = 0;
  let cell = 20;
  let dpr = 1;
  let W = 0;
  let H = 0;
  let lastScore = -1;
  let lastLines = -1;
  let ended = false;
  let endTimer = 0;
  let paused = false;
  let started = false;
  const popups = [];
  const trails = [];
  let clock = 0;

  const btn = (label, aria) => h('button', { class: 'ar-btn', type: 'button', 'aria-label': aria }, label);
  const bHold = btn(h('small', 'HOLD'), 'Hold piece');
  const bCcw = btn('↺', 'Rotate left');
  const bLeft = btn('◀', 'Move left');
  const bSoft = btn('▼', 'Soft drop');
  const bRight = btn('▶', 'Move right');
  const bCw = btn('↻', 'Rotate right');
  const bDrop = btn('⤓', 'Hard drop');
  const pad = h('div', { class: 'ar-pad' }, bHold, bCcw, bLeft, bSoft, bRight, bCw, bDrop);
  const root = h('div', { class: 'ar-game tt' }, wrap, pad);
  host.append(root);

  const live = () => started && !paused && !game.over;
  holdButton(bHold, { down: () => live() && game.holdPiece() });
  holdButton(bCcw, { down: () => live() && game.rotate(-1) });
  holdButton(bCw, { down: () => live() && game.rotate(1) });
  holdButton(bLeft, { down: () => live() && game.move(-1), repeat: { delay: 170, every: 50 } });
  holdButton(bRight, { down: () => live() && game.move(1), repeat: { delay: 170, every: 50 } });
  holdButton(bSoft, { down: () => (softTouch = true), up: () => (softTouch = false) });
  holdButton(bDrop, { down: () => live() && game.hardDrop() });

  // ---- layout ----
  const L = {};
  function resize() {
    const r = wrap.getBoundingClientRect();
    if (!r.width || !r.height) return;
    cell = Math.max(8, Math.floor(Math.min(r.width / 15.8, r.height / 20.4)));
    W = Math.round(cell * 15.8);
    H = Math.round(cell * 20.4);
    dpr = fitCanvas(canvas, W, H);
    L.bx = Math.round(cell * 0.2);
    L.by = Math.round(cell * 0.2);
    L.sx = L.bx + cell * 10 + cell * 0.6;
    L.sw = W - L.sx - cell * 0.2;
    L.hold = { x: L.sx, y: L.by + cell * 0.8, w: L.sw, h: cell * 2.6 };
    render();
  }

  // ---- keyboard ----
  function press(d) {
    dir = d;
    das = 0;
    arr = 0;
    game.move(d);
  }
  const offKeys = listenKeys(
    (e) => {
      const k = e.code;
      if (!['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'Space', 'KeyX', 'KeyZ', 'KeyC', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'KeyA', 'KeyD', 'KeyS', 'KeyW'].includes(k)) return false;
      if (!live()) return true;
      if (e.repeat) return true;
      if (k === 'ArrowLeft' || k === 'KeyA') {
        keys.left = true;
        press(-1);
      } else if (k === 'ArrowRight' || k === 'KeyD') {
        keys.right = true;
        press(1);
      } else if (k === 'ArrowDown' || k === 'KeyS') keys.soft = true;
      else if (k === 'Space') game.hardDrop();
      else if (k === 'ArrowUp' || k === 'KeyX' || k === 'KeyW') game.rotate(1);
      else if (k === 'KeyZ' || k.startsWith('Control')) game.rotate(-1);
      else if (k === 'KeyC' || k.startsWith('Shift')) game.holdPiece();
      return true;
    },
    (e) => {
      const k = e.code;
      if (k === 'ArrowLeft' || k === 'KeyA') {
        keys.left = false;
        if (dir === -1) {
          dir = keys.right ? 1 : 0;
          das = 0;
        }
      } else if (k === 'ArrowRight' || k === 'KeyD') {
        keys.right = false;
        if (dir === 1) {
          dir = keys.left ? -1 : 0;
          das = 0;
        }
      } else if (k === 'ArrowDown' || k === 'KeyS') keys.soft = false;
      else return false;
      return true;
    },
  );

  // ---- touch gestures on the board ----
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
    const step = cell * 0.9;
    if (dy > step * 1.5 && dy / t > 0.8) game.hardDrop();
    else if (-dy > step * 2 && Math.abs(dx) < step * 1.5 && -dy / t > 0.5) game.holdPiece();
    else if (!moved && Math.hypot(dx, dy) < 14 && t < 400) {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const hb = L.hold;
      if (hb && x >= hb.x && x <= hb.x + hb.w && y >= hb.y - cell && y <= hb.y + hb.h) game.holdPiece();
      else game.rotate(1);
    }
  };
  canvas.addEventListener('pointerup', endGesture);
  canvas.addEventListener('pointercancel', endGesture);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---- simulation ----
  function handleEvents() {
    for (const ev of game.drain()) {
      if (ev.type === 'move') play('shift', 30);
      else if (ev.type === 'rotate') play('rotate', 30);
      else if (ev.type === 'hold') play('hold');
      else if (ev.type === 'lock') play('lock', 40);
      else if (ev.type === 'harddrop') trails.push({ from: ev.from, to: ev.to, t: 0.2 });
      else if (ev.type === 'clear') {
        play(ev.lines >= 4 || ev.spin === 'full' ? 'tetris' : 'lines');
        const extra = [ev.b2b ? 'Back-to-back' : null, ev.combo > 0 ? `Combo ×${ev.combo}` : null].filter(Boolean).join(' · ');
        popups.push({ text: ev.label, sub: extra, points: ev.points, t: 1.4 });
      } else if (ev.type === 'levelup') {
        play('levelup');
        popups.push({ text: `Level ${ev.level}`, sub: '', t: 1.6 });
      } else if (ev.type === 'gameover') play('crash');
    }
  }

  function update(dt) {
    clock += dt;
    for (const p of popups) p.t -= dt;
    while (popups.length && popups[0].t <= 0) popups.shift();
    for (const t of trails) t.t -= dt;
    while (trails.length && trails[0].t <= 0) trails.shift();
    if (game.over) {
      if (!ended) {
        endTimer += dt;
        if (endTimer > 1.3) {
          ended = true;
          onEnd({ score: game.score, stat: game.lines, ok: true });
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
    handleEvents();
    if (game.score !== lastScore || game.lines !== lastLines) {
      lastScore = game.score;
      lastLines = game.lines;
      onProgress({ score: game.score, stat: game.lines });
    }
  }

  // ---- drawing ----
  function render() {
    const ctx = canvas.getContext('2d');
    if (!W) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const { bx, by, sx, sw } = L;
    const c = cell;
    // board
    ctx.fillStyle = '#0a0f1f';
    ctx.fillRect(bx - 2, by - 2, c * 10 + 4, c * 20 + 4);
    ctx.strokeStyle = 'rgba(148,163,184,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(bx - 2, by - 2, c * 10 + 4, c * 20 + 4);
    ctx.strokeStyle = 'rgba(255,255,255,0.045)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < COLS; x++) {
      ctx.moveTo(bx + x * c + 0.5, by);
      ctx.lineTo(bx + x * c + 0.5, by + 20 * c);
    }
    for (let y = 1; y < 20; y++) {
      ctx.moveTo(bx, by + y * c + 0.5);
      ctx.lineTo(bx + 10 * c, by + y * c + 0.5);
    }
    ctx.stroke();
    const gy = (y) => by + (y - HIDDEN) * c;
    const over = game.over;
    const grey = over ? Math.min(20, Math.floor(endTimer * 24)) : 0;
    for (let y = HIDDEN; y < game.board.length; y++) {
      for (let x = 0; x < COLS; x++) {
        const t = game.board[y][x];
        if (!t) continue;
        const faded = over && y >= game.board.length - grey;
        block(ctx, bx + x * c, gy(y), c, faded ? '#475569' : COLORS[t]);
      }
    }
    if (game.clearing) {
      ctx.fillStyle = `rgba(255,255,255,${Math.max(0, game.clearing.t / 0.22) * 0.85})`;
      for (const y of game.clearing.rows) ctx.fillRect(bx, gy(y), c * 10, c);
    }
    for (const t of trails) {
      ctx.fillStyle = `rgba(255,255,255,${(t.t / 0.2) * 0.18})`;
      const cols = new Map();
      for (const [x, y] of t.to) cols.set(x, Math.min(cols.get(x) ?? 99, y));
      const top = Math.max(HIDDEN, Math.min(...t.from.map((p) => p[1])));
      for (const [x, y] of cols) if (y > top) ctx.fillRect(bx + x * c + c * 0.15, gy(top), c * 0.7, (y - top) * c);
    }
    if (game.piece && !over) {
      const ghost = game.ghost();
      ctx.strokeStyle = COLORS[game.piece.type];
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 2;
      for (const [x, y] of game.cells(ghost)) if (y >= HIDDEN) ctx.strokeRect(bx + x * c + 2, gy(y) + 2, c - 4, c - 4);
      ctx.globalAlpha = 1;
      for (const [x, y] of game.cells()) if (y >= HIDDEN) block(ctx, bx + x * c, gy(y), c, COLORS[game.piece.type]);
    }
    // popups over the board
    for (const p of popups) {
      const a = Math.min(1, p.t / 0.4);
      const rise = (1.4 - p.t) * c * 0.6;
      ctx.globalAlpha = a;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.font = `800 ${Math.round(c * 0.95)}px ${FONT}`;
      ctx.fillText(p.text.toUpperCase(), bx + c * 5, by + c * 8 - rise);
      if (p.sub || p.points) {
        ctx.font = `700 ${Math.round(c * 0.55)}px ${FONT}`;
        ctx.fillStyle = '#fde68a';
        ctx.fillText([p.sub, p.points ? `+${p.points.toLocaleString('en-US')}` : ''].filter(Boolean).join('  '), bx + c * 5, by + c * 9 - rise);
      }
      ctx.globalAlpha = 1;
    }
    if (over) {
      ctx.fillStyle = 'rgba(5,8,22,0.55)';
      ctx.fillRect(bx, by + c * 8, c * 10, c * 3);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.font = `800 ${Math.round(c * 1.1)}px ${FONT}`;
      ctx.fillText('GAME OVER', bx + c * 5, by + c * 9.9);
    }
    // side column
    ctx.textAlign = 'left';
    const label = (text, y) => {
      ctx.fillStyle = '#94a3b8';
      ctx.font = `800 ${Math.round(c * 0.5)}px ${FONT}`;
      ctx.fillText(text, sx, y);
    };
    const panel = (x, y, w, hh) => {
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(x, y, w, hh);
    };
    label('HOLD', by + c * 0.55);
    panel(L.hold.x, L.hold.y, L.hold.w, L.hold.h);
    if (game.hold) {
      ctx.globalAlpha = game.holdUsed ? 0.35 : 1;
      miniPiece(ctx, game.hold, sx + sw / 2, L.hold.y + L.hold.h / 2, c * 0.55);
      ctx.globalAlpha = 1;
    }
    label('NEXT', by + c * 4.3);
    panel(sx, by + c * 4.55, sw, c * 9.2);
    game.queue.slice(0, 4).forEach((t, i) => miniPiece(ctx, t, sx + sw / 2, by + c * (5.7 + i * 2.25), c * (i === 0 ? 0.6 : 0.5)));
    const stat = (name, value, y) => {
      label(name, y);
      ctx.fillStyle = '#fff';
      ctx.font = `800 ${Math.round(c * 0.78)}px ${FONT}`;
      ctx.fillText(value, sx, y + c * 0.85);
    };
    stat('SCORE', game.score.toLocaleString('en-US'), by + c * 14.7);
    stat('LEVEL', String(game.level), by + c * 16.6);
    stat('LINES', String(game.lines), by + c * 18.5);
  }

  const loop = new Loop({ step: 1 / 120, update, render });
  const offResize = onResize(wrap, resize);
  requestAnimationFrame(resize);

  return {
    start() {
      started = true;
      loop.start();
    },
    setPaused(p) {
      paused = p;
      loop.paused = p;
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
