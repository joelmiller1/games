// 2048 screen: sliding tiles (DOM + CSS transitions), keyboard, swipes and an optional time limit.
import { h, fill } from '../ui.js';
import { play } from '../sound.js';
import { Game2048 } from './g2048-core.js';
import { listenKeys, onResize } from './common.js';

export const info = {
  intro: 'Slide the tiles. Two tiles with the same number merge into one. Can you make 2048?',
  keys: [
    [['←', '↑', '→', '↓'], 'Slide'],
    [['W', 'A', 'S', 'D'], 'Slide'],
    [['P'], 'Pause'],
  ],
  touch: 'Swipe in any direction to slide the tiles.',
};

const KEYMAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down' };

const clock = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function create({ host, options, seed, onProgress, onEnd }) {
  const game = new Game2048({ seed });
  const limit = options?.time && options.time !== 'none' ? Number(options.time) * 1000 : 0;
  let left = limit;
  let started = false;
  let paused = false;
  let ended = false;
  let timer = null;
  let lastTick = 0;

  const scoreEl = h('strong', '0');
  const bestEl = h('strong', '2');
  const timeEl = h('strong', limit ? clock(limit) : '');
  const bar = h(
    'div',
    { class: 'g48-bar' },
    h('div', { class: 'g48-stat' }, h('span', 'Score'), scoreEl),
    h('div', { class: 'g48-stat' }, h('span', 'Best tile'), bestEl),
    limit ? h('div', { class: 'g48-stat time' }, h('span', 'Time'), timeEl) : null,
  );
  const tilesLayer = h('div', { class: 'g48-tiles' });
  const banner = h('div', { class: 'g48-banner', hidden: true });
  const board = h('div', { class: 'g48-board', role: 'grid', 'aria-label': '2048 board' }, Array.from({ length: game.size * game.size }, () => h('div', { class: 'g48-cell' })), tilesLayer, banner);
  const wrap = h('div', { class: 'g48-wrap' }, board);
  const root = h('div', { class: 'ar-game g48' }, bar, wrap);
  host.append(root);

  const els = new Map(); // tile id -> element
  let geo = { cell: 80, gap: 10 };

  function pos(i) {
    const n = game.size;
    return { x: geo.gap + (i % n) * (geo.cell + geo.gap), y: geo.gap + Math.floor(i / n) * (geo.cell + geo.gap) };
  }

  function place(el, i) {
    const { x, y } = pos(i);
    el.style.transform = `translate(${x}px, ${y}px)`;
  }

  function tileEl(t, cls = '') {
    const digits = String(t.value).length;
    const el = h('div', { class: ['g48-tile', `v${t.value}`, `d${Math.min(digits, 5)}`, cls] }, h('div', { class: 'g48-face' }, String(t.value)));
    el.style.width = el.style.height = `${geo.cell}px`;
    place(el, t.i);
    tilesLayer.append(el);
    els.set(t.id, el);
    return el;
  }

  function redraw() {
    fill(tilesLayer);
    els.clear();
    for (const t of game.tiles()) tileEl(t);
    stats();
  }

  function resize() {
    const r = wrap.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const size = Math.floor(Math.max(220, Math.min(r.width - 12, r.height - 12, 560)));
    geo.gap = Math.round(size * 0.028);
    geo.cell = (size - geo.gap * (game.size + 1)) / game.size;
    board.style.width = board.style.height = `${size}px`;
    board.style.setProperty('--cell', `${geo.cell}px`);
    board.style.setProperty('--gap', `${geo.gap}px`);
    board.classList.add('still');
    for (const t of game.tiles()) {
      const el = els.get(t.id);
      if (!el) continue;
      el.style.width = el.style.height = `${geo.cell}px`;
      place(el, t.i);
    }
    requestAnimationFrame(() => board.classList.remove('still'));
  }

  function stats() {
    scoreEl.textContent = game.score.toLocaleString('en-US');
    bestEl.textContent = String(game.best);
  }

  function say(text, ms = 1600) {
    banner.hidden = false;
    fill(banner, text);
    banner.classList.remove('show');
    void banner.offsetWidth;
    banner.classList.add('show');
    clearTimeout(say.t);
    if (ms) say.t = setTimeout(() => (banner.hidden = true), ms);
  }

  function finish(reason) {
    if (ended) return;
    ended = true;
    clearInterval(timer);
    say(reason, 0);
    play(reason === 'Time!' ? 'bonus' : 'crash');
    setTimeout(() => onEnd({ score: game.score, stat: game.best, ok: true }), 1300);
  }

  function slide(dir) {
    if (!started || paused || ended) return;
    const res = game.move(dir);
    if (!res) return;
    // Slide every tile to its new square; merged pairs meet and are replaced by the new tile.
    const gone = [];
    for (const m of res.moves) {
      const el = els.get(m.id);
      if (!el) continue;
      place(el, m.to);
    }
    for (const mg of res.merged) {
      for (const src of mg.from) {
        const el = els.get(src);
        if (el) {
          el.classList.add('gone');
          gone.push(el);
        }
        els.delete(src);
      }
      tileEl(mg, 'merged');
    }
    if (res.spawned) tileEl(res.spawned, 'new');
    setTimeout(() => gone.forEach((el) => el.remove()), 130);
    stats();
    if (res.merged.length) play(res.merged.some((m) => m.value >= 128) ? 'score' : 'place', 40);
    else play('shift', 40);
    if (res.gained) onProgress({ score: game.score, stat: game.best });
    if (res.justWon) {
      play('win');
      say('2048! Keep going…', 2200);
    }
    if (game.over) finish('No moves left');
  }

  const offKeys = listenKeys((e) => {
    const d = KEYMAP[e.code];
    if (!d) return false;
    slide(d);
    return true;
  });

  // Swipes: decide as soon as the finger has clearly moved one way.
  let sw = null;
  board.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    sw = { id: e.pointerId, x: e.clientX, y: e.clientY, done: false };
    try {
      board.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  });
  board.addEventListener('pointermove', (e) => {
    if (!sw || sw.done || e.pointerId !== sw.id) return;
    const dx = e.clientX - sw.x;
    const dy = e.clientY - sw.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 28) return;
    sw.done = true;
    slide(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
  });
  const endSwipe = (e) => {
    if (sw && e.pointerId === sw.id) sw = null;
  };
  board.addEventListener('pointerup', endSwipe);
  board.addEventListener('pointercancel', endSwipe);

  function tick() {
    const now = performance.now();
    if (!paused && !ended) left -= now - lastTick;
    lastTick = now;
    timeEl.textContent = clock(left);
    timeEl.parentElement.classList.toggle('low', left < 15000);
    if (left <= 0) finish('Time!');
  }

  const offResize = onResize(wrap, resize);
  requestAnimationFrame(() => {
    resize();
    redraw();
  });

  return {
    start() {
      started = true;
      if (limit) {
        lastTick = performance.now();
        timer = setInterval(tick, 200);
      }
    },
    setPaused(p) {
      paused = p;
      root.classList.toggle('paused', p);
    },
    destroy() {
      clearInterval(timer);
      clearTimeout(say.t);
      offKeys();
      offResize();
    },
  };
}
