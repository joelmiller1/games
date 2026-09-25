// Breakout screen: canvas renderer, mouse / touch drag / keyboard paddle control.
import { h } from '../ui.js';
import { play } from '../sound.js';
import { Breakout, GEOMETRY } from './breakout-core.js';
import { fitCanvas, Loop, holdButton, listenKeys, onResize } from './common.js';

export const info = {
  intro: 'Keep the ball in play and smash every brick. Catch the falling capsules for power-ups.',
  keys: [
    [['Mouse'], 'Move the paddle'],
    [['←', '→'], 'Move the paddle'],
    [['Space'], 'Launch the ball'],
    [['P'], 'Pause'],
  ],
  touch: 'Drag anywhere to move the paddle and tap to launch the ball.',
};

const { W, H, TOP, PADDLE_Y, PADDLE_H, BALL_R } = GEOMETRY;
const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const POWER_STYLE = {
  wide: { letter: 'W', color: '#22c55e', label: 'Wide paddle' },
  multi: { letter: 'M', color: '#a855f7', label: 'Multiball' },
  slow: { letter: 'S', color: '#3b82f6', label: 'Slow ball' },
  life: { letter: '+', color: '#ef4444', label: 'Extra life' },
};

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

function roundRect(ctx, x, y, w, hh, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + hh, r);
  ctx.arcTo(x + w, y + hh, x, y + hh, r);
  ctx.arcTo(x, y + hh, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function create({ host, seed, onProgress, onEnd }) {
  const game = new Breakout({ seed });
  const canvas = h('canvas', { class: 'ar-canvas', 'aria-label': 'Breakout' });
  const wrap = h('div', { class: 'ar-canvas-wrap' }, canvas);
  const input = { target: null, dir: 0, launch: false };
  const keys = { left: false, right: false };
  const btn = (label, aria, cls = '') => h('button', { class: `ar-btn ${cls}`, type: 'button', 'aria-label': aria }, label);
  const bL = btn('◀', 'Move left');
  const bGo = btn(h('small', 'LAUNCH'), 'Launch the ball', 'wide');
  const bR = btn('▶', 'Move right');
  let padDir = 0;
  holdButton(bL, { down: () => (padDir = -1), up: () => padDir === -1 && (padDir = 0) });
  holdButton(bR, { down: () => (padDir = 1), up: () => padDir === 1 && (padDir = 0) });
  holdButton(bGo, { down: () => (input.launch = true) });
  const pad = h('div', { class: 'ar-pad bo-pad' }, bL, bGo, bR);
  const root = h('div', { class: 'ar-game bo' }, wrap, pad);
  host.append(root);

  let scale = 1;
  let dpr = 1;
  let cw = 0;
  let ch = 0;
  let started = false;
  let paused = false;
  let ended = false;
  let lastScore = -1;
  let lastLevel = -1;
  let banner = { text: 'LEVEL 1', t: 1.8 };

  function resize() {
    const b = wrap.getBoundingClientRect();
    if (!b.width || !b.height) return;
    scale = Math.min(b.width / W, b.height / H);
    cw = Math.floor(W * scale);
    ch = Math.floor(H * scale);
    dpr = fitCanvas(canvas, cw, ch);
    render();
  }

  // ---- input ----
  const toWorld = (clientX) => {
    const r = canvas.getBoundingClientRect();
    return ((clientX - r.left) / r.width) * W;
  };
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') input.target = toWorld(e.clientX);
  });
  canvas.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse') input.target = null;
  });
  // Touch: drag moves the paddle by the same distance as the finger (it never hides under it).
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') {
      if (e.button === 0) input.launch = true;
      return;
    }
    e.preventDefault();
    drag = { id: e.pointerId, x: e.clientX, startPad: game.paddle.x, moved: false, t: performance.now() };
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = toWorld(e.clientX) - toWorld(drag.x);
    if (Math.abs(e.clientX - drag.x) > 6) drag.moved = true;
    input.target = drag.startPad + dx * 1.3;
  });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved && performance.now() - drag.t < 350) input.launch = true;
    drag = null;
    input.target = null;
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  const offKeys = listenKeys(
    (e) => {
      const k = e.code;
      if (k === 'ArrowLeft' || k === 'KeyA') keys.left = true;
      else if (k === 'ArrowRight' || k === 'KeyD') keys.right = true;
      else if (k === 'Space' || k === 'ArrowUp' || k === 'KeyW') input.launch = true;
      else return false;
      if (k !== 'Space') input.target = null;
      return true;
    },
    (e) => {
      const k = e.code;
      if (k === 'ArrowLeft' || k === 'KeyA') keys.left = false;
      else if (k === 'ArrowRight' || k === 'KeyD') keys.right = false;
      else return false;
      return true;
    },
  );

  function update(dt) {
    if (banner) {
      banner.t -= dt;
      if (banner.t <= 0) banner = null;
    }
    if (!started || paused) return;
    input.dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0) || padDir;
    if (input.dir) input.target = null;
    game.update(dt, input);
    for (const ev of game.drain()) {
      if (ev.type === 'brick') play('rockSmall', 30);
      else if (ev.type === 'crack') play('target', 40);
      else if (ev.type === 'gold') play('bumper', 40);
      else if (ev.type === 'paddle') play('flipper', 30);
      else if (ev.type === 'wall') play('shift', 40);
      else if (ev.type === 'launch') play('launch');
      else if (ev.type === 'lost') play('drain');
      else if (ev.type === 'power') {
        play('bonus');
        banner = { text: POWER_STYLE[ev.kind].label.toUpperCase(), t: 1.2, small: true };
      } else if (ev.type === 'cleared') play('levelup');
      else if (ev.type === 'level' && ev.level > 1) banner = { text: `LEVEL ${ev.level}`, t: 1.8 };
      else if (ev.type === 'gameover') play('crash');
    }
    if (game.score !== lastScore || game.level !== lastLevel) {
      lastScore = game.score;
      lastLevel = game.level;
      onProgress({ score: game.score, stat: game.level });
    }
    if (game.ended && !ended) {
      ended = true;
      onEnd({ score: game.score, stat: game.level, ok: true });
    }
  }

  function render() {
    if (!cw) return;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0b1230');
    bg.addColorStop(1, '#05070f');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    // frame and ceiling
    ctx.fillStyle = 'rgba(148,163,184,0.25)';
    ctx.fillRect(0, TOP - 4, W, 4);
    // bricks
    for (const b of game.bricks) {
      const grad = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
      grad.addColorStop(0, shade(b.color, 1.2));
      grad.addColorStop(1, shade(b.color, 0.75));
      ctx.fillStyle = grad;
      roundRect(ctx, b.x, b.y, b.w, b.h, 4);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.fillRect(b.x + 3, b.y + 2, b.w - 6, 3);
      if (b.kind === 'S' && b.hp === 1) {
        ctx.strokeStyle = 'rgba(15,23,42,0.7)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(b.x + b.w * 0.3, b.y);
        ctx.lineTo(b.x + b.w * 0.45, b.y + b.h * 0.5);
        ctx.lineTo(b.x + b.w * 0.38, b.y + b.h);
        ctx.stroke();
      }
      if (b.kind === 'X') {
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 1;
        roundRect(ctx, b.x + 1.5, b.y + 1.5, b.w - 3, b.h - 3, 3);
        ctx.stroke();
      }
    }
    // capsules
    for (const c of game.capsules) {
      const st = POWER_STYLE[c.kind];
      ctx.fillStyle = st.color;
      roundRect(ctx, c.x - 18, c.y - 8, 36, 16, 8);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `800 12px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(st.letter, c.x, c.y + 4);
    }
    // particles
    for (const p of game.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;
    // paddle
    const pd = game.paddle;
    const pg = ctx.createLinearGradient(0, PADDLE_Y - PADDLE_H / 2, 0, PADDLE_Y + PADDLE_H / 2);
    pg.addColorStop(0, game.wideT > 0 ? '#86efac' : '#a5f3fc');
    pg.addColorStop(1, game.wideT > 0 ? '#16a34a' : '#0891b2');
    ctx.fillStyle = pg;
    roundRect(ctx, pd.x - pd.w / 2, PADDLE_Y - PADDLE_H / 2, pd.w, PADDLE_H, 7);
    ctx.fill();
    // balls, with a soft halo
    for (const b of game.balls) {
      ctx.fillStyle = game.slowT > 0 ? 'rgba(147,197,253,0.25)' : 'rgba(255,255,255,0.18)';
      ctx.beginPath();
      ctx.arc(b.x, b.y, BALL_R * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
      ctx.fill();
    }
    // score bar
    ctx.textAlign = 'left';
    ctx.fillStyle = '#e2e8f0';
    ctx.font = `800 26px ${FONT}`;
    ctx.fillText(game.score.toLocaleString('en-US'), 16, 36);
    ctx.textAlign = 'right';
    ctx.font = `700 16px ${FONT}`;
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`LEVEL ${game.level}`, W - 16, 34);
    for (let i = 0; i < Math.min(game.lives - 1, 6); i++) {
      ctx.fillStyle = '#a5f3fc';
      roundRect(ctx, W - 130 - i * 30, 24, 24, 8, 4);
      ctx.fill();
    }
    // messages
    ctx.textAlign = 'center';
    if (game.over) {
      ctx.fillStyle = '#fff';
      ctx.font = `800 48px ${FONT}`;
      ctx.fillText('GAME OVER', W / 2, H * 0.6);
    } else if (banner) {
      ctx.globalAlpha = Math.min(1, banner.t * 1.5);
      ctx.fillStyle = '#fff';
      ctx.font = `800 ${banner.small ? 26 : 40}px ${FONT}`;
      ctx.fillText(banner.text, W / 2, H * 0.62);
      ctx.globalAlpha = 1;
    } else if (game.balls.some((b) => b.stuck) && started) {
      ctx.fillStyle = 'rgba(226,232,240,0.75)';
      ctx.font = `600 18px ${FONT}`;
      ctx.fillText('Tap, click or press Space to launch', W / 2, H * 0.62);
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
      keys.left = keys.right = false;
      padDir = 0;
    },
    destroy() {
      loop.stop();
      offKeys();
      offResize();
    },
  };
}
