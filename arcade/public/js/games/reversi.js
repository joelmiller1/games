// Reversi board UI: legal-move hints, a pop for the new disc and a flip cascade for captured ones.
import { h, fill } from '../ui.js';
import { createBoard } from './board.js';

const FILES = 'abcdefgh';
const name = (sq) => FILES[sq & 7] + ((sq >> 3) + 1);

function disc(type) {
  return h('div', { class: `rv-disc ${type}` });
}

export function create(ctx) {
  let room = null;
  let view = null;
  let seat = null;
  let lastKey = null;

  const board = createBoard({
    className: 'rv-board',
    label: 'Reversi board',
    toRC: (sq) => ({ r: sq >> 3, c: sq & 7 }),
    fromRC: (r, c) => r * 8 + c,
    isDark: () => false,
    coords: { file: (c) => FILES[c], rank: (r) => String(r + 1) },
    onSquare: (sq) => {
      if (!myTurn() || !view.legal.includes(sq)) return;
      ctx.act({ type: 'place', sq }).catch(() => {});
    },
  });
  const tally = h('div', { class: 'rv-tally' });
  const el = h('div', { class: 'board-row' }, h('div', { class: 'board-col' }, tally, board.el));
  const moveList = h('div', { class: 'move-list' });
  const side = h('div', h('div', { class: 'panel-title' }, 'Moves'), moveList);

  const myTurn = () => room && room.phase === 'playing' && seat !== null && view && view.turn === seat && room.actors.includes(seat);

  function renderTally() {
    const [b, w] = view.counts;
    const who = (i) => room.seats[i]?.name || (i ? 'White' : 'Black');
    fill(
      tally,
      h('span', { class: ['rv-count', view.turn === 0 && room.phase === 'playing' && 'turn'] }, disc('b'), h('strong', String(b)), h('span', { class: 'muted small' }, who(0))),
      h('span', { class: ['rv-count', view.turn === 1 && room.phase === 'playing' && 'turn'] }, h('span', { class: 'muted small' }, who(1)), h('strong', String(w)), disc('w')),
    );
  }

  function renderMoves() {
    const rows = [];
    let n = 0;
    view.moves.forEach((m) => {
      if (n % 2 === 0) rows.push(h('span', { class: 'n' }, `${n / 2 + 1}.`));
      rows.push(h('span', { class: ['mv', m === 'pass' && 'muted'] }, m));
      n++;
    });
    if (rows.length) rows[rows.length - 1].classList.add('cur');
    fill(moveList, ...(rows.length ? rows : [h('span', { class: 'muted small', style: { gridColumn: '1 / -1' } }, 'Black moves first')]));
  }

  function render() {
    const placement = new Map();
    view.board.forEach((v, sq) => v >= 0 && placement.set(sq, v === 0 ? 'b' : 'w'));
    board.setPieces(placement, disc, null);
    const key = view.last ? `${view.moves.length}:${view.last.sq}` : '';
    if (view.last && key !== lastKey && lastKey !== null) {
      board.pieceEl(view.last.sq)?.classList.add('rv-new');
      const { sq } = view.last;
      view.last.flips.forEach((f) => {
        const el2 = board.pieceEl(f);
        if (!el2) return;
        const d = Math.max(Math.abs((f >> 3) - (sq >> 3)), Math.abs((f & 7) - (sq & 7)));
        el2.style.setProperty('--delay', `${(d - 1) * 70}ms`);
        el2.classList.add('rv-flip');
      });
      ctx.play('place');
      if (view.last.flips.length) setTimeout(() => ctx.play('flip'), 120);
      if (view.passed !== null && view.passed !== undefined) {
        const who = room.seats[view.passed]?.name || 'A player';
        ctx.toast(`${who} has no legal move and passes`);
      }
    }
    lastKey = key;
    board.highlight({ last: view.last ? [view.last.sq] : [], targets: myTurn() ? view.legal : [] });
    renderTally();
    renderMoves();
  }

  return {
    el,
    side,
    update(r, v, s) {
      room = r;
      view = v;
      seat = s;
      render();
    },
    status(r, v, s) {
      if (r.phase !== 'playing' || !v) return null;
      const colour = v.turn === 0 ? 'Black' : 'White';
      if (ctx.isLocal()) return `${r.seats[v.turn].name} (${colour}) to move`;
      if (s !== null && v.turn === s) return `Your move: place a ${colour.toLowerCase()} disc on a dot`;
      return null;
    },
  };
}

export { name as squareName };
