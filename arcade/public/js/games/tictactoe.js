// Tic-tac-toe board UI.
import { h, s, fill } from '../ui.js';

function mark(p, fresh) {
  const cls = `mark ${p === 0 ? 'x' : 'o'} ${fresh ? 'fresh' : ''}`;
  const inner =
    p === 0
      ? [s('path', { class: cls, d: 'M20 20 L80 80' }), s('path', { class: cls, d: 'M80 20 L20 80', style: { animationDelay: fresh ? '0.12s' : '0s' } })]
      : [s('circle', { class: cls, cx: 50, cy: 50, r: 32 })];
  return s('svg', { viewBox: '0 0 100 100', 'aria-hidden': 'true' }, inner);
}

function ghost(p) {
  const g = mark(p, false);
  g.classList.add('ghost');
  return g;
}

export function create(ctx) {
  let prev = null;
  let ghostFor = null;
  const cells = [];
  const grid = h('div', { class: 'ttt', role: 'grid', 'aria-label': 'Tic-tac-toe board' });
  for (let i = 0; i < 9; i++) {
    const b = h('button', {
      class: 'ttt-cell',
      type: 'button',
      'aria-label': `Row ${Math.floor(i / 3) + 1}, column ${(i % 3) + 1}`,
      onClick: () => ctx.act({ type: 'place', cell: i }).catch(() => {}),
    });
    cells.push(b);
    grid.append(b);
  }
  const el = h('div', { style: { display: 'grid', justifyItems: 'center', padding: '8px 0' } }, grid);

  return {
    el,
    update(room, view, seat) {
      const myTurn = room.phase === 'playing' && seat !== null && room.actors.includes(seat) && view.turn === seat;
      const g = myTurn ? view.turn : null;
      let placed = false;
      for (let i = 0; i < 9; i++) {
        const v = view.board[i];
        const cell = cells[i];
        const was = prev ? prev[i] : undefined;
        if (v !== was || (v === null && ghostFor !== g)) {
          if (v !== null) {
            fill(cell, mark(v, prev !== null));
            if (prev !== null) placed = true;
          } else fill(cell, g !== null ? ghost(g) : '');
        }
        cell.disabled = !myTurn || v !== null;
        cell.classList.toggle('win', !!view.line && view.line.includes(i));
        cell.setAttribute('aria-label', `Row ${Math.floor(i / 3) + 1}, column ${(i % 3) + 1}: ${v === null ? 'empty' : v === 0 ? 'X' : 'O'}`);
      }
      if (placed) ctx.play('place');
      ghostFor = g;
      prev = view.board.slice();
    },
    status(room, view, seat) {
      if (room.phase !== 'playing') return null;
      if (ctx.isLocal()) return `${room.seats[view.turn].name} (${view.turn === 0 ? 'X' : 'O'}) to play`;
      if (seat !== null && view.turn === seat) return `Your turn: place an ${seat === 0 ? 'X' : 'O'}`;
      return null;
    },
  };
}
