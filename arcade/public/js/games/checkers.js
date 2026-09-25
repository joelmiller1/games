// Checkers board UI: tap a piece then its landing squares (multi-jumps step by step), or drag.
import { h, s, fill } from '../ui.js';
import { icon } from '../icons.js';
import { createBoard } from './board.js';

const squareNumber = (sq) => 32 - ((sq >> 3) * 4 + ((sq & 7) >> 1));
const isDark = (r, c) => (r + c) % 2 === 1;
const owner = (v) => (v - 1) >> 1;
const isKing = (v) => v === 2 || v === 4;

function crown() {
  return s(
    'svg',
    { viewBox: '0 0 24 24', 'aria-hidden': 'true' },
    s('path', { d: 'M3 18h18l-1.5-9-4.5 4-3-7-3 7-4.5-4z', fill: '#facc15', stroke: '#92400e', 'stroke-width': 1.4, 'stroke-linejoin': 'round' }),
  );
}

function renderPiece(type) {
  const v = Number(type);
  return h('div', { class: `ck-piece p${owner(v)}` }, isKing(v) ? crown() : null);
}

export function create(ctx) {
  let room = null;
  let view = null;
  let seat = null;
  let path = [];
  let manualFlip = null;
  let prevCount = -1;

  const board = createBoard({
    className: 'ck-board',
    label: 'Checkers board',
    toRC: (sq) => ({ r: sq >> 3, c: sq & 7 }),
    fromRC: (r, c) => r * 8 + c,
    isDark,
    squareLabel: (sq) => (isDark(sq >> 3, sq & 7) ? String(squareNumber(sq)) : null),
    onSquare: click,
    canDrag: (sq) => movesFrom(sq).length > 0,
    onDragStart: (sq) => {
      path = [sq];
      renderHighlights();
    },
    onDrop: (from, to) => {
      const ends = movesFrom(from).filter((m) => m.path[m.path.length - 1] === to);
      if (ends.length === 1) {
        send(ends[0]);
        return true;
      }
      if (ends.length > 1) {
        path = [from];
        renderHighlights();
        ctx.toast('Several jumps end there: tap the squares one by one');
      }
      return false;
    },
  });
  const el = h('div', { class: 'board-row' }, h('div', { class: 'board-col' }, board.el));
  const actions = h('div', { class: 'actions' });
  const moveList = h('div', { class: 'move-list' });
  const side = h('div', h('div', { class: 'panel-title' }, 'Moves'), moveList);

  const myTurn = () => room && room.phase === 'playing' && seat !== null && view && view.turn === seat && view.legal.length > 0;
  const movesFrom = (sq) => (myTurn() ? view.legal.filter((m) => m.path[0] === sq) : []);
  const startsWith = (m, p) => p.every((x, i) => m.path[i] === x);
  const candidates = () => (myTurn() && path.length ? view.legal.filter((m) => startsWith(m, path)) : []);

  function click(sq) {
    if (path.length) {
      const cands = candidates();
      const exact = cands.find((m) => m.path.length === path.length + 1 && m.path[path.length] === sq);
      const next = cands.filter((m) => m.path[path.length] === sq);
      if (exact && next.length === 1) return send(exact);
      if (next.length) {
        path = [...path, sq];
        const done = candidates().find((m) => m.path.length === path.length);
        if (done) return send(done);
        ctx.play('click');
        return renderHighlights();
      }
      // Tapping a final destination directly also works when it is unambiguous.
      const ends = cands.filter((m) => m.path[m.path.length - 1] === sq);
      if (ends.length === 1) return send(ends[0]);
    }
    if (movesFrom(sq).length) {
      path = path[0] === sq ? [] : [sq];
      ctx.play('click');
    } else path = [];
    renderHighlights();
  }

  function send(move) {
    path = [];
    // Optimistic update.
    const b = view.board.slice();
    const from = move.path[0];
    const to = move.path[move.path.length - 1];
    const v = b[from];
    b[from] = 0;
    for (const c of move.captures) b[c] = 0;
    const kingRow = owner(v) === 0 ? 0 : 7;
    b[to] = !isKing(v) && to >> 3 === kingRow ? v + 1 : v;
    board.setPieces(placement(b), renderPiece, { from, to });
    board.highlight({ last: move.path });
    board.markPieces('movable', []);
    ctx.act({ type: 'move', path: move.path }).catch(() => render());
  }

  function placement(b) {
    const m = new Map();
    b.forEach((v, i) => v && m.set(i, String(v)));
    return m;
  }

  function renderHighlights() {
    const cands = candidates();
    const targets = [...new Set(cands.map((m) => m.path[path.length]).filter((x) => x !== undefined))];
    board.highlight({ last: view.last ? view.last.path : [], sel: path.length ? path[path.length - 1] : null, targets });
    board.markPieces('movable', myTurn() && !path.length ? [...new Set(view.legal.map((m) => m.path[0]))] : []);
  }

  function renderMoves() {
    const rows = [];
    view.moves.forEach((m, i) => {
      if (i % 2 === 0) rows.push(h('span', { class: 'n' }, `${i / 2 + 1}.`));
      rows.push(h('span', { class: ['mv', i === view.moves.length - 1 && 'cur'] }, m));
    });
    fill(moveList, ...(rows.length ? rows : [h('span', { class: 'muted small', style: { gridColumn: '1 / -1' } }, 'No moves yet')]));
  }

  function renderActions() {
    fill(actions, 
      h(
        'button',
        {
          class: 'btn btn-sm btn-ghost',
          type: 'button',
          title: 'Flip board',
          onClick: () => {
            manualFlip = !board.isFlipped();
            render();
          },
        },
        icon('flip', 16),
      ),
    );
    if (room.phase !== 'playing' || seat === null || ctx.isLocal()) return;
    if (view.drawOffer === 1 - seat) {
      actions.append(
        h('button', { class: 'btn btn-sm btn-primary', type: 'button', onClick: () => ctx.act({ type: 'acceptDraw' }) }, 'Accept draw'),
        h('button', { class: 'btn btn-sm', type: 'button', onClick: () => ctx.act({ type: 'declineDraw' }) }, 'Decline'),
      );
    } else if (view.drawOffer === seat) actions.append(h('span', { class: 'chip' }, 'Draw offered'));
    else if (view.canOfferDraw) actions.append(h('button', { class: 'btn btn-sm btn-ghost', type: 'button', onClick: () => ctx.act({ type: 'offerDraw' }).then(() => ctx.toast('Draw offered')) }, icon('handshake', 16), 'Offer draw'));
  }

  function render() {
    if (!view) return;
    board.setFlipped(manualFlip !== null ? manualFlip : seat === 1 && !ctx.isLocal());
    const last = view.last ? { from: view.last.path[0], to: view.last.path[view.last.path.length - 1] } : null;
    board.setPieces(placement(view.board), renderPiece, last);
    renderHighlights();
    renderMoves();
    renderActions();
  }

  return {
    el,
    side,
    actions,
    update(r, v, s) {
      room = r;
      view = v;
      seat = s;
      if (path.length && !candidates().length) path = [];
      if (prevCount >= 0 && v.moves.length > prevCount) ctx.play(v.last?.captures.length ? 'capture' : 'move');
      prevCount = v.moves.length;
      render();
    },
    status(r, v, s) {
      if (r.phase !== 'playing' || !v) return null;
      if (s !== null && v.drawOffer === 1 - s && !ctx.isLocal()) return `${r.seats[1 - s].name} offers a draw`;
      const mine = s !== null && v.turn === s && v.legal.length > 0;
      const mustJump = mine && v.legal[0].captures.length > 0 && v.forcedCapture;
      if (ctx.isLocal()) return `${r.seats[v.turn].name} (${v.turn === 0 ? 'Red' : 'White'}) to move${mustJump ? ': you must jump' : ''}`;
      if (mustJump) return 'Your move: you must jump!';
      if (mine) return 'Your move';
      return null;
    },
  };
}
