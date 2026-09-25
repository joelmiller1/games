// Inline SVG icons. Game icons are small illustrations; UI icons are 24px strokes.
import { s } from './ui.js';

const UI = {
  back: 'M15 18l-6-6 6-6',
  share: 'M4 12v7a2 2 0 002 2h12a2 2 0 002-2v-7M16 6l-4-4-4 4M12 2v14',
  copy: 'M9 9h10v12H9zM5 15H4a1 1 0 01-1-1V4a1 1 0 011-1h10a1 1 0 011 1v1',
  users: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
  robot: 'M12 3v3M7 7h10a3 3 0 013 3v7a3 3 0 01-3 3H7a3 3 0 01-3-3v-7a3 3 0 013-3zM9 13h.01M15 13h.01M9.5 16.5h5M2 13v2M22 13v2',
  wifi: 'M5 12.55a11 11 0 0114.08 0M1.42 9a16 16 0 0121.16 0M8.53 16.11a6 6 0 016.95 0M12 20h.01',
  device: 'M7 2h10a2 2 0 012 2v16a2 2 0 01-2 2H7a2 2 0 01-2-2V4a2 2 0 012-2zM12 18h.01',
  soundOn: 'M11 5L6 9H2v6h4l5 4V5zM19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07',
  soundOff: 'M11 5L6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6',
  sun: 'M12 17a5 5 0 100-10 5 5 0 000 10zM12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42',
  moon: 'M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z',
  crown: 'M3 18h18M4 16l-1-9 5 4 4-7 4 7 5-4-1 9z',
  chat: 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z',
  flag: 'M4 22V4M4 4h12l-2 4 2 4H4',
  handshake: 'M8 12l3 3 5-5M3 12a9 9 0 1018 0 9 9 0 00-18 0',
  refresh: 'M1 4v6h6M23 20v-6h-6M20.49 9A9 9 0 005.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 013.51 15',
  flip: 'M7 16V4M7 4L3 8M7 4l4 4M17 8v12M17 20l4-4M17 20l-4-4',
  eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12zM12 15a3 3 0 100-6 3 3 0 000 6z',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  close: 'M18 6L6 18M6 6l12 12',
  check: 'M20 6L9 17l-5-5',
  qr: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM18 18h3v3h-3zM18 14h3M14 18v3',
  play: 'M6 4l14 8-14 8z',
  trophy: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0zM17 5h3v2a3 3 0 01-3 3M7 5H4v2a3 3 0 003 3',
  rotate: 'M21 12a9 9 0 11-3-6.7M21 3v6h-6',
  dice: 'M4 4h16v16H4zM8.5 8.5h.01M15.5 15.5h.01M12 12h.01',
  info: 'M12 22a10 10 0 100-20 10 10 0 000 20zM12 16v-4M12 8h.01',
  exit: 'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9',
  shuffle: 'M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6',
};

export function icon(name, size = 20, extra = {}) {
  return s(
    'svg',
    {
      viewBox: '0 0 24 24',
      width: size,
      height: size,
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': 2,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': 'true',
      class: 'icon',
      ...extra,
    },
    s('path', { d: UI[name] || UI.info }),
  );
}

// ---- game illustrations (viewBox 0 0 64 64) ----

function pip(cx, cy, r = 3.2) {
  return s('circle', { cx, cy, r, fill: '#1f2937' });
}

const GAME_ART = {
  yahtzee: () => [
    s('g', { transform: 'rotate(-14 22 36)' }, s('rect', { x: 6, y: 20, width: 30, height: 30, rx: 7, fill: '#fff' }), pip(14, 28), pip(21, 35), pip(28, 42)),
    s(
      'g',
      { transform: 'rotate(12 44 26)' },
      s('rect', { x: 30, y: 10, width: 28, height: 28, rx: 7, fill: '#fef3c7' }),
      pip(37, 17),
      pip(51, 17),
      pip(37, 31),
      pip(51, 31),
      pip(44, 24),
    ),
  ],
  chess: () => [
    s('path', {
      d: 'M20 56h26v-5H20zM23 50h20c-1-8-4-12-4-18 5-2 8-6 7-12-2-6-8-10-16-10l-2-4-3 6c-4 3-7 9-8 14l6 1c2-2 4-3 6-3-3 5-6 14-6 26z',
      fill: '#f5f3ff',
    }),
    s('circle', { cx: 32, cy: 20, r: 2, fill: '#4c1d95' }),
  ],
  checkers: () => [
    s('ellipse', { cx: 32, cy: 46, rx: 22, ry: 8, fill: '#7f1d1d' }),
    s('rect', { x: 10, y: 38, width: 44, height: 8, fill: '#991b1b' }),
    s('ellipse', { cx: 32, cy: 38, rx: 22, ry: 8, fill: '#dc2626' }),
    s('ellipse', { cx: 32, cy: 30, rx: 22, ry: 8, fill: '#7f1d1d' }),
    s('rect', { x: 10, y: 22, width: 44, height: 8, fill: '#b91c1c' }),
    s('ellipse', { cx: 32, cy: 22, rx: 22, ry: 8, fill: '#ef4444' }),
    s('path', { d: 'M23 24l-2-8 6 4 5-7 5 7 6-4-2 8z', fill: '#fde68a' }),
  ],
  connect4: () => {
    const out = [s('rect', { x: 6, y: 10, width: 52, height: 44, rx: 8, fill: '#1d4ed8' })];
    const colors = ['#1e3a8a', '#1e3a8a', '#1e3a8a', '#1e3a8a', '#facc15', '#1e3a8a', '#1e3a8a', '#ef4444', '#facc15', '#1e3a8a', '#ef4444', '#ef4444', '#facc15', '#ef4444', '#facc15', '#ef4444'];
    colors.forEach((c, i) => out.push(s('circle', { cx: 14 + (i % 4) * 12, cy: 17 + Math.floor(i / 4) * 10.5, r: 4.3, fill: c })));
    return out;
  },
  battleship: () => [
    s('path', { d: 'M4 44c6 4 10 4 14 0 4 4 10 4 14 0 4 4 10 4 14 0 4 4 8 4 14 0v14H4z', fill: '#0369a1' }),
    s('path', { d: 'M8 38h48l-6 8H14z', fill: '#e2e8f0' }),
    s('rect', { x: 22, y: 28, width: 18, height: 10, rx: 2, fill: '#cbd5e1' }),
    s('rect', { x: 28, y: 18, width: 4, height: 10, fill: '#94a3b8' }),
    s('circle', { cx: 48, cy: 16, r: 7, fill: 'none', stroke: '#f43f5e', 'stroke-width': 2.5 }),
    s('path', { d: 'M48 6v6M48 20v6M38 16h6M52 16h6', stroke: '#f43f5e', 'stroke-width': 2.5 }),
  ],
  tictactoe: () => [
    s('path', { d: 'M24 8v48M40 8v48M8 24h48M8 40h48', stroke: '#d1fae5', 'stroke-width': 3, 'stroke-linecap': 'round' }),
    s('path', { d: 'M11 11l10 10M21 11L11 21M43 43l10 10M53 43L43 53', stroke: '#fff', 'stroke-width': 4, 'stroke-linecap': 'round' }),
    s('circle', { cx: 48, cy: 16, r: 5.5, fill: 'none', stroke: '#fde047', 'stroke-width': 4 }),
    s('circle', { cx: 32, cy: 32, r: 5.5, fill: 'none', stroke: '#fde047', 'stroke-width': 4 }),
  ],
  pinball: () => [
    s('path', { d: 'M10 50l16 6', stroke: '#fff', 'stroke-width': 6, 'stroke-linecap': 'round' }),
    s('path', { d: 'M54 50l-16 6', stroke: '#fff', 'stroke-width': 6, 'stroke-linecap': 'round' }),
    s('circle', { cx: 22, cy: 20, r: 7, fill: '#fde047' }),
    s('circle', { cx: 42, cy: 16, r: 7, fill: '#a5f3fc' }),
    s('circle', { cx: 34, cy: 34, r: 6, fill: '#e2e8f0' }),
    s('circle', { cx: 32, cy: 34, r: 2, fill: '#fff' }),
  ],
};

export function gameArt(id, size = 64) {
  return s('svg', { viewBox: '0 0 64 64', width: size, height: size, 'aria-hidden': 'true', class: 'game-art' }, GAME_ART[id] ? GAME_ART[id]() : []);
}
