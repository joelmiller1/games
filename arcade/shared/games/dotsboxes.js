// Dots and Boxes for 2-4 players on an n×n grid of boxes.
// Lines: horizontal lines first (row r = 0..n, col c = 0..n-1), then vertical (row 0..n-1, col 0..n).
import { check, clone, isInt } from '../lib/game.js';
import { pick, shuffle } from '../lib/rng.js';

const geoCache = new Map();

/** Line/box incidence for a board size, cached. */
export function geometry(n) {
  if (geoCache.has(n)) return geoCache.get(n);
  const H = (n + 1) * n;
  const L = H + n * (n + 1);
  const hIdx = (r, c) => r * n + c;
  const vIdx = (r, c) => H + r * (n + 1) + c;
  const boxLines = [];
  const lineBoxes = Array.from({ length: L }, () => []);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const b = r * n + c;
      const ls = [hIdx(r, c), hIdx(r + 1, c), vIdx(r, c), vIdx(r, c + 1)];
      boxLines.push(ls);
      for (const l of ls) lineBoxes[l].push(b);
    }
  }
  const g = { n, H, L, boxLines, lineBoxes, hIdx, vIdx };
  geoCache.set(n, g);
  return g;
}

export function setup({ players = 2, options } = {}) {
  const n = [3, 4, 6].includes(Number(options?.size)) ? Number(options.size) : 4;
  const g = geometry(n);
  return {
    n,
    players,
    lines: Array(g.L).fill(-1),
    boxes: Array(n * n).fill(-1),
    scores: Array(players).fill(0),
    out: Array(players).fill(false),
    turn: 0,
    drawn: 0,
    last: null,
    winners: null,
    endReason: null,
  };
}

const over = (s) => s.winners !== null;

export function actors(s) {
  return over(s) ? [] : [s.turn];
}

function nextActive(s, from) {
  for (let k = 1; k <= s.players; k++) {
    const p = (from + k) % s.players;
    if (!s.out[p]) return p;
  }
  return from;
}

function finish(s, reason) {
  const active = s.scores.map((sc, i) => ({ sc, i })).filter(({ i }) => !s.out[i]);
  const best = Math.max(...active.map((x) => x.sc));
  s.winners = active.filter((x) => x.sc === best).map((x) => x.i);
  s.endReason = reason || (s.players === 2 ? `${Math.max(...s.scores)}–${Math.min(...s.scores)}` : `${best} boxes`);
}

export function act(state, player, action) {
  check(!over(state), 'The game is over');
  check(player === state.turn, 'It is not your turn');
  check(action && action.type === 'line', 'Unknown action');
  const g = geometry(state.n);
  check(isInt(action.line, 0, g.L - 1), 'Invalid line');
  check(state.lines[action.line] === -1, 'That line is already drawn');
  const s = clone(state);
  s.lines[action.line] = player;
  s.drawn++;
  const closed = [];
  for (const b of g.lineBoxes[action.line]) {
    if (g.boxLines[b].every((l) => s.lines[l] !== -1)) {
      s.boxes[b] = player;
      s.scores[player]++;
      closed.push(b);
    }
  }
  s.last = { line: action.line, player, boxes: closed };
  if (s.drawn === g.L) finish(s);
  else if (!closed.length) s.turn = nextActive(s, player);
  return s;
}

export function forfeit(state, player, reason) {
  const s = clone(state);
  if (over(s)) return s;
  s.out[player] = true;
  if (s.out.filter((x) => !x).length <= 1) finish(s, reason);
  else if (s.turn === player) s.turn = nextActive(s, player);
  return s;
}

export function outcome(s) {
  if (!over(s)) return null;
  return { winners: s.winners, draw: s.winners.length > 1, reason: s.endReason, scores: s.scores };
}

export function view(s) {
  return { n: s.n, lines: s.lines, boxes: s.boxes, scores: s.scores, out: s.out, turn: s.turn, last: s.last, drawn: s.drawn, winners: s.winners };
}

// ---------------------------------------------------------------------------
// Computer player.

function sidesDrawn(lines, g, b) {
  let k = 0;
  for (const l of g.boxLines[b]) if (lines[l] !== -1) k++;
  return k;
}

/** Lines that close a box right now. */
function capturing(lines, g) {
  const out = [];
  for (let l = 0; l < g.L; l++) {
    if (lines[l] !== -1) continue;
    if (g.lineBoxes[l].some((b) => sidesDrawn(lines, g, b) === 3)) out.push(l);
  }
  return out;
}

/** Lines that do not hand a box to the next player (no neighbouring box gets its third side). */
function safeLines(lines, g) {
  const out = [];
  for (let l = 0; l < g.L; l++) {
    if (lines[l] !== -1) continue;
    if (g.lineBoxes[l].every((b) => sidesDrawn(lines, g, b) < 2)) out.push(l);
  }
  return out;
}

/** How many boxes the next player can grab in a row after `line` is drawn (greedy). */
function giveaway(lines, g, line) {
  const ls = lines.slice();
  ls[line] = 0;
  let taken = 0;
  for (;;) {
    let found = -1;
    for (let l = 0; l < g.L && found < 0; l++) {
      if (ls[l] !== -1) continue;
      for (const b of g.lineBoxes[l]) if (sidesDrawn(ls, g, b) === 3) found = l;
    }
    if (found < 0) return taken;
    ls[found] = 1;
    for (const b of g.lineBoxes[found]) if (sidesDrawn(ls, g, b) === 4) taken++;
  }
}

/** Components of undecided boxes joined by undrawn shared lines: [{ boxes, loop }]. */
function components(lines, boxes, g) {
  const seen = new Set();
  const out = [];
  for (let b0 = 0; b0 < boxes.length; b0++) {
    if (boxes[b0] !== -1 || seen.has(b0)) continue;
    const comp = [];
    const stack = [b0];
    seen.add(b0);
    let ground = false;
    let simple = true;
    while (stack.length) {
      const b = stack.pop();
      comp.push(b);
      let open = 0;
      for (const l of g.boxLines[b]) {
        if (lines[l] !== -1) continue;
        open++;
        const other = g.lineBoxes[l].find((x) => x !== b);
        if (other === undefined) ground = true;
        else if (!seen.has(other) && boxes[other] === -1) {
          seen.add(other);
          stack.push(other);
        }
      }
      if (open !== 2) simple = false;
    }
    out.push({ boxes: comp, size: comp.length, loop: !ground && simple && comp.length >= 4 });
  }
  return out;
}

/**
 * Value of a "loony endgame" (no safe lines left) for the player who has to open a chain or loop,
 * assuming both sides play the long-chain strategy: the opponent either takes everything and
 * moves next, or keeps control by declining the last two boxes of a chain (four of a loop).
 */
function endgameValue(comps, memo = new Map()) {
  if (!comps.length) return 0;
  const key = comps.map((c) => (c.loop ? 'L' : 'C') + c.size).sort().join(',');
  const hit = memo.get(key);
  if (hit !== undefined) return hit;
  let best = -Infinity;
  const tried = new Set();
  for (let i = 0; i < comps.length; i++) {
    const c = comps[i];
    const id = (c.loop ? 'L' : 'C') + c.size;
    if (tried.has(id)) continue;
    tried.add(id);
    const v = endgameValue(comps.filter((_, j) => j !== i), memo);
    let mover = -(c.size + v);
    if (c.loop && c.size >= 4) mover = Math.min(mover, 8 - c.size + v);
    else if (!c.loop && c.size >= 3) mover = Math.min(mover, 4 - c.size + v);
    if (mover > best) best = mover;
  }
  memo.set(key, best);
  return best;
}

/** Endgame value of a position, or null while safe lines remain. */
function loonyValue(lines, boxes, g) {
  if (safeLines(lines, g).length) return null;
  return endgameValue(components(lines, boxes, g));
}

function openLines(lines, g, b) {
  return g.boxLines[b].filter((l) => lines[l] === -1);
}

/**
 * While capturing: if the boxes still to take end in a domino (two boxes of a chain) or a
 * four-box remainder of an opened loop, decide whether to decline them and keep control.
 * Returns { take, decline } lines, or null when there is no such decision to make.
 */
function controlDecision(s, g, caps) {
  const { lines, boxes } = s;
  const three = (b) => boxes[b] === -1 && sidesDrawn(lines, g, b) === 3;
  const two = (b) => boxes[b] === -1 && sidesDrawn(lines, g, b) === 2;
  for (const m of caps) {
    const bs = g.lineBoxes[m];
    if (bs.length !== 2) continue;
    const A = three(bs[0]) ? bs[0] : bs[1];
    const B = A === bs[0] ? bs[1] : bs[0];
    if (!three(A) || !two(B)) continue;
    const x = openLines(lines, g, B).find((l) => l !== m);
    if (x === undefined) continue;
    const C = g.lineBoxes[x].find((b) => b !== B);
    // Chain end: B's other side leads to the border or to a box that stays out of reach.
    if (C === undefined || (boxes[C] === -1 && sidesDrawn(lines, g, C) <= 1) || boxes[C] !== -1) {
      const ls = lines.slice();
      ls[m] = 0;
      ls[x] = 0;
      const bx = boxes.slice();
      bx[A] = 0;
      bx[B] = 0;
      const v = loonyValue(ls, bx, g);
      if (v === null) return null;
      return v < -2 ? { decline: x } : { take: m };
    }
    // Loop remainder: A-B-C-D with D also capturable through C's other side.
    if (two(C)) {
      const y = openLines(lines, g, C).find((l) => l !== x);
      const D = y === undefined ? undefined : g.lineBoxes[y].find((b) => b !== C);
      if (D !== undefined && D !== A && three(D) && openLines(lines, g, D)[0] === y) {
        const ls = lines.slice();
        for (const l of [m, x, y]) ls[l] = 0;
        const bx = boxes.slice();
        for (const b of [A, B, C, D]) bx[b] = 0;
        const v = loonyValue(ls, bx, g);
        if (v === null) return null;
        return v < -4 ? { decline: x } : { take: m };
      }
    }
  }
  return null;
}

/** The best chain or loop to open when every line gives something away (hard level). */
function bestSacrifice(s, g) {
  const comps = components(s.lines, s.boxes, g);
  if (comps.some((c) => c.boxes.some((b) => openLines(s.lines, g, b).length > 2))) return null; // not a simple endgame
  const memo = new Map();
  let best = null;
  let bestVal = -Infinity;
  comps.forEach((c, i) => {
    const v = endgameValue(comps.filter((_, j) => j !== i), memo);
    let mover = -(c.size + v);
    if (c.loop && c.size >= 4) mover = Math.min(mover, 8 - c.size + v);
    else if (!c.loop && c.size >= 3) mover = Math.min(mover, 4 - c.size + v);
    if (mover > bestVal) {
      bestVal = mover;
      best = c;
    }
  });
  if (!best) return null;
  if (!best.loop && best.size === 2) {
    // Hard-hearted handout: the line between the two boxes, so it cannot be declined.
    const [a, b] = best.boxes;
    const mid = g.boxLines[a].find((l) => s.lines[l] === -1 && g.lineBoxes[l].includes(b));
    if (mid !== undefined) return mid;
  }
  // Otherwise open it at an end (a box with a line to the border or its first box).
  for (const b of best.boxes) {
    const edge = openLines(s.lines, g, b).find((l) => g.lineBoxes[l].length === 1);
    if (edge !== undefined) return edge;
  }
  return openLines(s.lines, g, best.boxes[0])[0];
}

/** Late in the opening phase: search the remaining safe lines to end up in control. */
function safePhaseSearch(s, g, safe, deadline) {
  const memo = new Map();
  let nodes = 0;
  const lines = s.lines.slice();
  const search = (mask) => {
    const hit = memo.get(mask);
    if (hit !== undefined) return hit;
    if ((++nodes & 1023) === 0 && Date.now() > deadline) throw new Error('timeout');
    let best = -Infinity;
    let any = false;
    for (let i = 0; i < safe.length; i++) {
      const l = safe[i];
      if (mask & (1 << i)) continue;
      if (!g.lineBoxes[l].every((b) => sidesDrawn(lines, g, b) < 2)) continue;
      any = true;
      lines[l] = 0;
      const v = -search(mask | (1 << i));
      lines[l] = -1;
      if (v > best) best = v;
    }
    if (!any) best = endgameValue(components(lines, s.boxes, g));
    memo.set(mask, best);
    return best;
  };
  const results = safe.map((l, i) => {
    lines[l] = 0;
    const v = -search(1 << i);
    lines[l] = -1;
    return { line: l, value: v };
  });
  return results;
}

/**
 * Exact endgame for two players: value = best net boxes for the side to move from here.
 * Only used when few lines are left (2^k positions at most).
 */
function solveExact(lines, g, deadline) {
  const free = [];
  for (let l = 0; l < g.L; l++) if (lines[l] === -1) free.push(l);
  const k = free.length;
  const nb = g.boxLines.length;
  const sides = new Int8Array(nb);
  for (let b = 0; b < nb; b++) sides[b] = sidesDrawn(lines, g, b);
  const adj = free.map((l) => g.lineBoxes[l]);
  const memo = new Map();
  let nodes = 0;
  const search = (mask) => {
    if (mask === 0) return 0;
    const hit = memo.get(mask);
    if (hit !== undefined) return hit;
    if ((++nodes & 8191) === 0 && Date.now() > deadline) throw new Error('timeout');
    let best = -Infinity;
    for (let i = 0; i < k; i++) {
      const bit = 1 << i;
      if (!(mask & bit)) continue;
      let gain = 0;
      for (const b of adj[i]) if (++sides[b] === 4) gain++;
      const rest = search(mask & ~bit);
      for (const b of adj[i]) sides[b]--;
      const v = gain ? gain + rest : -rest;
      if (v > best) best = v;
    }
    memo.set(mask, best);
    return best;
  };
  const full = (1 << k) - 1;
  const results = [];
  for (let i = 0; i < k; i++) {
    const bit = 1 << i;
    let gain = 0;
    for (const b of adj[i]) if (++sides[b] === 4) gain++;
    const rest = search(full & ~bit);
    for (const b of adj[i]) sides[b]--;
    results.push({ line: free[i], value: gain ? gain + rest : -rest });
  }
  return results;
}

const EXACT_LINES = 16;
const SAFE_SEARCH_LINES = 14;

export function bot(s, p, level, ctx) {
  const rng = ctx.rng;
  const g = geometry(s.n);
  const draw = (line) => ({ type: 'line', line });
  const free = [];
  for (let l = 0; l < g.L; l++) if (s.lines[l] === -1) free.push(l);
  if (free.length === 1) return draw(free[0]);
  const caps = capturing(s.lines, g);
  const safe = safeLines(s.lines, g);

  if (level === 'easy') {
    if (caps.length && rng() < 0.75) return draw(pick(rng, caps));
    if (safe.length && rng() < 0.7) return draw(pick(rng, safe));
    return draw(pick(rng, free));
  }

  const twoPlayer = s.players - s.out.filter(Boolean).length === 2;
  if (level === 'hard' && twoPlayer && free.length <= EXACT_LINES) {
    try {
      const results = solveExact(s.lines, g, (ctx.deadline || Date.now() + 1500) + 500);
      const best = Math.max(...results.map((r) => r.value));
      return draw(pick(rng, results.filter((r) => r.value === best).map((r) => r.line)));
    } catch {
      /* fall back to the heuristics below */
    }
  }

  if (caps.length) {
    if (level === 'hard' && twoPlayer) {
      // Take boxes that are not part of a decision first, then decide about the last ones.
      const d = controlDecision(s, g, caps);
      if (d?.decline !== undefined) {
        const other = caps.filter((l) => !g.lineBoxes[l].some((b) => g.lineBoxes[d.decline].includes(b)) && l !== d.decline);
        const free2 = other.filter((l) => g.lineBoxes[l].every((b) => !g.boxLines[b].includes(d.decline)));
        if (free2.length) return draw(free2[0]);
        return draw(d.decline);
      }
      if (d?.take !== undefined) return draw(d.take);
    }
    return draw(pick(rng, caps));
  }
  if (safe.length) {
    if (level === 'hard' && twoPlayer && safe.length <= SAFE_SEARCH_LINES) {
      try {
        const results = safePhaseSearch(s, g, safe, (ctx.deadline || Date.now() + 1200) - 100);
        const best = Math.max(...results.map((r) => r.value));
        return draw(pick(rng, results.filter((r) => r.value === best).map((r) => r.line)));
      } catch {
        /* too many to search in time */
      }
    }
    return draw(pick(rng, safe));
  }

  if (level === 'hard' && twoPlayer) {
    const line = bestSacrifice(s, g);
    if (line !== null && line !== undefined) return draw(line);
  }
  // Every line gives something away: give as little as possible.
  let best = [];
  let bestScore = Infinity;
  for (const l of shuffle(rng, free)) {
    let score = giveaway(s.lines, g, l) * 10;
    // Hand over a two-box chain by its middle line so it cannot be declined.
    if (level === 'hard' && g.lineBoxes[l].length === 2 && g.lineBoxes[l].every((b) => sidesDrawn(s.lines, g, b) === 2)) score -= 1;
    if (score < bestScore) {
      bestScore = score;
      best = [l];
    } else if (score === bestScore) best.push(l);
  }
  return draw(pick(rng, best));
}
