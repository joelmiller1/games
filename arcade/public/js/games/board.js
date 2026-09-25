// Reusable 8x8 board with animated pieces, highlights, click and drag input (chess & checkers).
import { h, fill } from '../ui.js';

/**
 * opts.toRC(sq) -> { r, c } display coordinates (row 0 = top) for the unflipped board
 * opts.fromRC(r, c) -> sq
 * opts.isDark(r, c) -> boolean (square colour)
 * opts.coords -> { file(c), rank(r) } labels, optional
 * opts.onSquare(sq) click handler
 * opts.canDrag(sq) -> boolean; opts.onDrop(from, to) -> boolean (true if accepted)
 */
export function createBoard(opts) {
  const el = h('div', { class: `sq-board ${opts.className || ''}`, role: 'grid', 'aria-label': opts.label || 'Board' });
  const squares = new Map(); // sq -> element
  const pieces = new Map(); // sq -> { el, type }
  let flipped = false;
  let drag = null;

  const disp = (sq) => {
    const { r, c } = opts.toRC(sq);
    return flipped ? { r: 7 - r, c: 7 - c } : { r, c };
  };

  function buildSquares() {
    el.querySelectorAll('.sq').forEach((x) => x.remove());
    squares.clear();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const mr = flipped ? 7 - r : r;
        const mc = flipped ? 7 - c : c;
        const sq = opts.fromRC(mr, mc);
        const d = h('div', { class: ['sq', opts.isDark(mr, mc) && 'dark'], dataset: { sq: String(sq) }, role: 'gridcell' });
        if (opts.coords) {
          if (r === 7) d.append(h('span', { class: 'coord file' }, opts.coords.file(mc)));
          if (c === 0) d.append(h('span', { class: 'coord rank' }, opts.coords.rank(mr)));
        }
        const label = opts.squareLabel?.(sq);
        if (label) d.append(h('span', { class: 'coord rank' }, label));
        squares.set(sq, d);
        el.insertBefore(d, el.firstChild ? el.querySelector('.piece') : null);
      }
    }
  }

  function place(p, sq) {
    const { r, c } = disp(sq);
    p.el.style.transform = `translate(${c * 100}%, ${r * 100}%)`;
  }

  function squareAt(clientX, clientY) {
    const rect = el.getBoundingClientRect();
    const c = Math.floor(((clientX - rect.left) / rect.width) * 8);
    const r = Math.floor(((clientY - rect.top) / rect.height) * 8);
    if (r < 0 || r > 7 || c < 0 || c > 7) return null;
    return opts.fromRC(flipped ? 7 - r : r, flipped ? 7 - c : c);
  }

  /** placement: Map sq -> type string; render(type) -> element; hint: { from, to } of the last move */
  function setPieces(placement, render, hint) {
    const removed = [];
    const added = [];
    for (const [sq, p] of pieces) if (placement.get(sq) !== p.type) removed.push(sq);
    for (const [sq, type] of placement) if (pieces.get(sq)?.type !== type) added.push(sq);
    const moves = [];
    const taken = new Set();
    // The last move first (handles promotions where the type changes).
    if (hint && added.includes(hint.to) && removed.includes(hint.from)) {
      moves.push([hint.from, hint.to]);
      taken.add(hint.from);
    }
    for (const to of added) {
      if (moves.some((m) => m[1] === to)) continue;
      const type = placement.get(to);
      let best = null;
      let bestD = Infinity;
      for (const from of removed) {
        if (taken.has(from) || pieces.get(from).type !== type) continue;
        const a = disp(from);
        const b = disp(to);
        const d = Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
        if (d < bestD && d <= 3) {
          bestD = d;
          best = from;
        }
      }
      if (best !== null) {
        moves.push([best, to]);
        taken.add(best);
      }
    }
    const moving = moves.map(([from, to]) => {
      const p = pieces.get(from);
      pieces.delete(from);
      return { p, to };
    });
    for (const sq of removed) {
      if (taken.has(sq)) continue;
      const p = pieces.get(sq);
      pieces.delete(sq);
      if (!p) continue;
      p.el.classList.add('fading');
      setTimeout(() => p.el.remove(), 260);
    }
    for (const { p, to } of moving) {
      const old = pieces.get(to);
      if (old) {
        old.el.classList.add('fading');
        setTimeout(() => old.el.remove(), 260);
      }
      const type = placement.get(to);
      if (p.type !== type) {
        fill(p.el, render(type));
        p.type = type;
      }
      pieces.set(to, p);
      place(p, to);
    }
    for (const sq of added) {
      if (moves.some((m) => m[1] === sq)) continue;
      const type = placement.get(sq);
      const old = pieces.get(sq);
      if (old) old.el.remove();
      const p = { el: h('div', { class: 'piece' }, render(type)), type };
      pieces.set(sq, p);
      place(p, sq);
      el.append(p.el);
    }
    // Snap everything else back into place (e.g. after a cancelled drag).
    for (const [sq, p] of pieces) {
      p.el.classList.remove('dragging');
      place(p, sq);
    }
  }

  function markPieces(cls, list) {
    const set = new Set(list || []);
    for (const [sq, p] of pieces) p.el.classList.toggle(cls, set.has(sq));
  }

  function mark(cls, list) {
    el.querySelectorAll(`.sq.${cls}`).forEach((x) => x.classList.remove(cls));
    for (const sq of list || []) squares.get(sq)?.classList.add(cls);
  }

  function highlight({ last = [], sel = null, targets = [], captures = [], check = null } = {}) {
    mark('last', last);
    mark('sel', sel === null ? [] : [sel]);
    mark('target', targets);
    mark('capture', captures);
    mark('check', check === null ? [] : [check]);
  }

  function setFlipped(f) {
    if (f === flipped && squares.size) return;
    flipped = f;
    buildSquares();
    for (const [sq, p] of pieces) place(p, sq);
  }

  function pieceEl(sq) {
    return pieces.get(sq)?.el || null;
  }

  // ---- input ----
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const sq = squareAt(e.clientX, e.clientY);
    if (sq === null) return;
    const canDrag = opts.canDrag?.(sq) && pieces.has(sq);
    drag = { sq, x: e.clientX, y: e.clientY, moved: false, canDrag, id: e.pointerId };
    if (canDrag) el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', (e) => {
    if (!drag || !drag.canDrag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    if (!drag.moved) {
      drag.moved = true;
      opts.onDragStart?.(drag.sq);
    }
    const p = pieces.get(drag.sq);
    if (!p) return;
    const rect = el.getBoundingClientRect();
    const size = rect.width / 8;
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;
    p.el.classList.add('dragging');
    p.el.style.transform = `translate(${x}px, ${y}px)`;
  });
  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (d.canDrag && el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId);
    const p = pieces.get(d.sq);
    if (d.moved) {
      p?.el.classList.remove('dragging');
      const to = e.type === 'pointercancel' ? null : squareAt(e.clientX, e.clientY);
      const accepted = to !== null && to !== d.sq && opts.onDrop?.(d.sq, to);
      if (!accepted && p) place(p, d.sq);
      return;
    }
    if (e.type !== 'pointercancel') opts.onSquare?.(d.sq);
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);

  setFlipped(false);
  return { el, setPieces, highlight, setFlipped, pieceEl, markPieces, isFlipped: () => flipped };
}
