// Mancala board UI: your pits along the bottom, seeds sown one at a time, captures highlighted.
import { h, fill } from '../ui.js';

const SEED_COLORS = ['#38bdf8', '#f472b6', '#a3e635', '#facc15', '#c084fc', '#fb923c', '#f8fafc', '#2dd4bf'];
const STEP_MS = 140;

// Stable, pleasant positions for up to 24 seeds in a pit (a loose spiral).
const SPOTS = Array.from({ length: 24 }, (_, i) => {
  const a = i * 2.4;
  const r = 0.12 + 0.3 * Math.sqrt(i / 24);
  return [50 + Math.cos(a) * r * 100, 50 + Math.sin(a) * r * 100];
});

function seedsEl(n, big = false) {
  const shown = Math.min(n, big ? 24 : 18);
  const box = h('div', { class: 'mc-seeds' });
  for (let i = 0; i < shown; i++) {
    const [x, y] = SPOTS[i];
    box.append(h('i', { style: { left: `${x}%`, top: `${y}%`, background: SEED_COLORS[(i * 5 + n) % SEED_COLORS.length] } }));
  }
  return box;
}

export function create(ctx) {
  let room = null;
  let view = null;
  let seat = null;
  let shown = null; // pits currently on screen (lags the real state during animations)
  let seenMoves = null;
  let queue = [];
  let animating = false;
  let orient = 0; // pass & play: whose pits are at the bottom

  const boardEl = h('div', { class: 'mc-board' });
  const note = h('div', { class: 'mc-note', 'aria-live': 'polite' });
  const el = h('div', { class: 'mc-wrap' }, boardEl, note);

  // Your pits go along the bottom; in pass & play, those of the player whose turn it is.
  const me = () => (ctx.isLocal() ? orient : seat === null ? 0 : seat);
  const myTurn = () => room && room.phase === 'playing' && seat !== null && view && view.turn === seat && room.actors.includes(seat) && !animating;

  function pitButton(i, pits, hi) {
    const n = pits[i];
    const mine = view && (i < 7 ? 0 : 1) === me();
    const playable = myTurn() && view.legal.includes(i);
    const b = h(
      'button',
      {
        class: ['mc-pit', playable && 'playable', hi.hot.has(i) && 'hot', hi.cap.has(i) && 'cap'],
        type: 'button',
        disabled: !playable,
        'aria-label': `${mine ? 'Your' : 'Opponent'} pit with ${n} seed${n === 1 ? '' : 's'}`,
        onClick: () => sowFrom(i),
      },
      seedsEl(n),
      h('span', { class: 'mc-n' }, String(n)),
    );
    return b;
  }

  function storeEl(i, pits, hi, who) {
    return h(
      'div',
      { class: ['mc-store', hi.hot.has(i) && 'hot'] },
      h('span', { class: 'mc-who' }, who),
      seedsEl(pits[i], true),
      h('span', { class: 'mc-n big' }, String(pits[i])),
    );
  }

  function draw(pits, hi = { hot: new Set(), cap: new Set() }) {
    const p = me();
    const myPits = p === 0 ? [0, 1, 2, 3, 4, 5] : [7, 8, 9, 10, 11, 12];
    const theirPits = p === 0 ? [12, 11, 10, 9, 8, 7] : [5, 4, 3, 2, 1, 0];
    const myStore = p === 0 ? 6 : 13;
    const theirStore = p === 0 ? 13 : 6;
    const name = (s) => room.seats[s]?.name || `Player ${s + 1}`;
    // On narrow screens the board is turned a quarter clockwise: their store on top, yours at the
    // bottom, your pits down the left and theirs up the right (still sown anticlockwise).
    const vertical = el.clientWidth > 0 && el.clientWidth < 520;
    boardEl.classList.toggle('vertical', vertical);
    const middle = vertical
      ? h('div', { class: 'mc-cols' }, myPits.flatMap((mine, k) => [pitButton(mine, pits, hi), pitButton(theirPits[k], pits, hi)]))
      : h('div', { class: 'mc-rows' }, h('div', { class: 'mc-row top' }, theirPits.map((i) => pitButton(i, pits, hi))), h('div', { class: 'mc-row bottom' }, myPits.map((i) => pitButton(i, pits, hi))));
    fill(boardEl, storeEl(theirStore, pits, hi, name(1 - p)), middle, storeEl(myStore, pits, hi, name(p)));
  }

  function sowFrom(i) {
    if (!myTurn()) return;
    ctx.act({ type: 'sow', pit: i }).catch(() => {});
  }

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  async function animate(prev, last, final) {
    orient = last.player;
    const pits = prev.slice();
    const none = new Set();
    pits[last.pit] = 0;
    draw(pits, { hot: new Set([last.pit]), cap: none });
    for (const i of last.path) {
      await wait(STEP_MS);
      pits[i]++;
      draw(pits, { hot: new Set([i]), cap: none });
      ctx.play('sow', 30);
    }
    if (last.capture) {
      await wait(260);
      draw(pits, { hot: none, cap: new Set([last.capture.pit, last.capture.from]) });
      ctx.play('capture');
      await wait(420);
    }
    if (last.swept) await wait(300);
    draw(final);
  }

  async function pump() {
    if (animating) return;
    animating = true;
    while (queue.length) {
      const { prev, last, final } = queue.shift();
      try {
        await animate(prev, last, final);
      } catch {
        /* view changed underneath us */
      }
      shown = final;
      explain(last);
    }
    animating = false;
    orient = view.turn;
    draw(view.pits);
    renderNote();
  }

  function explain(last) {
    const who = room.seats[last.player]?.name || 'Someone';
    const mine = seat !== null && last.player === seat && !ctx.isLocal();
    if (last.capture) ctx.toast(`${mine ? 'You' : who} captured ${last.capture.count} seeds!`, 'good');
    else if (last.extra) ctx.toast(`${mine ? 'You' : who} landed in the store: another turn!`);
  }

  function renderNote() {
    if (!view) return;
    const total = view.seeds * 12;
    fill(note, h('span', { class: 'muted small' }, `${total} seeds · ${view.moves} move${view.moves === 1 ? '' : 's'} played`));
  }

  // Redraw when the layout crosses between wide and narrow.
  let wasVertical = null;
  const ro = typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver(() => {
        const v = el.clientWidth > 0 && el.clientWidth < 520;
        if (v !== wasVertical && view && !animating) draw(view.pits);
        wasVertical = v;
      })
    : null;
  ro?.observe(el);

  return {
    el,
    destroy() {
      ro?.disconnect();
    },
    update(r, v, s) {
      room = r;
      view = v;
      seat = s;
      if (seenMoves !== null && v.moves > seenMoves && v.last && shown) {
        queue.push({ prev: shown, last: v.last, final: v.pits.slice() });
        shown = v.pits.slice();
        seenMoves = v.moves;
        pump();
        return;
      }
      seenMoves = v.moves;
      shown = v.pits.slice();
      if (!animating) {
        orient = v.turn;
        draw(v.pits);
        renderNote();
      }
    },
    status(r, v, s) {
      if (r.phase !== 'playing' || !v) return null;
      if (ctx.isLocal()) return `${r.seats[v.turn].name}: pick one of your pits`;
      if (s !== null && v.turn === s) return 'Your turn: pick one of your glowing pits';
      return null;
    },
  };
}
