// Dots & Boxes UI: an SVG grid with wide invisible hit areas for every line (easy to tap on phones).
import { h, s, fill, initials } from '../ui.js';
import { geometry } from '../../shared/games/dotsboxes.js';

export const SEAT_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b'];
const GAP = 100;
const PAD = 26;

export function create(ctx) {
  let room = null;
  let view = null;
  let seat = null;
  let built = 0;
  let lastKey = null;
  let lines = [];
  let hits = [];
  let boxes = [];
  let labels = [];

  const svg = s('svg', { class: 'db-board', role: 'grid', 'aria-label': 'Dots and boxes board' });
  const el = h('div', { class: 'db-wrap' }, svg);
  const scoreList = h('div', { class: 'pb-scores' });
  const side = h('div', h('div', { class: 'panel-title' }, 'Boxes'), scoreList);

  const myTurn = () => room && room.phase === 'playing' && seat !== null && view && view.turn === seat && room.actors.includes(seat);

  function lineCoords(g, l) {
    if (l < g.H) {
      const r = Math.floor(l / g.n);
      const c = l % g.n;
      return [PAD + c * GAP, PAD + r * GAP, PAD + (c + 1) * GAP, PAD + r * GAP];
    }
    const k = l - g.H;
    const r = Math.floor(k / (g.n + 1));
    const c = k % (g.n + 1);
    return [PAD + c * GAP, PAD + r * GAP, PAD + c * GAP, PAD + (r + 1) * GAP];
  }

  function build(n) {
    const g = geometry(n);
    const size = n * GAP + PAD * 2;
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
    fill(svg);
    const boxLayer = s('g');
    const lineLayer = s('g');
    const hitLayer = s('g');
    const dotLayer = s('g');
    boxes = [];
    labels = [];
    for (let b = 0; b < n * n; b++) {
      const r = Math.floor(b / n);
      const c = b % n;
      const rect = s('rect', { x: PAD + c * GAP + 5, y: PAD + r * GAP + 5, width: GAP - 10, height: GAP - 10, rx: 10, class: 'db-box' });
      const text = s('text', { x: PAD + c * GAP + GAP / 2, y: PAD + r * GAP + GAP / 2 + 12, class: 'db-label', 'text-anchor': 'middle' });
      boxes.push(rect);
      labels.push(text);
      boxLayer.append(rect, text);
    }
    lines = [];
    hits = [];
    for (let l = 0; l < g.L; l++) {
      const [x1, y1, x2, y2] = lineCoords(g, l);
      const ln = s('line', { x1, y1, x2, y2, class: 'db-line' });
      const hit = s('line', { x1, y1, x2, y2, class: 'db-hit', 'data-l': l, role: 'button', 'aria-label': `Line ${l + 1}` });
      hit.addEventListener('click', () => draw(l));
      hit.addEventListener('pointerenter', () => hit.parentNode && ln.classList.add('hover'));
      hit.addEventListener('pointerleave', () => ln.classList.remove('hover'));
      lines.push(ln);
      hits.push(hit);
      lineLayer.append(ln);
      hitLayer.append(hit);
    }
    for (let r = 0; r <= n; r++) for (let c = 0; c <= n; c++) dotLayer.append(s('circle', { cx: PAD + c * GAP, cy: PAD + r * GAP, r: 9, class: 'db-dot' }));
    svg.append(boxLayer, lineLayer, hitLayer, dotLayer);
    built = n;
  }

  function draw(l) {
    if (!myTurn() || view.lines[l] !== -1) return;
    // Optimistic: show the line straight away.
    lines[l].classList.add('drawn', 'fresh');
    lines[l].style.stroke = SEAT_COLORS[seat % 4];
    ctx.act({ type: 'line', line: l }).catch(() => render());
  }

  function render() {
    if (built !== view.n) build(view.n);
    const mine = myTurn();
    svg.style.setProperty('--me', SEAT_COLORS[(seat ?? 0) % 4]);
    svg.classList.toggle('my-turn', mine);
    const key = view.last ? `${view.drawn}:${view.last.line}` : '';
    const fresh = key !== lastKey && lastKey !== null ? view.last : null;
    view.lines.forEach((p, l) => {
      const ln = lines[l];
      const drawn = p !== -1;
      ln.classList.toggle('drawn', drawn);
      ln.classList.toggle('fresh', !!fresh && fresh.line === l);
      ln.classList.toggle('last', !!view.last && view.last.line === l);
      ln.style.stroke = drawn ? SEAT_COLORS[p % 4] : '';
      hits[l].style.display = drawn || !mine ? 'none' : '';
    });
    view.boxes.forEach((p, b) => {
      boxes[b].classList.toggle('owned', p !== -1);
      boxes[b].classList.toggle('fresh', !!fresh && fresh.boxes.includes(b));
      boxes[b].style.fill = p === -1 ? '' : SEAT_COLORS[p % 4];
      labels[b].textContent = p === -1 ? '' : initials(room.seats[p]?.name || '');
    });
    if (fresh) ctx.play(fresh.boxes.length ? 'box' : 'line');
    lastKey = key;
    fill(
      scoreList,
      ...room.seats.map((st, i) =>
        h(
          'div',
          { class: ['pb-score', view.turn === i && room.phase === 'playing' && 'me', view.out[i] && 'muted'] },
          h('span', { class: 'db-swatch', style: { background: SEAT_COLORS[i % 4] } }),
          h('span', st.name),
          h('span', { class: 'v' }, String(view.scores[i])),
        ),
      ),
    );
  }

  return {
    el,
    side,
    update(r, v, st) {
      room = r;
      view = v;
      seat = st;
      render();
    },
    status(r, v, st) {
      if (r.phase !== 'playing' || !v) return null;
      const again = v.last && v.last.player === v.turn && v.last.boxes.length;
      if (ctx.isLocal()) return `${r.seats[v.turn].name}: ${again ? 'box closed, go again' : 'draw a line'}`;
      if (st !== null && v.turn === st) return again ? 'You closed a box: draw another line' : 'Your turn: draw a line between two dots';
      return null;
    },
  };
}
