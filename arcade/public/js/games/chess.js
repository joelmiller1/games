// Chess board UI: tap or drag to move, legal move dots, promotion picker, clocks, draw offers, move list.
import { h, modal, fmtClock, copyText, fill } from '../ui.js';
import { icon } from '../icons.js';
import { net } from '../net.js';
import { createBoard } from './board.js';
import { pieceSvg } from './chess-pieces.js';

const FILES = 'abcdefgh';
const sqName = (sq) => FILES[sq & 7] + (1 + (sq >> 3));
const sqIndex = (name) => FILES.indexOf(name[0]) + 8 * (Number(name[1]) - 1);
const VAL = { q: 9, r: 5, b: 3, n: 3, p: 1 };

export function create(ctx) {
  let room = null;
  let view = null;
  let seat = null;
  let sel = null;
  let manualFlip = null;
  let prevMoves = -1;
  let clockTimer = null;

  const board = createBoard({
    className: 'chess-board',
    label: 'Chess board',
    toRC: (sq) => ({ r: 7 - (sq >> 3), c: sq & 7 }),
    fromRC: (r, c) => (7 - r) * 8 + c,
    isDark: (r, c) => (r + c) % 2 === 1,
    coords: { file: (c) => FILES[c], rank: (r) => String(8 - r) },
    onSquare: clickSquare,
    canDrag: (sq) => movesFrom(sq).length > 0,
    onDragStart: (sq) => select(sq),
    onDrop: (from, to) => tryMove(from, to),
  });

  const topLine = h('div', { class: 'clock-line' });
  const bottomLine = h('div', { class: 'clock-line' });
  const col = h('div', { class: 'board-col' }, topLine, board.el, bottomLine);
  const el = h('div', { class: 'board-row' }, col);
  const actions = h('div', { class: 'actions' });
  const moveList = h('div', { class: 'move-list' });
  const side = h('div', h('div', { class: 'panel-title' }, 'Moves', h('span', { class: 'spacer' }), h('button', { class: 'btn btn-sm btn-ghost', type: 'button', onClick: copyPgn }, icon('copy', 14), 'PGN')), moveList);

  function myTurn() {
    return room && room.phase === 'playing' && seat !== null && view && view.turn === seat && view.legal.length > 0;
  }

  function movesFrom(sq) {
    if (!myTurn()) return [];
    const name = sqName(sq);
    return view.legal.filter((m) => m.startsWith(name));
  }

  function select(sq) {
    sel = sq;
    renderHighlights();
  }

  function clickSquare(sq) {
    if (sel !== null && sel !== sq && tryMove(sel, sq)) return;
    if (movesFrom(sq).length) {
      ctx.play('click');
      select(sel === sq ? null : sq);
    } else if (sel !== null) select(null);
  }

  function tryMove(from, to) {
    const cand = movesFrom(from).filter((m) => m.slice(2, 4) === sqName(to));
    if (!cand.length) return false;
    const send = (promo) => {
      sel = null;
      // Optimistic: show the move right away.
      const placement = placementFromView();
      const piece = placement.get(from);
      placement.delete(from);
      placement.set(to, promo ? piece[0] + promo.toUpperCase() : piece);
      board.setPieces(placement, pieceSvg, { from, to });
      board.highlight({ last: [from, to] });
      ctx.act({ type: 'move', from: sqName(from), to: sqName(to), promo }).catch(() => render());
    };
    if (cand.length > 1) {
      promotionPicker(view.turn === 0 ? 'w' : 'b').then((p) => {
        if (p) send(p);
        else {
          select(null);
          render();
        }
      });
      return true;
    }
    send(cand[0][4]);
    return true;
  }

  async function promotionPicker(color) {
    let dialog;
    const buttons = ['q', 'r', 'b', 'n'].map((p) =>
      h('button', { type: 'button', 'aria-label': { q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' }[p], onClick: () => dialog.closest('.modal').closeWith(p) }, pieceSvg(color + p.toUpperCase())),
    );
    dialog = h('div', { class: 'promo-picker' }, buttons);
    return modal({ title: 'Promote to', body: dialog, actions: [] });
  }

  function placementFromView() {
    const m = new Map();
    view.board.forEach((p, i) => p && m.set(i, p));
    return m;
  }

  function renderHighlights() {
    const targets = sel !== null ? movesFrom(sel).map((m) => sqIndex(m.slice(2, 4))) : [];
    const occupied = new Set(view.board.map((p, i) => (p ? i : -1)));
    board.highlight({
      last: view.last ? [sqIndex(view.last.from), sqIndex(view.last.to)] : [],
      sel,
      targets,
      captures: targets.filter((t) => occupied.has(t)),
      check: view.check ? sqIndex(view.check) : null,
    });
  }

  function capturedRow(color) {
    // Pieces captured BY `color`.
    const list = view.captured[color];
    const other = color === 'w' ? 'b' : 'w';
    const adv = color === 'w' ? view.material : -view.material;
    return h('div', { class: 'captured' }, list.map((t) => pieceSvg(other + t.toUpperCase())), adv > 0 ? h('span', { class: 'adv' }, `+${adv}`) : null);
  }

  function clockEl(player) {
    if (!view.clock) return null;
    return h('div', { class: 'clock', dataset: { player: String(player) } }, fmtClock(view.clock.remaining[player]));
  }

  function tickClocks() {
    if (!view?.clock) return;
    const running = view.clock.turnStart !== null && !view.result && room.phase === 'playing';
    for (const c of el.querySelectorAll('.clock')) {
      const p = Number(c.dataset.player);
      let ms = view.clock.remaining[p];
      const isRunning = running && view.turn === p;
      if (isRunning) ms -= net.serverNow() - view.clock.turnStart;
      c.textContent = fmtClock(ms);
      c.classList.toggle('running', isRunning);
      c.classList.toggle('low', isRunning && ms < 20000);
    }
  }

  function nameLine(player) {
    const s = room.seats[player];
    return h('div', { class: 'row', style: { gap: '8px' } }, h('strong', s ? s.name : player ? 'Black' : 'White'), capturedRow(player === 0 ? 'w' : 'b'));
  }

  function renderMoves() {
    const san = view.san;
    const rows = [];
    for (let i = 0; i < san.length; i += 2) {
      rows.push(
        h('span', { class: 'n' }, `${i / 2 + 1}.`),
        h('span', { class: ['mv', i === san.length - 1 && 'cur'] }, san[i]),
        h('span', { class: ['mv', i + 1 === san.length - 1 && 'cur'] }, san[i + 1] || ''),
      );
    }
    fill(moveList, ...(rows.length ? rows : [h('span', { class: 'muted small', style: { gridColumn: '1 / -1' } }, 'No moves yet')]));
    const parent = side.parentElement;
    if (parent) parent.scrollTop = parent.scrollHeight;
  }

  function copyPgn() {
    if (!view) return;
    const tags = [
      `[Event "Arcade game ${ctx.code}"]`,
      `[Date "${new Date().toISOString().slice(0, 10).replace(/-/g, '.')}"]`,
      `[White "${room.seats[0]?.name || 'White'}"]`,
      `[Black "${room.seats[1]?.name || 'Black'}"]`,
    ];
    let result = '*';
    if (view.result) result = view.result.winner === 0 ? '1-0' : view.result.winner === 1 ? '0-1' : '1/2-1/2';
    tags.push(`[Result "${result}"]`);
    const moves = [];
    view.san.forEach((m, i) => moves.push(i % 2 === 0 ? `${i / 2 + 1}. ${m}` : m));
    copyText(`${tags.join('\n')}\n\n${moves.join(' ')} ${result}\n`).then((ok) => ctx.toast(ok ? 'PGN copied' : 'Could not copy', ok ? 'good' : 'error'));
  }

  function renderActions() {
    fill(actions);
    actions.append(
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
    const opp = 1 - seat;
    if (view.drawOffer === opp) {
      actions.append(
        h('button', { class: 'btn btn-sm btn-primary', type: 'button', onClick: () => ctx.act({ type: 'acceptDraw' }) }, 'Accept draw'),
        h('button', { class: 'btn btn-sm', type: 'button', onClick: () => ctx.act({ type: 'declineDraw' }) }, 'Decline'),
      );
    } else if (view.drawOffer === seat) {
      actions.append(h('span', { class: 'chip' }, 'Draw offered'));
    } else if (view.canOfferDraw) {
      actions.append(h('button', { class: 'btn btn-sm btn-ghost', type: 'button', onClick: () => ctx.act({ type: 'offerDraw' }).then(() => ctx.toast('Draw offered')) }, icon('handshake', 16), 'Offer draw'));
    }
  }

  function render() {
    if (!view) return;
    const flip = manualFlip !== null ? manualFlip : seat === 1 && !ctx.isLocal();
    board.setFlipped(flip);
    const last = view.last ? { from: sqIndex(view.last.from), to: sqIndex(view.last.to) } : null;
    board.setPieces(placementFromView(), pieceSvg, last);
    renderHighlights();
    const top = flip ? 0 : 1;
    const bottom = 1 - top;
    fill(topLine, nameLine(top), clockEl(top));
    fill(bottomLine, nameLine(bottom), clockEl(bottom));
    renderMoves();
    renderActions();
    tickClocks();
  }

  clockTimer = setInterval(tickClocks, 100);

  return {
    el,
    side,
    actions,
    update(r, v, s) {
      room = r;
      view = v;
      seat = s;
      if (sel !== null && !movesFrom(sel).length) sel = null;
      if (prevMoves >= 0 && v.san.length > prevMoves) {
        const m = v.san[v.san.length - 1];
        ctx.play(m.includes('+') || m.includes('#') ? 'check' : m.includes('x') ? 'capture' : 'move');
      }
      prevMoves = v.san.length;
      render();
    },
    status(r, v, s) {
      if (r.phase !== 'playing' || !v) return null;
      if (s !== null && v.drawOffer === 1 - s && !ctx.isLocal()) return `${r.seats[1 - s].name} offers a draw`;
      const mine = s !== null && v.turn === s && r.actors.includes(s);
      if (ctx.isLocal()) return `${v.turn === 0 ? 'White' : 'Black'} to move${v.check ? ' (check!)' : ''}`;
      if (mine && v.check) return 'Check! Your move';
      if (mine) return 'Your move';
      return null;
    },
    destroy() {
      clearInterval(clockTimer);
    },
  };
}

export { VAL };
