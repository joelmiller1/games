// Bejeweled screen: gems drawn on a canvas, each colour with its own cut (easy to tell apart for
// colour-blind players), animated swaps, cascades and special gems, and mouse, touch and keyboard
// controls. The rules live in bejeweled-core.js; every move comes back as a list of steps to animate.
import { h } from '../ui.js';
import { play } from '../sound.js';
import { Match3, SIZE, adjacent, rowOf, colOf } from './bejeweled-core.js';
import { fitCanvas, Loop, listenKeys, onResize } from './common.js';

export const info = {
  intro: 'Swap two neighbouring gems to line up three or more of a colour. Four in a row makes a flame gem, an L or T a star gem and five in a row a hypercube.',
  keys: [
    [['Mouse'], 'Drag a gem onto a neighbour, or click both'],
    [['←', '↑', '→', '↓'], 'Move the cursor'],
    [['Space'], 'Pick up a gem, then an arrow swaps it'],
    [['H'], 'Hint'],
    [['P'], 'Pause'],
  ],
  touch: 'Swipe a gem towards a neighbour to swap them, or tap one gem and then the other.',
};

const BLITZ_SECONDS = 60;
const HINT_AFTER = 9; // seconds without a move before a hint shows up
const GRAVITY = 70; // rows per second², for falling gems
const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const WORDS = ['', '', 'Good!', 'Great!', 'Excellent!', 'Awesome!', 'Spectacular!', 'Unbelievable!'];

// Every colour has its own cut: number of sides (0 = round), rotation, width, size and a nudge
// down so pointy shapes sit in the middle of their square.
const GEMS = [
  { color: '#ef4444', sides: 4, rot: Math.PI / 4, sx: 1, r: 1.12, dy: 0 },
  { color: '#f97316', sides: 6, rot: 0, sx: 1, r: 1, dy: 0 },
  { color: '#facc15', sides: 4, rot: -Math.PI / 2, sx: 0.78, r: 1.1, dy: 0 },
  { color: '#22c55e', sides: 8, rot: Math.PI / 8, sx: 0.8, r: 1.04, dy: 0 },
  { color: '#3b82f6', sides: 5, rot: -Math.PI / 2, sx: 1, r: 1.04, dy: 0.1 },
  { color: '#a855f7', sides: 3, rot: -Math.PI / 2, sx: 1.08, r: 1.18, dy: 0.28 },
  { color: '#e2e8f0', sides: 0, rot: 0, sx: 1, r: 0.92, dy: 0 },
];

const clockText = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const smooth = (k) => k * k * (3 - 2 * k);
const backOut = (k) => 1 + 2.70158 * (k - 1) ** 3 + 1.70158 * (k - 1) ** 2;

function light(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(v + (f > 0 ? (255 - v) * f : v * f))));
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

function trace(ctx, pts) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

function corners(gem, cx, cy, R, k = 1) {
  return Array.from({ length: gem.sides }, (_, i) => {
    const a = gem.rot + (Math.PI * 2 * i) / gem.sides;
    return [cx + Math.cos(a) * R * gem.r * gem.sx * k, cy + Math.sin(a) * R * gem.r * k];
  });
}

/** A cut gem: bevelled facets lit from the top left, a bright table in the middle and a glint. */
function drawGem(ctx, c, cx, cy, R) {
  const gem = GEMS[c];
  const base = gem.color;
  cy += gem.dy * R;
  ctx.lineJoin = 'round';
  if (!gem.sides) {
    const r = R * gem.r;
    const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.05, cx, cy, r);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.45, base);
    g.addColorStop(1, light(base, -0.55));
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    const table = Array.from({ length: 8 }, (_, i) => {
      const a = (Math.PI / 4) * i + Math.PI / 8;
      return [cx + Math.cos(a) * r * 0.5, cy + Math.sin(a) * r * 0.5];
    });
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = R * 0.04;
    ctx.beginPath();
    table.forEach(([x, y]) => {
      ctx.moveTo(x, y);
      ctx.lineTo(cx + (x - cx) * 1.94, cy + (y - cy) * 1.94);
    });
    ctx.stroke();
    trace(ctx, table);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = light(base, -0.62);
    ctx.lineWidth = R * 0.07;
    ctx.stroke();
  } else {
    const outer = corners(gem, cx, cy, R);
    const inner = corners(gem, cx, cy, R, 0.52);
    const n = outer.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const mx = (outer[i][0] + outer[j][0]) / 2 - cx;
      const my = (outer[i][1] + outer[j][1]) / 2 - cy;
      const lit = (-mx * 0.55 - my * 0.83) / (Math.hypot(mx, my) || 1);
      trace(ctx, [outer[i], outer[j], inner[j], inner[i]]);
      ctx.fillStyle = light(base, lit * 0.5);
      ctx.fill();
    }
    trace(ctx, inner);
    const tg = ctx.createLinearGradient(cx - R * 0.4, cy - R * 0.4, cx + R * 0.4, cy + R * 0.4);
    tg.addColorStop(0, light(base, 0.5));
    tg.addColorStop(1, light(base, 0.05));
    ctx.fillStyle = tg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = R * 0.035;
    ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      ctx.moveTo(inner[i][0], inner[i][1]);
      ctx.lineTo(outer[i][0], outer[i][1]);
    }
    ctx.stroke();
    trace(ctx, outer);
    ctx.strokeStyle = light(base, -0.62);
    ctx.lineWidth = R * 0.07;
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.ellipse(cx - R * 0.2, cy - R * 0.26, R * 0.13, R * 0.07, -Math.PI / 4, 0, Math.PI * 2);
  ctx.fill();
}

/** The hypercube: a little cube whose faces cycle through the rainbow. */
function drawCube(ctx, x, y, R, t, alpha) {
  const s = R * 0.95;
  const hue = t * 120;
  const v = [
    [0, -s],
    [s * 0.87, -s / 2],
    [s * 0.87, s / 2],
    [0, s],
    [-s * 0.87, s / 2],
    [-s * 0.87, -s / 2],
  ];
  const o = [0, 0];
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(Math.sin(t * 1.6) * 0.18);
  const face = (pts, hh, l) => {
    trace(ctx, pts);
    ctx.fillStyle = `hsl(${Math.round(hh) % 360},90%,${l}%)`;
    ctx.fill();
  };
  face([v[0], v[1], o, v[5]], hue, 74);
  face([v[5], o, v[3], v[4]], hue + 120, 56);
  face([o, v[1], v[2], v[3]], hue + 240, 46);
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1, R * 0.08);
  ctx.strokeStyle = 'rgba(255,255,255,0.92)';
  trace(ctx, v);
  ctx.stroke();
  ctx.beginPath();
  for (const k of [1, 3, 5]) {
    ctx.moveTo(0, 0);
    ctx.lineTo(v[k][0], v[k][1]);
  }
  ctx.stroke();
  ctx.restore();
}

function sparkle(ctx, x, y, r, a) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.beginPath();
  for (let k = 0; k < 8; k++) {
    const ang = (Math.PI / 4) * k;
    const rr = k % 2 ? r * 0.2 : r;
    ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.restore();
}

export function create({ host, options, seed, onProgress, onEnd }) {
  const blitz = options?.mode === 'blitz';
  const game = new Match3({ seed, mode: blitz ? 'blitz' : 'classic' });

  const scoreEl = h('strong', '0');
  const levelEl = h('strong', '1');
  const meterEl = h('div');
  const timeEl = h('strong', clockText(BLITZ_SECONDS));
  const hintBtn = h('button', { class: 'bj-hint', type: 'button', title: 'Show a move (H)' }, 'Hint');
  const bar = h(
    'div',
    { class: 'bj-bar' },
    h('div', { class: 'bj-stat' }, h('span', 'Score'), scoreEl),
    h('div', { class: 'bj-stat' }, h('span', 'Level'), levelEl, h('div', { class: 'bj-meter' }, meterEl)),
    blitz ? h('div', { class: 'bj-stat time' }, h('span', 'Time'), timeEl) : null,
    hintBtn,
  );
  const canvas = h('canvas', { class: 'ar-canvas', 'aria-label': 'Bejeweled board' });
  const wrap = h('div', { class: 'ar-canvas-wrap' }, bar, canvas);
  const root = h('div', { class: 'ar-game bj' }, wrap);
  host.append(root);

  const sprites = new Map(); // gem id -> { id, color, special, x, y (in squares), s, a, born }
  const particles = [];
  const effects = [];
  const texts = [];
  const queue = [];
  const shown = { score: 0, level: 1, progress: 0, goal: game.goal() };
  let anim = null;
  let banner = null;
  let selected = -1;
  let cursor = 3 * SIZE + 3;
  let showCursor = false;
  let hint = null;
  let idle = 0;
  let drag = null;
  let started = false;
  let paused = false;
  let finishing = false;
  let ended = false;
  let endAt = 0;
  let timeLeft = BLITZ_SECONDS;
  let lastWhole = BLITZ_SECONDS;
  let wall = 0; // the blitz clock runs on real time, so a slow screen gets no extra seconds
  let clock = 0;
  let rolling = 0;
  let cell = 40;
  let dpr = 1;
  let W = 0;
  let sheet = null;

  game.board.forEach((g, i) => sprites.set(g.id, { id: g.id, color: g.color, special: g.special, x: colOf(i), y: rowOf(i) }));

  const busy = () => !!anim || queue.length > 0;
  const ready = () => started && !paused && !finishing && !busy() && (!blitz || timeLeft > 0);

  function hud() {
    levelEl.textContent = String(shown.level);
    meterEl.style.width = `${Math.min(100, (shown.progress / shown.goal) * 100).toFixed(1)}%`;
  }

  function report() {
    onProgress({ score: shown.score, stat: shown.level });
  }

  // Gems are drawn once per size into little canvases, then copied onto the board.
  function buildSheet() {
    const px = Math.max(8, Math.round(cell * dpr));
    sheet = GEMS.map((_, c) => {
      const cv = document.createElement('canvas');
      cv.width = cv.height = px;
      drawGem(cv.getContext('2d'), c, px / 2, px / 2, px * 0.4);
      return cv;
    });
  }

  // The score bar and the board sit together in the middle of the stage.
  function resize() {
    const r = wrap.getBoundingClientRect();
    if (!r.width || !r.height) return;
    cell = Math.max(20, Math.floor(Math.min(r.width - 8, r.height - bar.offsetHeight - 18, 720) / SIZE));
    W = cell * SIZE;
    const d = fitCanvas(canvas, W, W);
    if (!sheet || d !== dpr || sheet[0].width !== Math.max(8, Math.round(cell * d))) {
      dpr = d;
      buildSheet();
    }
    clearPause();
    render();
  }

  // Slide the score bar out from under the pause button in the corner, if it ends up there.
  function clearPause() {
    bar.style.transform = '';
    const pause = root.closest('.ar-stage')?.querySelector('.ar-pause');
    if (!pause || pause.hidden) return;
    const a = bar.getBoundingClientRect();
    const p = pause.getBoundingClientRect();
    if (a.top >= p.bottom || a.bottom <= p.top || a.right <= p.left - 6) return;
    const shift = Math.min(a.right - p.left + 6, a.left - wrap.getBoundingClientRect().left);
    if (shift > 0) bar.style.transform = `translateX(${-Math.round(shift)}px)`;
  }

  // ---- moves and their animation ----
  function trySwap(a, b) {
    selected = -1;
    hint = null;
    idle = 0;
    drag = null;
    cursor = b;
    const res = game.swap(a, b);
    if (!res) return;
    queue.push(...res.steps);
    advance();
  }

  function advance() {
    while (!anim && queue.length) begin(queue.shift());
    // A blitz that ran out of time while gems were still falling ends once the board is still.
    if (!busy() && blitz && timeLeft <= 0) finish("Time's up!", 'bonus');
  }

  const slide = (sp, to) => ({ sp, x0: sp.x, y0: sp.y, x1: colOf(to), y1: rowOf(to) });

  function fall(sp, to) {
    const d = Math.max(0, rowOf(to) - sp.y);
    const v0 = 4;
    return { sp, x0: sp.x, y0: sp.y, x1: colOf(to), y1: rowOf(to), v0, dur: (-v0 + Math.sqrt(v0 * v0 + 2 * GRAVITY * d)) / GRAVITY };
  }

  function begin(st) {
    if (st.type === 'swap' || st.type === 'swapback') {
      const A = sprites.get(st.ids[0]);
      const B = sprites.get(st.ids[1]);
      const [from, to] = st.type === 'swap' ? [st.a, st.b] : [st.b, st.a];
      anim = { st, t: 0, dur: 0.17, tweens: [A && slide(A, to), B && slide(B, from)].filter(Boolean) };
      play(st.type === 'swap' ? 'swish' : 'buzz', 40);
    } else if (st.type === 'cube') {
      effects.push({ kind: 'bolts', from: st.cell, to: st.cells.filter((c) => c !== st.cell), t: 0, dur: 0.65 });
      anim = { st, t: 0, dur: 0.42 };
      play('zap');
    } else if (st.type === 'clear') {
      clearStart(st);
    } else if (st.type === 'fall') {
      const tweens = [];
      for (const m of st.moves) {
        const sp = sprites.get(m.id);
        if (sp) tweens.push(fall(sp, m.to));
      }
      for (const s of st.spawns) {
        const sp = { id: s.id, color: s.color, special: null, x: colOf(s.to), y: s.fromRow };
        sprites.set(s.id, sp);
        tweens.push(fall(sp, s.to));
      }
      anim = { st, t: 0, dur: Math.max(0.05, ...tweens.map((tw) => tw.dur)), tweens };
    } else if (st.type === 'level') {
      shown.level = st.level;
      shown.progress = st.progress;
      shown.goal = st.goal;
      hud();
      report();
      banner = { text: `Level ${st.level}`, sub: `Points ×${st.level}`, t: 0, dur: 1.7 };
      play('levelup');
    } else if (st.type === 'shuffle') {
      banner = { text: 'No more moves', sub: 'Shuffling the gems…', t: 0, dur: 1.5 };
      play('dice');
      const tweens = [];
      if (st.gems.every((g) => sprites.has(g.id))) for (const g of st.gems) tweens.push(slide(sprites.get(g.id), g.to));
      else {
        sprites.clear();
        for (const g of st.gems) sprites.set(g.id, { id: g.id, color: g.color, special: g.special, x: colOf(g.to), y: rowOf(g.to), born: clock + 0.4 });
      }
      anim = { st, t: 0, dur: 1, delay: 0.35, tweens };
    } else if (st.type === 'over') finish('No more moves', 'crash');
  }

  function clearStart(st) {
    // Gems of a line that makes a special gem slide into it while they vanish.
    const into = new Map();
    for (const cr of st.created) {
      const grp = st.groups.find((g) => g.cells.includes(cr.cell));
      if (grp) st.cells.forEach((c, k) => grp.cells.includes(c) && into.set(st.ids[k], cr.cell));
    }
    const replaced = st.created.map((c) => c.replaced).filter((id) => id !== null);
    const gone = [];
    for (const id of [...st.ids, ...replaced]) {
      const sp = sprites.get(id);
      if (!sp) continue;
      const to = into.get(id);
      gone.push({ sp, x0: sp.x, y0: sp.y, to: to === undefined ? null : [colOf(to), rowOf(to)] });
      burst(sp.x + 0.5, sp.y + 0.5, sp.special === 'cube' ? null : sp.color, to === undefined ? 7 : 3);
    }
    anim = { st, t: 0, dur: 0.3, gone };
    for (const b of st.blasts) blast(b);
    const cells = st.groups.length ? st.groups.flatMap((g) => g.cells) : st.cells;
    if (cells.length && st.points) {
      const color = st.groups.length ? light(GEMS[st.groups[0].color].color, 0.45) : '#fff';
      texts.push({
        text: `+${st.points.toLocaleString('en-US')}`,
        x: cells.reduce((a, c) => a + colOf(c), 0) / cells.length + 0.5,
        y: cells.reduce((a, c) => a + rowOf(c), 0) / cells.length + 0.5,
        rise: 0.9,
        t: 0,
        dur: 1,
        size: st.points >= 1000 ? 0.52 : 0.42,
        color,
      });
    }
    if (st.cascade >= 2) texts.push({ text: WORDS[Math.min(st.cascade, WORDS.length - 1)], x: SIZE / 2, y: SIZE / 2 - 1.2, rise: 0.5, t: 0, dur: 1.2, size: 0.85, color: '#fff', word: true });
    if (st.created.length) play('bonus');
    play(`match${Math.min(st.cascade, 6)}`);
    shown.score = st.score;
    shown.progress = st.progress;
    shown.goal = st.goal;
    hud();
    report();
  }

  function blast(b) {
    const x = colOf(b.cell);
    const y = rowOf(b.cell);
    if (b.kind === 'flame') {
      effects.push({ kind: 'ring', x, y, t: 0, dur: 0.5 });
      burst(x + 0.5, y + 0.5, 'fire', 18, 7);
      play('rock', 60);
    } else if (b.kind === 'star') {
      effects.push({ kind: 'beam', x, y, t: 0, dur: 0.5 });
      play('laser', 60);
    } else {
      effects.push({ kind: 'bolts', from: b.cell, to: b.cells.filter((c) => c !== b.cell), t: 0, dur: 0.6 });
      play('zap', 60);
    }
  }

  function burst(x, y, color, n, speed = 4.5) {
    for (let k = 0; k < n && particles.length < 700; k++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.35 + Math.random() * 0.8);
      const life = 0.45 + Math.random() * 0.4;
      const col =
        color === 'fire' ? `hsl(${Math.round(20 + Math.random() * 35)},100%,${Math.round(55 + Math.random() * 25)}%)` : color === null ? `hsl(${Math.floor(Math.random() * 360)},100%,72%)` : light(GEMS[color].color, 0.25 + Math.random() * 0.4);
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1.2, life, max: life, color: col, size: 0.035 + Math.random() * 0.05, g: 9 });
    }
  }

  function finishStep(an) {
    for (const tw of an.tweens || []) {
      tw.sp.x = tw.x1;
      tw.sp.y = tw.y1;
    }
    if (an.st.type === 'clear') {
      for (const g of an.gone) sprites.delete(g.sp.id);
      for (const c of an.st.created) sprites.set(c.id, { id: c.id, color: c.color, special: c.special, x: colOf(c.cell), y: rowOf(c.cell), born: clock });
    } else if (an.st.type === 'fall') play('lock', 90);
  }

  function animate(an) {
    const k = Math.min(1, an.t / an.dur);
    const type = an.st.type;
    if (type === 'swap' || type === 'swapback' || type === 'shuffle') {
      const d = an.delay || 0;
      const e = smooth(Math.max(0, Math.min(1, (an.t - d) / (an.dur - d))));
      for (const tw of an.tweens) {
        tw.sp.x = tw.x0 + (tw.x1 - tw.x0) * e;
        tw.sp.y = tw.y0 + (tw.y1 - tw.y0) * e;
      }
    } else if (type === 'fall') {
      for (const tw of an.tweens) {
        const t = Math.min(an.t, tw.dur);
        tw.sp.y = Math.min(tw.y1, tw.y0 + tw.v0 * t + 0.5 * GRAVITY * t * t);
      }
    } else if (type === 'clear') {
      for (const g of an.gone) {
        g.sp.s = k < 0.25 ? 1 + k * 0.6 : Math.max(0, 1.15 * (1 - (k - 0.25) / 0.75));
        g.sp.a = k < 0.5 ? 1 : 2 - k * 2;
        g.sp.flash = 1 - k;
        if (g.to) {
          const e = k * k;
          g.sp.x = g.x0 + (g.to[0] - g.x0) * e;
          g.sp.y = g.y0 + (g.to[1] - g.y0) * e;
        }
      }
    }
  }

  function finish(text, sound) {
    if (finishing) return;
    finishing = true;
    selected = -1;
    hint = null;
    drag = null;
    banner = { text, t: 0, dur: Infinity };
    play(sound);
    endAt = clock + 1.6;
  }

  function showHint() {
    if (!ready()) return;
    idle = 0;
    const mv = game.hint();
    if (!mv) return;
    hint = { cells: mv, t: 0 };
    play('hold');
  }

  // ---- input ----
  const cellAt = (e) => {
    const r = canvas.getBoundingClientRect();
    const c = Math.floor(((e.clientX - r.left) / r.width) * SIZE);
    const w = Math.floor(((e.clientY - r.top) / r.height) * SIZE);
    return c >= 0 && c < SIZE && w >= 0 && w < SIZE ? w * SIZE + c : -1;
  };

  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    if (!ready()) return;
    const i = cellAt(e);
    if (i < 0) return;
    showCursor = false;
    cursor = i;
    if (selected >= 0 && adjacent(selected, i)) {
      trySwap(selected, i);
      return;
    }
    const again = selected === i;
    if (!again) {
      selected = i;
      play('click');
    }
    drag = { id: e.pointerId, i, x: e.clientX, y: e.clientY, again };
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < (canvas.getBoundingClientRect().width / SIZE) * 0.3) return;
    const from = drag.i;
    drag = null;
    const r = rowOf(from) + (Math.abs(dy) > Math.abs(dx) ? Math.sign(dy) : 0);
    const c = colOf(from) + (Math.abs(dy) > Math.abs(dx) ? 0 : Math.sign(dx));
    if (r >= 0 && r < SIZE && c >= 0 && c < SIZE && ready()) trySwap(from, r * SIZE + c);
  });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    // Tapping the picked-up gem again puts it back down.
    if (drag.again && e.type === 'pointerup') selected = -1;
    drag = null;
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  hintBtn.addEventListener('click', () => {
    showHint();
    hintBtn.blur();
  });

  const MOVES = { ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0], ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1] };
  const offKeys = listenKeys((e) => {
    const d = MOVES[e.code];
    const pick = e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter';
    if (!d && !pick && e.code !== 'KeyH') return false;
    if (!ready()) return true;
    if (e.code === 'KeyH') {
      showHint();
      return true;
    }
    if (!showCursor) {
      // The first key press shows the cursor (on the picked-up gem, if there is one).
      showCursor = true;
      if (selected >= 0) cursor = selected;
      if (!d || selected < 0) return true;
    }
    if (d) {
      const r = rowOf(cursor) + d[1];
      const c = colOf(cursor) + d[0];
      if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return true;
      if (selected === cursor) trySwap(cursor, r * SIZE + c);
      else cursor = r * SIZE + c;
      return true;
    }
    selected = selected === cursor ? -1 : cursor;
    play('click');
    return true;
  });

  // ---- per-step update ----
  function update(dt) {
    clock += dt;
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        particles[i] = particles[particles.length - 1];
        particles.pop();
        continue;
      }
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (const sp of sprites.values()) {
      if (sp.special !== 'flame' || Math.random() > dt * 6 || particles.length >= 700) continue;
      const life = 0.4 + Math.random() * 0.3;
      particles.push({ x: sp.x + 0.5 + (Math.random() - 0.5) * 0.5, y: sp.y + 0.35, vx: (Math.random() - 0.5) * 0.3, vy: -1 - Math.random() * 0.8, life, max: life, color: `hsl(${Math.round(25 + Math.random() * 25)},100%,60%)`, size: 0.025 + Math.random() * 0.03, g: 0 });
    }
    for (const list of [effects, texts]) {
      for (const e of list) e.t += dt;
      for (let i = list.length - 1; i >= 0; i--) if (list[i].t >= list[i].dur) list.splice(i, 1);
    }
    if (banner) {
      banner.t += dt;
      if (banner.t >= banner.dur) banner = null;
    }
    if (hint) {
      hint.t += dt;
      if (hint.t > 3.2) hint = null;
    }
    if (rolling !== shown.score) {
      rolling = Math.min(shown.score, rolling + Math.max(1, (shown.score - rolling) * dt * 8));
      scoreEl.textContent = Math.floor(rolling).toLocaleString('en-US');
    }
    if (!started) return;
    if (anim) {
      anim.t += dt;
      animate(anim);
      if (anim.t >= anim.dur) {
        const done = anim;
        anim = null;
        finishStep(done);
        advance();
      }
    }
    if (blitz && !finishing && timeLeft > 0) {
      const now = performance.now();
      timeLeft = Math.max(0, timeLeft - (now - wall) / 1000);
      wall = now;
      const whole = Math.ceil(timeLeft);
      if (whole !== lastWhole) {
        lastWhole = whole;
        timeEl.textContent = clockText(whole);
        timeEl.parentElement.classList.toggle('low', whole <= 10);
        if (whole <= 10 && whole > 0) play('turn');
      }
      if (timeLeft <= 0) {
        selected = -1;
        hint = null;
        drag = null;
        if (!busy()) finish("Time's up!", 'bonus');
      }
    }
    if (ready()) {
      idle += dt;
      if (idle > HINT_AFTER && !hint) showHint();
    }
    if (finishing && !ended && clock >= endAt) {
      ended = true;
      onEnd({ score: game.score, stat: game.level, ok: true });
    }
  }

  // ---- drawing ----
  function highlight(ctx, i, fill, stroke) {
    const c = cell;
    roundRect(ctx, colOf(i) * c + 2, rowOf(i) * c + 2, c - 4, c - 4, c * 0.16);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = Math.max(2, c * 0.05);
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }

  function aura(ctx, x, y, R, inner, mid) {
    const g = ctx.createRadialGradient(x, y, R * 0.12, x, y, R);
    g.addColorStop(0, inner);
    g.addColorStop(0.55, mid);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - R, y - R, R * 2, R * 2);
  }

  function drawEffect(ctx, e) {
    const c = cell;
    const k = e.t / e.dur;
    if (e.kind === 'ring') {
      const x = (e.x + 0.5) * c;
      const y = (e.y + 0.5) * c;
      const r = c * (0.4 + 1.6 * (1 - (1 - k) ** 2));
      ctx.globalAlpha = 1 - k;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,240,180,0.95)');
      g.addColorStop(0.6, 'rgba(255,140,40,0.65)');
      g.addColorStop(1, 'rgba(255,80,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    } else if (e.kind === 'beam') {
      const w = c * (0.95 - 0.7 * k);
      const x = (e.x + 0.5) * c;
      const y = (e.y + 0.5) * c;
      ctx.globalAlpha = 1 - k * k;
      for (const [x0, y0, x1, y1, rx, ry, rw, rh] of [
        [0, y - w / 2, 0, y + w / 2, 0, y - w / 2, W, w],
        [x - w / 2, 0, x + w / 2, 0, x - w / 2, 0, w, W],
      ]) {
        const g = ctx.createLinearGradient(x0, y0, x1, y1);
        g.addColorStop(0, 'rgba(147,197,253,0)');
        g.addColorStop(0.5, 'rgba(255,255,255,0.95)');
        g.addColorStop(1, 'rgba(147,197,253,0)');
        ctx.fillStyle = g;
        ctx.fillRect(rx, ry, rw, rh);
      }
    } else if (e.kind === 'bolts') {
      const fx = (colOf(e.from) + 0.5) * c;
      const fy = (rowOf(e.from) + 0.5) * c;
      ctx.globalAlpha = k < 0.7 ? 1 : (1 - k) / 0.3;
      ctx.lineWidth = Math.max(1.5, c * 0.05);
      ctx.lineJoin = 'round';
      ctx.strokeStyle = `hsl(${Math.round(clock * 300) % 360},100%,82%)`;
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      for (const t of e.to) {
        const tx = (colOf(t) + 0.5) * c;
        const ty = (rowOf(t) + 0.5) * c;
        const len = Math.hypot(tx - fx, ty - fy) || 1;
        const nx = -(ty - fy) / len;
        const ny = (tx - fx) / len;
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        for (let i = 1; i < 6; i++) {
          const j = (Math.random() - 0.5) * c * 0.35;
          ctx.lineTo(fx + ((tx - fx) * i) / 6 + j * nx, fy + ((ty - fy) * i) / 6 + j * ny);
        }
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(tx, ty, c * 0.42, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function render() {
    if (!W || !sheet) return;
    const ctx = canvas.getContext('2d');
    const c = cell;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, W);
    roundRect(ctx, 0, 0, W, W, c * 0.2);
    ctx.fillStyle = 'rgba(8,12,34,0.82)';
    ctx.fill();
    ctx.save();
    roundRect(ctx, 0, 0, W, W, c * 0.2);
    ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.045)';
    for (let r = 0; r < SIZE; r++) for (let k = 0; k < SIZE; k++) if ((r + k) % 2) ctx.fillRect(k * c, r * c, c, c);

    if (selected >= 0) highlight(ctx, selected, 'rgba(255,255,255,0.2)', 'rgba(255,255,255,0.95)');
    if (hint) {
      const p = 0.5 + 0.5 * Math.sin(hint.t * 9);
      for (const i of hint.cells) highlight(ctx, i, `rgba(253,224,71,${(0.1 + 0.2 * p).toFixed(3)})`, `rgba(253,224,71,${(0.45 + 0.55 * p).toFixed(3)})`);
    }
    const selId = selected >= 0 ? game.board[selected]?.id : null;

    // Glows behind the special gems.
    for (const sp of sprites.values()) {
      if (!sp.special || sp.a === 0) continue;
      const x = (sp.x + 0.5) * c;
      const y = (sp.y + 0.5) * c;
      if (sp.special === 'flame') {
        const f = 0.7 + 0.3 * Math.sin(clock * 13 + sp.id) * Math.sin(clock * 5.3 + sp.id * 1.7);
        aura(ctx, x, y, c * 0.66, `rgba(255,214,102,${(0.95 * f).toFixed(3)})`, `rgba(255,112,32,${(0.6 * f).toFixed(3)})`);
      } else if (sp.special === 'star') {
        const f = 0.75 + 0.25 * Math.sin(clock * 6 + sp.id);
        aura(ctx, x, y, c * 0.62, `rgba(255,255,255,${(0.9 * f).toFixed(3)})`, `rgba(191,219,254,${(0.35 * f).toFixed(3)})`);
      } else if (sp.special === 'cube') {
        aura(ctx, x, y, c * 0.66, `hsla(${Math.round(clock * 120) % 360},100%,75%,0.8)`, `hsla(${Math.round(clock * 120 + 120) % 360},100%,60%,0.35)`);
      }
    }

    // The gems.
    for (const sp of sprites.values()) {
      if (sp.y < -1) continue;
      const x = (sp.x + 0.5) * c;
      const y = (sp.y + 0.5) * c;
      let s = sp.s ?? 1;
      if (sp.born !== undefined) s *= backOut(Math.max(0, Math.min(1, (clock - sp.born) / 0.25)));
      if (sp.id === selId) s *= 1 + 0.07 * Math.sin(clock * 9);
      if (s <= 0.01) continue;
      const a = sp.a ?? 1;
      if (sp.special === 'cube') drawCube(ctx, x, y, c * 0.4 * s, clock + sp.id * 0.37, a);
      else {
        const size = c * s;
        ctx.globalAlpha = a;
        ctx.drawImage(sheet[sp.color], x - size / 2, y - size / 2, size, size);
        if (sp.special === 'star') sparkle(ctx, x, y, c * 0.3 * s, clock * 1.5 + sp.id);
      }
      if (sp.flash) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = sp.flash * 0.6;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(x, y, c * 0.36 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.globalAlpha = 1;
    }

    ctx.globalCompositeOperation = 'lighter';
    for (const e of effects) drawEffect(ctx, e);
    for (const p of particles) {
      ctx.globalAlpha = Math.min(1, (p.life / p.max) * 1.4);
      ctx.fillStyle = p.color;
      const r = p.size * c;
      ctx.fillRect(p.x * c - r, p.y * c - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    if (showCursor && started && !finishing) {
      ctx.setLineDash([c * 0.14, c * 0.1]);
      roundRect(ctx, colOf(cursor) * c + 3, rowOf(cursor) * c + 3, c - 6, c - 6, c * 0.14);
      ctx.lineWidth = Math.max(2, c * 0.05);
      ctx.strokeStyle = '#a5f3fc';
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (finishing) {
      ctx.fillStyle = 'rgba(5,8,22,0.45)';
      ctx.fillRect(0, 0, W, W);
    }
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const t of texts) {
      const k = t.t / t.dur;
      const pop = t.word ? backOut(Math.min(1, t.t / 0.25)) : 1;
      ctx.globalAlpha = k < 0.7 ? 1 : Math.max(0, (1 - k) / 0.3);
      ctx.font = `900 ${Math.max(10, Math.round(c * t.size * pop))}px ${FONT}`;
      ctx.lineWidth = Math.max(3, c * 0.1);
      ctx.strokeStyle = 'rgba(10,10,30,0.85)';
      ctx.strokeText(t.text, t.x * c, (t.y - t.rise * k) * c);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x * c, (t.y - t.rise * k) * c);
    }
    ctx.globalAlpha = 1;
    if (banner) {
      const fade = banner.dur === Infinity ? 1 : Math.min(1, (banner.dur - banner.t) / 0.3);
      ctx.globalAlpha = Math.max(0, Math.min(1, banner.t / 0.2, fade));
      const bh = c * (banner.sub ? 1.9 : 1.4);
      ctx.fillStyle = 'rgba(5,8,22,0.78)';
      ctx.fillRect(0, W / 2 - bh / 2, W, bh);
      ctx.fillStyle = '#fff';
      ctx.font = `900 ${Math.round(c * 0.7)}px ${FONT}`;
      ctx.fillText(banner.text, W / 2, W / 2 - (banner.sub ? c * 0.26 : 0));
      if (banner.sub) {
        ctx.fillStyle = '#fde68a';
        ctx.font = `700 ${Math.round(c * 0.34)}px ${FONT}`;
        ctx.fillText(banner.sub, W / 2, W / 2 + c * 0.5);
      }
      ctx.globalAlpha = 1;
    }
  }

  hud();
  report();
  const loop = new Loop({ step: 1 / 120, update, render });
  const offResize = onResize(wrap, resize);
  requestAnimationFrame(resize);
  loop.start();

  return {
    start() {
      started = true;
      idle = 0;
      wall = performance.now();
      clearPause();
    },
    setPaused(p) {
      paused = p;
      loop.paused = p;
      wall = performance.now();
      drag = null;
      root.classList.toggle('paused', p);
    },
    destroy() {
      loop.stop();
      offKeys();
      offResize();
    },
  };
}
