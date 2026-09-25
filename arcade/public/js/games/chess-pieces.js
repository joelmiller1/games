// Hand-drawn chess piece set (SVG, 100x100). pieceSvg('wK') returns a fresh <svg> element.
import { s } from '../ui.js';

const BASE = 'M22 88h56a4 4 0 0 0 4-4v-3a4 4 0 0 0-4-4H22a4 4 0 0 0-4 4v3a4 4 0 0 0 4 4z';

const SHAPES = {
  P: [
    ['circle', { cx: 50, cy: 31, r: 12 }],
    ['rect', { x: 38, y: 44, width: 24, height: 7, rx: 3 }],
    ['path', { d: 'M40 51c0 10-6 17-10 26h40c-4-9-10-16-10-26z' }],
    ['path', { d: BASE }],
  ],
  R: [
    ['path', { d: 'M28 17h10v7h6v-7h12v7h6v-7h10v17H28z' }],
    ['rect', { x: 31, y: 34, width: 38, height: 7, rx: 2 }],
    ['path', { d: 'M35 41l2 29h26l2-29z' }],
    ['rect', { x: 30, y: 70, width: 40, height: 7, rx: 2 }],
    ['path', { d: BASE }],
    ['path', { d: 'M36 41h28M37 70h26', detail: true }],
  ],
  N: [
    ['path', { d: 'M67 77c2-17 5-31-2-43-4-8-10-13-17-15l-3-8-6 8c-7 3-12 9-15 17l-6 12c-2 5 1 9 6 8l7-3c3-1 6-3 9-6 1 6-2 12-7 18-3 4-3 9-2 12z' }],
    ['path', { d: BASE }],
    ['circle', { cx: 38, cy: 31, r: 2.8, eye: true }],
    ['path', { d: 'M59 31c5 10 6 26 2 40', detail: true }],
  ],
  B: [
    ['circle', { cx: 50, cy: 15, r: 5 }],
    ['path', { d: 'M50 21c12 9 17 21 13 34-2 6-5 9-6 12H43c-1-3-4-6-6-12-4-13 1-25 13-34z' }],
    ['rect', { x: 35, y: 67, width: 30, height: 7, rx: 3 }],
    ['path', { d: 'M38 74c-2 2-5 3-8 3h40c-3 0-6-1-8-3z' }],
    ['path', { d: BASE }],
    ['path', { d: 'M56 33l-10 12', detail: true }],
  ],
  Q: [
    ['path', { d: 'M27 70l-7-38 10 18 5-26 8 22 7-26 7 26 8-22 5 26 10-18-7 38z' }],
    ['circle', { cx: 20, cy: 30, r: 4.5 }],
    ['circle', { cx: 35, cy: 22, r: 4.5 }],
    ['circle', { cx: 50, cy: 18, r: 4.5 }],
    ['circle', { cx: 65, cy: 22, r: 4.5 }],
    ['circle', { cx: 80, cy: 30, r: 4.5 }],
    ['rect', { x: 26, y: 70, width: 48, height: 7, rx: 2 }],
    ['path', { d: BASE }],
    ['path', { d: 'M29 62h42', detail: true }],
  ],
  K: [
    ['path', { d: 'M47 7h6v7h7v6h-7v10h-6V20h-7v-6h7z' }],
    ['path', { d: 'M28 70c-6-12-8-24 0-30 7-5 16-1 22 7 6-8 15-12 22-7 8 6 6 18 0 30z' }],
    ['rect', { x: 27, y: 70, width: 46, height: 7, rx: 2 }],
    ['path', { d: BASE }],
    ['path', { d: 'M50 47v23M31 62h38', detail: true }],
  ],
};

const COLORS = {
  w: { fill: '#fbf8f1', stroke: '#1f2023', detail: '#1f2023', eye: '#1f2023' },
  b: { fill: '#2d3038', stroke: '#0c0d10', detail: '#d7dae3', eye: '#d7dae3' },
};

const cache = new Map();

function build(code) {
  const color = COLORS[code[0]];
  const parts = SHAPES[code[1]].map(([tag, attrs]) => {
    const a = { ...attrs };
    const detail = a.detail;
    const eye = a.eye;
    delete a.detail;
    delete a.eye;
    if (detail) return s(tag, { ...a, fill: 'none', stroke: color.detail, 'stroke-width': 3, 'stroke-linecap': 'round' });
    if (eye) return s(tag, { ...a, fill: color.eye });
    return s(tag, { ...a, fill: color.fill, stroke: color.stroke, 'stroke-width': 3.2, 'stroke-linejoin': 'round' });
  });
  return s('svg', { viewBox: '0 0 100 100', 'aria-hidden': 'true' }, parts);
}

export function pieceSvg(code) {
  if (!cache.has(code)) cache.set(code, build(code));
  const el = cache.get(code).cloneNode(true);
  return el;
}

export const PIECE_NAMES = { K: 'king', Q: 'queen', R: 'rook', B: 'bishop', N: 'knight', P: 'pawn' };
