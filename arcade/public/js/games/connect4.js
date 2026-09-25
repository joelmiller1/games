// Connect 4 board UI with falling discs, hover preview and keyboard support.
import { h } from '../ui.js';

const COLS = 7;
const ROWS = 6;

export function create(ctx) {
  let room = null;
  let view = null;
  let seat = null;
  let prev = null;
  let hover = 3;
  const discs = new Map(); // "c,r" -> element

  const grid = h('div', { class: 'c4-grid', tabindex: 0, 'aria-label': 'Connect 4 board. Use arrow keys and Enter to drop a disc.' });
  const ghost = h('div', { class: 'c4-ghost c4-disc' });
  const boardEl = h('div', { class: 'c4' }, ghost, grid);
  const el = h('div', { style: { display: 'grid', justifyItems: 'center', padding: '4px 0 8px' } }, boardEl);

  for (let r = ROWS - 1; r >= 0; r--) for (let c = 0; c < COLS; c++) grid.append(h('div', { class: 'c4-hole' }));
  const cols = [];
  for (let c = 0; c < COLS; c++) {
    const col = h('div', {
      class: 'c4-col',
      style: { left: `calc(var(--cell) * ${c})` },
      onClick: () => drop(c),
      onPointerenter: () => setHover(c),
    });
    cols.push(col);
    grid.append(col);
  }
  grid.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') setHover(Math.max(0, hover - 1));
    else if (e.key === 'ArrowRight') setHover(Math.min(COLS - 1, hover + 1));
    else if (e.key === 'Enter' || e.key === ' ') drop(hover);
    else return;
    e.preventDefault();
  });

  const myTurn = () => room && room.phase === 'playing' && seat !== null && view && view.turn === seat && room.actors.includes(seat);

  function setHover(c) {
    hover = c;
    ghost.style.left = `calc(var(--cell) * ${c})`;
  }

  function drop(c) {
    if (!myTurn() || view.cols[c].length >= ROWS) return;
    ctx.act({ type: 'drop', col: c }).catch(() => {});
  }

  function addDisc(c, r, p, animate) {
    const d = h('div', { class: `c4-disc p${p}` });
    d.style.left = `calc(var(--cell) * ${c})`;
    d.style.top = `calc(var(--cell) * ${ROWS - 1 - r})`;
    grid.insertBefore(d, grid.firstChild);
    if (animate) {
      const rowsToFall = ROWS - r + 0.4;
      d.style.setProperty('--fall', `${0.12 + rowsToFall * 0.055}s`);
      d.style.transform = `translateY(calc(var(--cell) * ${-rowsToFall}))`;
      d.getBoundingClientRect();
      d.classList.add('falling');
      requestAnimationFrame(() => (d.style.transform = 'translateY(0)'));
    }
    discs.set(`${c},${r}`, d);
  }

  return {
    el,
    update(r, v, s) {
      room = r;
      view = v;
      seat = s;
      // Rebuild if the board shrank (new game), else add the new discs.
      const total = v.cols.reduce((a, col) => a + col.length, 0);
      const prevTotal = prev ? prev.reduce((a, col) => a + col.length, 0) : -1;
      if (!prev || total < prevTotal) {
        for (const d of discs.values()) d.remove();
        discs.clear();
        v.cols.forEach((col, c) => col.forEach((p, row) => addDisc(c, row, p, false)));
      } else {
        v.cols.forEach((col, c) =>
          col.forEach((p, row) => {
            if (!discs.has(`${c},${row}`)) {
              addDisc(c, row, p, true);
              ctx.play('drop');
            }
          }),
        );
      }
      prev = v.cols.map((col) => col.slice());
      for (const d of discs.values()) d.classList.remove('win');
      if (v.line) for (const [c, row] of v.line) discs.get(`${c},${row}`)?.classList.add('win');
      const mine = myTurn();
      ghost.className = `c4-ghost c4-disc p${mine ? s : v.turn}`;
      ghost.style.visibility = mine ? 'visible' : 'hidden';
      setHover(hover);
      cols.forEach((col, c) => col.classList.toggle('disabled', !mine || v.cols[c].length >= ROWS));
    },
    status(r, v, s) {
      if (r.phase !== 'playing') return null;
      if (ctx.isLocal()) return `${r.seats[v.turn].name} (${v.turn === 0 ? 'Red' : 'Yellow'}) to drop`;
      if (s !== null && v.turn === s) return `Your turn: drop a ${s === 0 ? 'red' : 'yellow'} disc`;
      return null;
    },
  };
}
