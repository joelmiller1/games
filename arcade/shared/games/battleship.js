// Battleship on a 10x10 grid. Cells are indexed r * 10 + c.
import { check, clone, isInt } from '../lib/game.js';
import { pick, shuffle } from '../lib/rng.js';

export const SIZE = 10;
export const FLEET = [
  { id: 'carrier', name: 'Carrier', len: 5 },
  { id: 'battleship', name: 'Battleship', len: 4 },
  { id: 'cruiser', name: 'Cruiser', len: 3 },
  { id: 'submarine', name: 'Submarine', len: 3 },
  { id: 'destroyer', name: 'Destroyer', len: 2 },
];
const MISS = 1;
const HIT = 2;

export function shipCells(r, c, dir, len) {
  const out = [];
  for (let k = 0; k < len; k++) {
    const rr = dir === 'v' ? r + k : r;
    const cc = dir === 'h' ? c + k : c;
    if (rr < 0 || rr >= SIZE || cc < 0 || cc >= SIZE) return null;
    out.push(rr * SIZE + cc);
  }
  return out;
}

/** Validate a proposed fleet layout. Returns the normalised ships or throws. */
export function validateFleet(ships) {
  check(Array.isArray(ships) && ships.length === FLEET.length, 'Place all five ships');
  const used = new Set();
  const out = [];
  for (const spec of FLEET) {
    const s = ships.find((x) => x && x.id === spec.id);
    check(s, `Missing ${spec.name}`);
    check(isInt(s.r, 0, SIZE - 1) && isInt(s.c, 0, SIZE - 1) && (s.dir === 'h' || s.dir === 'v'), `Invalid position for ${spec.name}`);
    const cells = shipCells(s.r, s.c, s.dir, spec.len);
    check(cells, `${spec.name} does not fit on the board`);
    for (const cell of cells) {
      check(!used.has(cell), 'Ships cannot overlap');
      used.add(cell);
    }
    out.push({ id: spec.id, r: s.r, c: s.c, dir: s.dir, cells });
  }
  return out;
}

export function randomFleet(rng, noTouch = false) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const blocked = new Set();
    const ships = [];
    let ok = true;
    for (const spec of FLEET) {
      let placed = false;
      for (let tries = 0; tries < 200 && !placed; tries++) {
        const dir = rng() < 0.5 ? 'h' : 'v';
        const r = Math.floor(rng() * SIZE);
        const c = Math.floor(rng() * SIZE);
        const cells = shipCells(r, c, dir, spec.len);
        if (!cells || cells.some((x) => blocked.has(x))) continue;
        ships.push({ id: spec.id, r, c, dir });
        for (const x of cells) {
          blocked.add(x);
          if (noTouch) for (const n of neighbours(x)) blocked.add(n);
        }
        placed = true;
      }
      if (!placed) {
        ok = false;
        break;
      }
    }
    if (ok) return ships;
  }
  return randomFleet(rng, false);
}

function neighbours(cell) {
  const r = Math.floor(cell / SIZE);
  const c = cell % SIZE;
  const out = [];
  if (r > 0) out.push(cell - SIZE);
  if (r < SIZE - 1) out.push(cell + SIZE);
  if (c > 0) out.push(cell - 1);
  if (c < SIZE - 1) out.push(cell + 1);
  return out;
}

export function setup({ options }) {
  return {
    mode: ['classic', 'streak', 'salvo'].includes(options?.mode) ? options.mode : 'classic',
    phase: 'placing',
    fleets: [null, null],
    shots: [new Array(SIZE * SIZE).fill(0), new Array(SIZE * SIZE).fill(0)], // shots received on each board
    sunk: [[], []],
    turn: 0,
    last: null,
    stats: [
      { shots: 0, hits: 0 },
      { shots: 0, hits: 0 },
    ],
    winner: null,
    endReason: null,
  };
}

const over = (s) => s.phase === 'over';

export function actors(s) {
  if (s.phase === 'placing') return [0, 1].filter((p) => !s.fleets[p]);
  if (s.phase === 'battle') return [s.turn];
  return [];
}

const afloat = (s, p) => FLEET.length - s.sunk[p].length;

export function shotsAllowed(s, p) {
  if (s.mode !== 'salvo') return 1;
  const open = s.shots[1 - p].filter((x) => x === 0).length;
  return Math.max(1, Math.min(afloat(s, p), open));
}

export function act(state, player, action) {
  check(!over(state), 'The game is over');
  check(action && typeof action.type === 'string', 'Unknown action');
  if (action.type === 'place') {
    check(state.phase === 'placing', 'Ships are already deployed');
    check(!state.fleets[player], 'Your fleet is already deployed');
    const fleet = validateFleet(action.ships);
    const s = clone(state);
    s.fleets[player] = fleet;
    if (s.fleets[0] && s.fleets[1]) s.phase = 'battle';
    return s;
  }
  if (action.type === 'unready') {
    check(state.phase === 'placing' && state.fleets[player], 'You cannot change your fleet now');
    const s = clone(state);
    s.fleets[player] = null;
    return s;
  }
  check(action.type === 'fire', 'Unknown action');
  check(state.phase === 'battle', 'The battle has not started yet');
  check(player === state.turn, 'It is not your turn');
  const cells = Array.isArray(action.cells) ? action.cells : [action.cell];
  const need = shotsAllowed(state, player);
  check(cells.length === need, need === 1 ? 'Choose one target' : `Choose ${need} targets`);
  const target = 1 - player;
  const seen = new Set();
  for (const cell of cells) {
    check(isInt(cell, 0, SIZE * SIZE - 1), 'Invalid target');
    check(state.shots[target][cell] === 0, 'You already fired there');
    check(!seen.has(cell), 'Duplicate target');
    seen.add(cell);
  }
  const s = clone(state);
  const results = [];
  let anyHit = false;
  for (const cell of cells) {
    const ship = s.fleets[target].find((sh) => sh.cells.includes(cell));
    s.stats[player].shots++;
    if (!ship) {
      s.shots[target][cell] = MISS;
      results.push({ cell, hit: false, sunk: null });
      continue;
    }
    anyHit = true;
    s.stats[player].hits++;
    s.shots[target][cell] = HIT;
    const sunkNow = ship.cells.every((x) => s.shots[target][x] === HIT);
    if (sunkNow) s.sunk[target].push(ship.id);
    results.push({ cell, hit: true, sunk: sunkNow ? ship.id : null });
  }
  s.last = { by: player, results };
  if (s.sunk[target].length === FLEET.length) {
    s.phase = 'over';
    s.winner = player;
    s.endReason = 'Fleet destroyed';
  } else if (!(s.mode === 'streak' && anyHit)) {
    s.turn = target;
  }
  return s;
}

export function forfeit(state, player, reason) {
  const s = clone(state);
  if (over(s)) return s;
  s.phase = 'over';
  s.winner = 1 - player;
  s.endReason = reason;
  return s;
}

export function outcome(s) {
  if (!over(s)) return null;
  return { winners: [s.winner], draw: false, reason: s.endReason };
}

export function view(s, player) {
  const reveal = over(s);
  const players = [0, 1].map((q) => {
    const fleet = s.fleets[q];
    const sunkShips = fleet ? fleet.filter((sh) => s.sunk[q].includes(sh.id)) : [];
    const own = player === q;
    return {
      ready: !!fleet,
      shots: s.shots[q],
      sunk: sunkShips.map((sh) => ({ id: sh.id, r: sh.r, c: sh.c, dir: sh.dir, cells: sh.cells })),
      afloat: afloat(s, q),
      ships: fleet && (own || reveal) ? fleet.map((sh) => ({ ...sh, sunk: s.sunk[q].includes(sh.id) })) : null,
      stats: s.stats[q],
    };
  });
  return {
    mode: s.mode,
    phase: s.phase,
    turn: s.turn,
    size: SIZE,
    fleet: FLEET,
    players,
    last: s.last,
    shotsAllowed: s.phase === 'battle' ? shotsAllowed(s, s.turn) : 0,
    winner: s.winner,
  };
}

// ---------------------------------------------------------------------------
// AI

/** What player p knows about the opponent's board. */
function knowledge(s, p) {
  const t = 1 - p;
  const shots = s.shots[t];
  const sunkCells = new Set();
  for (const sh of s.fleets[t] || []) if (s.sunk[t].includes(sh.id)) sh.cells.forEach((x) => sunkCells.add(x));
  const remaining = FLEET.filter((f) => !s.sunk[t].includes(f.id)).map((f) => f.len);
  const openHits = [];
  for (let i = 0; i < SIZE * SIZE; i++) if (shots[i] === HIT && !sunkCells.has(i)) openHits.push(i);
  return { shots, sunkCells, remaining, openHits };
}

/** Probability density of ship cells given what we know. */
export function density(k) {
  const d = new Float64Array(SIZE * SIZE);
  const hitSet = new Set(k.openHits);
  for (const len of k.remaining) {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        for (const dir of ['h', 'v']) {
          const cells = shipCells(r, c, dir, len);
          if (!cells) continue;
          let hits = 0;
          let okPlace = true;
          for (const x of cells) {
            if (k.shots[x] === MISS || k.sunkCells.has(x)) {
              okPlace = false;
              break;
            }
            if (hitSet.has(x)) hits++;
          }
          if (!okPlace) continue;
          if (k.openHits.length && hits === 0) continue; // target mode: only placements through our hits
          const w = hits ? Math.pow(20, hits) : 1;
          for (const x of cells) if (k.shots[x] === 0) d[x] += w;
        }
      }
    }
  }
  return d;
}

function unknownCells(k, exclude) {
  const out = [];
  for (let i = 0; i < SIZE * SIZE; i++) if (k.shots[i] === 0 && !exclude.has(i)) out.push(i);
  return out;
}

function targetCandidates(k, exclude) {
  // Prefer extending lines of two or more hits, otherwise any open neighbour of a hit.
  const hits = new Set(k.openHits);
  const line = [];
  const adj = [];
  for (const h of k.openHits) {
    const r = Math.floor(h / SIZE);
    const c = h % SIZE;
    for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) continue;
      const n = nr * SIZE + nc;
      if (k.shots[n] !== 0 || exclude.has(n)) continue;
      const br = r - dr;
      const bc = c - dc;
      const behind = br >= 0 && br < SIZE && bc >= 0 && bc < SIZE && hits.has(br * SIZE + bc);
      (behind ? line : adj).push(n);
    }
  }
  return line.length ? line : adj;
}

function chooseOne(s, p, level, rng, exclude) {
  const k = knowledge(s, p);
  const open = unknownCells(k, exclude);
  if (!open.length) return null;
  if (level === 'easy') {
    if (k.openHits.length && rng() < 0.5) {
      const t = targetCandidates(k, exclude);
      if (t.length) return pick(rng, t);
    }
    return pick(rng, open);
  }
  if (level === 'medium') {
    if (k.openHits.length) {
      const t = targetCandidates(k, exclude);
      if (t.length) return pick(rng, t);
    }
    const minLen = Math.min(...k.remaining);
    const parity = open.filter((x) => (Math.floor(x / SIZE) + (x % SIZE)) % minLen === 0);
    return pick(rng, parity.length ? parity : open);
  }
  const d = density(k);
  let best = -1;
  let cells = [];
  for (const x of open) {
    if (d[x] > best) {
      best = d[x];
      cells = [x];
    } else if (d[x] === best) cells.push(x);
  }
  return pick(rng, cells);
}

export function bot(s, p, level, ctx) {
  const rng = ctx.rng;
  if (s.phase === 'placing') return { type: 'place', ships: randomFleet(rng, level === 'hard') };
  const n = shotsAllowed(s, p);
  const chosen = new Set();
  const cells = [];
  for (let i = 0; i < n; i++) {
    const c = chooseOne(s, p, level, rng, chosen);
    if (c === null) break;
    chosen.add(c);
    cells.push(c);
  }
  return { type: 'fire', cells: shuffle(rng, cells) };
}
