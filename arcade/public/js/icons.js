// Inline SVG icons. Game icons are small illustrations; UI icons are 24px strokes.
import { s, h } from './ui.js';
import { getGame } from '../shared/games/meta.js';

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
  reversi: () => {
    const disc = (cx, cy, dark) => [
      s('circle', { cx, cy: cy + 2, r: 11, fill: dark ? '#020617' : '#94a3b8' }),
      s('circle', { cx, cy, r: 11, fill: dark ? '#1f2937' : '#f8fafc' }),
      s('circle', { cx: cx - 3.5, cy: cy - 3.5, r: 3.5, fill: dark ? '#4b5563' : '#ffffff', opacity: 0.8 }),
    ];
    return [disc(21, 21, false), disc(43, 21, true), disc(21, 43, true), disc(43, 43, false)];
  },
  mancala: () => {
    const out = [
      s('rect', { x: 4, y: 16, width: 56, height: 32, rx: 16, fill: '#fcd34d' }),
      s('rect', { x: 4, y: 16, width: 56, height: 32, rx: 16, fill: 'none', stroke: '#92400e', 'stroke-width': 2 }),
    ];
    const seeds = ['#38bdf8', '#f472b6', '#a3e635', '#ffffff', '#c084fc'];
    [[23, 25], [33, 25], [43, 25], [23, 39], [33, 39], [43, 39]].forEach(([cx, cy], i) => {
      out.push(s('circle', { cx, cy, r: 5, fill: '#b45309' }));
      for (let k = 0; k < (i % 3) + 1; k++) out.push(s('circle', { cx: cx - 2 + k * 2, cy: cy - 1 + (k % 2) * 2, r: 1.6, fill: seeds[(i + k) % seeds.length] }));
    });
    out.push(s('ellipse', { cx: 12, cy: 32, rx: 4, ry: 10, fill: '#b45309' }), s('ellipse', { cx: 52, cy: 32, rx: 4, ry: 10, fill: '#b45309' }));
    return out;
  },
  dotsboxes: () => {
    const out = [s('rect', { x: 14, y: 14, width: 18, height: 18, fill: '#fde047', opacity: 0.85 })];
    out.push(s('path', { d: 'M14 14h18v18H14zM32 14h18M50 14v18M14 32v18M32 50h18', stroke: '#fff', 'stroke-width': 3.5, fill: 'none', 'stroke-linecap': 'round' }));
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out.push(s('circle', { cx: 14 + c * 18, cy: 14 + r * 18, r: 3.6, fill: '#fff' }));
    return out;
  },
  mastermind: () => {
    const out = [s('rect', { x: 6, y: 20, width: 52, height: 24, rx: 12, fill: 'rgba(0,0,0,0.25)' })];
    ['#ef4444', '#facc15', '#22c55e', '#3b82f6'].forEach((c, i) => {
      out.push(s('circle', { cx: 15 + i * 11, cy: 32, r: 5.2, fill: c }), s('circle', { cx: 13.5 + i * 11, cy: 30.5, r: 1.6, fill: '#fff', opacity: 0.7 }));
    });
    out.push(s('circle', { cx: 44, cy: 12, r: 3.2, fill: '#111827' }), s('circle', { cx: 52, cy: 12, r: 3.2, fill: '#fff' }));
    return out;
  },
  minesweeper: () => {
    const spikes = [];
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      spikes.push(`M${(26 + Math.cos(a) * 8).toFixed(1)} ${(36 + Math.sin(a) * 8).toFixed(1)}L${(26 + Math.cos(a) * 17).toFixed(1)} ${(36 + Math.sin(a) * 17).toFixed(1)}`);
    }
    return [
      s('path', { d: spikes.join(''), stroke: '#0f172a', 'stroke-width': 3.5, 'stroke-linecap': 'round' }),
      s('circle', { cx: 26, cy: 36, r: 12, fill: '#0f172a' }),
      s('circle', { cx: 22, cy: 32, r: 3.5, fill: '#fff', opacity: 0.85 }),
      s('path', { d: 'M46 10v30', stroke: '#e2e8f0', 'stroke-width': 3, 'stroke-linecap': 'round' }),
      s('path', { d: 'M47 10l13 6-13 6z', fill: '#ef4444' }),
      s('path', { d: 'M40 42h12', stroke: '#e2e8f0', 'stroke-width': 3, 'stroke-linecap': 'round' }),
    ];
  },
  tetris: () => {
    const sq = (x, y, c) => [s('rect', { x, y, width: 11, height: 11, rx: 2, fill: c }), s('rect', { x: x + 1.5, y: y + 1.5, width: 8, height: 3, rx: 1, fill: '#fff', opacity: 0.35 })];
    return [
      sq(20, 6, '#c084fc'), sq(8, 18, '#c084fc'), sq(20, 18, '#c084fc'), sq(32, 18, '#c084fc'),
      sq(8, 42, '#fb923c'), sq(8, 30, '#fb923c'), sq(20, 42, '#fb923c'), sq(32, 42, '#fb923c'),
      sq(44, 6, '#fde047'), sq(44, 18, '#fde047'), sq(44, 30, '#67e8f9'), sq(44, 42, '#67e8f9'),
    ];
  },
  asteroids: () => [
    s('path', { d: 'M8 20l9-10 13 2 8 10-4 12-13 4-11-7z', fill: 'none', stroke: '#e2e8f0', 'stroke-width': 2.5, 'stroke-linejoin': 'round' }),
    s('path', { d: 'M44 50l-3-6 5-5 7 2 1 6-5 4z', fill: 'none', stroke: '#e2e8f0', 'stroke-width': 2.2, 'stroke-linejoin': 'round' }),
    s('path', { d: 'M40 36l14-6-6 14-2-6z', fill: 'none', stroke: '#a5f3fc', 'stroke-width': 2.5, 'stroke-linejoin': 'round', transform: 'rotate(-20 46 38)' }),
    s('circle', { cx: 33, cy: 44, r: 1.8, fill: '#fde047' }),
    s('circle', { cx: 27, cy: 49, r: 1.8, fill: '#fde047' }),
  ],
  snake: () => [
    s('path', { d: 'M10 48c0-10 10-10 18-10s16 0 16-9-9-9-15-9-11-2-11-8', fill: 'none', stroke: '#14532d', 'stroke-width': 10, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
    s('path', { d: 'M10 48c0-10 10-10 18-10s16 0 16-9-9-9-15-9-11-2-11-8', fill: 'none', stroke: '#bef264', 'stroke-width': 7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
    s('circle', { cx: 16, cy: 11, r: 1.8, fill: '#14532d' }),
    s('circle', { cx: 48, cy: 49, r: 7, fill: '#ef4444' }),
    s('path', { d: 'M48 42c0-3 2-5 4-6', stroke: '#65a30d', 'stroke-width': 2, fill: 'none', 'stroke-linecap': 'round' }),
    s('circle', { cx: 45.5, cy: 46.5, r: 2, fill: '#fff', opacity: 0.6 }),
  ],
  bejeweled: () => {
    const d = (pts) => 'M' + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L') + 'z';
    const poly = (cx, cy, n, rot, r, sx) => Array.from({ length: n }, (_, k) => [cx + Math.cos(rot + (Math.PI * 2 * k) / n) * r * sx, cy + Math.sin(rot + (Math.PI * 2 * k) / n) * r]);
    // A cut gem: the outline in its colour and a lighter table in the middle.
    const gem = (cx, cy, cut, color, table) => {
      if (cut === 'round') return [s('circle', { cx, cy, r: 7.5, fill: color, stroke: 'rgba(0,0,0,0.35)', 'stroke-width': 1.2 }), s('circle', { cx, cy, r: 3.8, fill: table })];
      const [n, rot, r, sx, dy] = { square: [4, Math.PI / 4, 9.2, 1, 0], diamond: [4, -Math.PI / 2, 9.2, 0.78, 0], emerald: [8, Math.PI / 8, 8.6, 0.8, 0], pentagon: [5, -Math.PI / 2, 8.6, 1, 0.8], triangle: [3, -Math.PI / 2, 9.6, 1.08, 2.3], hexagon: [6, 0, 8.4, 1, 0] }[cut];
      return [
        s('path', { d: d(poly(cx, cy + dy, n, rot, r, sx)), fill: color, stroke: 'rgba(0,0,0,0.35)', 'stroke-width': 1.2, 'stroke-linejoin': 'round' }),
        s('path', { d: d(poly(cx, cy + dy, n, rot, r * 0.5, sx)), fill: table }),
      ];
    };
    return [
      s('rect', { x: 2, y: 22, width: 60, height: 20, rx: 7, fill: '#fef9c3', opacity: 0.3 }),
      gem(12, 12, 'square', '#ef4444', '#fca5a5'),
      gem(32, 12, 'emerald', '#22c55e', '#86efac'),
      gem(52, 12, 'pentagon', '#3b82f6', '#93c5fd'),
      gem(12, 32, 'diamond', '#facc15', '#fef08a'),
      gem(32, 32, 'diamond', '#facc15', '#fef08a'),
      gem(52, 32, 'diamond', '#facc15', '#fef08a'),
      gem(12, 52, 'triangle', '#a855f7', '#d8b4fe'),
      gem(32, 52, 'round', '#e2e8f0', '#ffffff'),
      gem(52, 52, 'hexagon', '#f97316', '#fdba74'),
      s('path', { d: 'M58 17l1.5 3.6 3.6 1.5-3.6 1.5-1.5 3.6-1.5-3.6-3.6-1.5 3.6-1.5z', fill: '#fff' }),
    ];
  },
  breakout: () => {
    const out = [];
    ['#ef4444', '#f97316', '#facc15', '#22c55e'].forEach((c, r) => {
      for (let k = 0; k < 4; k++) if (!(r === 3 && k === 1)) out.push(s('rect', { x: 6 + k * 13.5, y: 8 + r * 7, width: 12, height: 5.5, rx: 1.5, fill: c }));
    });
    out.push(s('path', { d: 'M22 38l12 12', stroke: 'rgba(255,255,255,0.45)', 'stroke-width': 2, 'stroke-dasharray': '2 3' }));
    out.push(s('circle', { cx: 36, cy: 52, r: 4.5, fill: '#fff' }));
    out.push(s('rect', { x: 20, y: 57, width: 26, height: 5, rx: 2.5, fill: '#a5f3fc' }));
    return out;
  },
  2048: () => {
    const tile = (x, y, bg, fg, text, size) => [
      s('rect', { x, y, width: 26, height: 26, rx: 4, fill: bg }),
      s('text', { x: x + 13, y: y + 13 + size * 0.36, 'text-anchor': 'middle', 'font-size': size, 'font-weight': 900, 'font-family': 'system-ui, sans-serif', fill: fg }, text),
    ];
    return [
      s('rect', { x: 2, y: 2, width: 60, height: 60, rx: 7, fill: '#bbada0' }),
      tile(5, 5, '#eee4da', '#776e65', '2', 15),
      tile(33, 5, '#f2b179', '#fff', '8', 15),
      tile(5, 33, '#f67c5f', '#fff', '32', 13),
      tile(33, 33, '#edc22e', '#fff', '2048', 8.5),
    ];
  },
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

/** Game art on a coloured tile, readable on light and dark backgrounds. */
export function gameBadge(id, size = 36) {
  const accent = getGame(id)?.accent || '#8b5cf6';
  return h('span', { class: 'game-badge', style: { '--accent-c': accent, width: `${size}px`, height: `${size}px` } }, gameArt(id, Math.round(size * 0.8)));
}
