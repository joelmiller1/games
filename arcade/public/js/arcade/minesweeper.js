// Minesweeper screen: a grid of buttons with mouse, touch (long-press or flag mode) and keyboard.
import { h, s } from '../ui.js';
import { play } from '../sound.js';
import { Minefield, LEVELS } from './minesweeper-core.js';
import { onResize } from './common.js';
import { formatTime } from '../../shared/games/meta.js';

export const info = {
  intro: 'Uncover every safe square. Numbers count the mines next to them. Your first click is always safe.',
  keys: [
    [['Click'], 'Uncover'],
    [['Right-click'], 'Flag a mine'],
    [['Click a number'], 'Open around it when its mines are flagged'],
    [['P'], 'Pause'],
  ],
  touch: 'Tap to uncover, long-press (or switch to Flag) to flag, and tap a number to open around it.',
};

const flagSvg = () =>
  s('svg', { viewBox: '0 0 20 20', class: 'ms-ico', 'aria-hidden': 'true' }, s('path', { d: 'M6 3v14', stroke: '#e2e8f0', 'stroke-width': 2, 'stroke-linecap': 'round' }), s('path', { d: 'M7 3.5l9 3.5-9 3.5z', fill: '#ef4444' }), s('path', { d: 'M3.5 17h7', stroke: '#e2e8f0', 'stroke-width': 2, 'stroke-linecap': 'round' }));

const mineSvg = () => {
  const spikes = [];
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    spikes.push(`M${(10 + Math.cos(a) * 4).toFixed(1)} ${(10 + Math.sin(a) * 4).toFixed(1)}L${(10 + Math.cos(a) * 8.5).toFixed(1)} ${(10 + Math.sin(a) * 8.5).toFixed(1)}`);
  }
  return s('svg', { viewBox: '0 0 20 20', class: 'ms-ico', 'aria-hidden': 'true' }, s('path', { d: spikes.join(''), stroke: '#0f172a', 'stroke-width': 1.8, 'stroke-linecap': 'round' }), s('circle', { cx: 10, cy: 10, r: 5.5, fill: '#0f172a' }), s('circle', { cx: 8.3, cy: 8.3, r: 1.5, fill: '#fff', opacity: 0.8 }));
};

export function create({ host, options, seed, onProgress, onEnd }) {
  const cfg = LEVELS[options?.level] || LEVELS.beginner;
  const field = new Minefield({ ...cfg, seed });
  const box = host.getBoundingClientRect();
  // Show a wide field tall on a portrait screen (same minefield, turned on its side).
  const transpose = cfg.w > cfg.h && box.height > box.width;
  const cols = transpose ? cfg.h : cfg.w;
  const rows = transpose ? cfg.w : cfg.h;
  const idxAt = (r, c) => (transpose ? c * cfg.w + r : r * cfg.w + c);

  let started = false;
  let paused = false;
  let firstAt = 0;
  let elapsed = 0;
  let flagMode = false;
  let ended = false;
  let lastPct = -1;
  let tick = null;

  const minesLeft = h('span', { class: 'ms-count' });
  const clock = h('span', { class: 'ms-count' });
  const dig = h('button', { type: 'button', 'aria-pressed': 'true', onClick: () => setMode(false) }, 'Dig');
  const flg = h('button', { type: 'button', 'aria-pressed': 'false', onClick: () => setMode(true) }, flagSvg(), 'Flag');
  const modes = h('div', { class: 'seg ms-mode', role: 'group', 'aria-label': 'Tap action' }, dig, flg);
  const bar = h('div', { class: 'ms-bar' }, h('span', { class: 'ms-stat', title: 'Mines left' }, mineSvg(), minesLeft), modes, h('span', { class: 'ms-stat', title: 'Time' }, clock));
  const grid = h('div', { class: 'ms-grid', role: 'grid', 'aria-label': `Minefield, ${cols} by ${rows}` });
  const scroller = h('div', { class: 'ms-scroll' }, grid);
  const root = h('div', { class: 'ar-game ms' }, bar, scroller);
  host.append(root);

  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const b = h('button', { class: 'ms-cell', type: 'button', role: 'gridcell', dataset: { i: String(idxAt(r, c)) }, 'aria-label': 'Hidden' });
      cells[idxAt(r, c)] = b;
      grid.append(b);
    }
  }
  grid.style.gridTemplateColumns = `repeat(${cols}, var(--ms))`;

  function setMode(f) {
    flagMode = f;
    dig.setAttribute('aria-pressed', String(!f));
    flg.setAttribute('aria-pressed', String(f));
  }

  function resize() {
    const b = scroller.getBoundingClientRect();
    if (!b.width) return;
    const size = Math.floor(Math.min((b.width - 12) / cols, (b.height - 12) / rows));
    grid.style.setProperty('--ms', `${Math.max(18, Math.min(44, size - 2))}px`);
  }

  function now() {
    if (ended || !firstAt) return elapsed;
    return elapsed + (paused ? 0 : performance.now() - firstAt);
  }

  function renderClock() {
    clock.textContent = formatTime(now()).replace(' s', '');
    minesLeft.textContent = String(cfg.mines - field.flags);
  }

  function paint(i) {
    const b = cells[i];
    const open = field.open[i];
    const cls = ['ms-cell'];
    let content = null;
    let label = 'Hidden';
    if (open && field.mine[i]) {
      cls.push('open', 'mine', i === field.boom && 'boom');
      content = mineSvg();
      label = 'Mine';
    } else if (open) {
      cls.push('open');
      if (field.count[i]) {
        cls.push(`n${field.count[i]}`);
        content = String(field.count[i]);
      }
      label = field.count[i] ? `${field.count[i]}` : 'Empty';
    } else if (field.flag[i]) {
      const wrong = field.lost && !field.mine[i];
      cls.push('flag', wrong && 'wrong');
      content = flagSvg();
      label = wrong ? 'Wrong flag' : 'Flagged';
    } else if (field.lost && field.mine[i]) {
      cls.push('open', 'mine');
      content = mineSvg();
      label = 'Mine';
    }
    // The class list fully describes what a cell shows, so only touch cells whose class changed.
    const className = cls.filter(Boolean).join(' ');
    if (b.className !== className) {
      b.className = className;
      b.replaceChildren(...(content ? [content] : []));
      b.setAttribute('aria-label', label);
    }
  }

  function paintAll() {
    for (let i = 0; i < field.n; i++) paint(i);
    renderClock();
  }

  function report() {
    const pct = field.progress();
    if (pct !== lastPct) {
      lastPct = pct;
      onProgress({ score: Math.round(now()), stat: pct });
    }
  }

  function finish() {
    if (ended) return;
    elapsed = now();
    ended = true;
    clearInterval(tick);
    const time = Math.max(1, Math.round(elapsed));
    renderClock();
    if (field.won) {
      play('win');
      root.classList.add('won');
    } else play('boom');
    setTimeout(() => onEnd({ score: time, stat: field.won ? 100 : field.progress(), ok: field.won }), field.won ? 900 : 1500);
  }

  function act(i, kind) {
    if (!started || paused || field.done) return;
    if (kind === 'flag') {
      if (field.toggleFlag(i)) {
        play('flag');
        paint(i);
        renderClock();
      }
      return;
    }
    let opened;
    if (field.open[i]) opened = field.chord(i);
    else {
      if (field.flag[i]) return;
      if (!firstAt) {
        firstAt = performance.now();
        tick = setInterval(renderClock, 100);
      }
      opened = field.reveal(i);
    }
    if (!opened.length) return;
    if (!field.lost) play('reveal', 20);
    if (field.done) paintAll();
    else for (const j of opened) paint(j);
    renderClock();
    report();
    if (field.done) finish();
  }

  // ---- input ----
  let press = null;
  const cellOf = (e) => e.target.closest?.('.ms-cell');
  grid.addEventListener('pointerdown', (e) => {
    const b = cellOf(e);
    if (!b) return;
    const i = Number(b.dataset.i);
    if (e.pointerType === 'mouse') {
      if (e.button === 2) act(i, 'flag');
      else if (e.button === 1) {
        e.preventDefault();
        if (field.open[i]) act(i, 'dig');
      } else if (e.button === 0) press = { i, id: e.pointerId, mouse: true };
      return;
    }
    press = { i, id: e.pointerId, mouse: false, x: e.clientX, y: e.clientY, long: false };
    press.timer = setTimeout(() => {
      if (!press || press.i !== i) return;
      press.long = true;
      if (!field.open[i]) {
        act(i, 'flag');
        navigator.vibrate?.(25);
      }
    }, 380);
  });
  grid.addEventListener('pointermove', (e) => {
    if (press && !press.mouse && e.pointerId === press.id && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 12) {
      clearTimeout(press.timer);
      press = null; // a scroll, not a tap
    }
  });
  grid.addEventListener('pointerup', (e) => {
    if (!press || e.pointerId !== press.id) return;
    const p = press;
    press = null;
    clearTimeout(p.timer);
    const b = cellOf(e) || document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.ms-cell');
    if (!b || Number(b.dataset.i) !== p.i || p.long) return;
    act(p.i, !p.mouse && flagMode && !field.open[p.i] ? 'flag' : 'dig');
  });
  grid.addEventListener('pointercancel', () => {
    if (press) clearTimeout(press.timer);
    press = null;
  });
  grid.addEventListener('contextmenu', (e) => e.preventDefault());
  // Keyboard: the cells are buttons; Enter/Space uncovers, F flags.
  grid.addEventListener('keydown', (e) => {
    const b = cellOf(e);
    if (!b) return;
    const i = Number(b.dataset.i);
    if (e.key === 'Enter' || e.key === ' ') act(i, 'dig');
    else if (e.key === 'f' || e.key === 'F') act(i, 'flag');
    else if (e.key.startsWith('Arrow')) {
      const order = [...grid.children];
      const pos = order.indexOf(b);
      const r = Math.floor(pos / cols);
      const c = pos % cols;
      const [dr, dc] = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
      const nr = Math.min(rows - 1, Math.max(0, r + dr));
      const nc = Math.min(cols - 1, Math.max(0, c + dc));
      order[nr * cols + nc]?.focus();
    } else return;
    e.preventDefault();
  });

  const offResize = onResize(scroller, resize);
  requestAnimationFrame(resize);
  paintAll();

  return {
    start() {
      started = true;
    },
    setPaused(p) {
      if (p === paused || ended) return;
      if (p && firstAt) elapsed += performance.now() - firstAt;
      if (firstAt) firstAt = performance.now();
      paused = p;
      root.classList.toggle('paused', p);
      renderClock();
    },
    destroy() {
      clearInterval(tick);
      offResize();
    },
  };
}
