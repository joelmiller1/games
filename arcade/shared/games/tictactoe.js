// Tic-Tac-Toe. Player 0 is X and moves first, player 1 is O.
import { check, clone, isInt } from '../lib/game.js';
import { pick } from '../lib/rng.js';

export const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

export function setup() {
  return {
    board: Array(9).fill(null),
    turn: 0,
    last: null,
    winner: null,
    line: null,
    draw: false,
    endReason: null,
  };
}

const over = (s) => s.winner !== null || s.draw;

export function actors(s) {
  return over(s) ? [] : [s.turn];
}

export function act(state, player, action) {
  check(!over(state), 'The game is over');
  check(player === state.turn, 'It is not your turn');
  check(action && action.type === 'place', 'Unknown action');
  check(isInt(action.cell, 0, 8), 'Invalid square');
  check(state.board[action.cell] === null, 'That square is already taken');
  const s = clone(state);
  s.board[action.cell] = player;
  s.last = action.cell;
  const line = winningLine(s.board, player);
  if (line) {
    s.winner = player;
    s.line = line;
    s.endReason = 'Three in a row';
  } else if (s.board.every((c) => c !== null)) {
    s.draw = true;
    s.endReason = 'The board is full';
  } else {
    s.turn = 1 - player;
  }
  return s;
}

export function forfeit(state, player, reason) {
  const s = clone(state);
  if (over(s)) return s;
  s.winner = 1 - player;
  s.endReason = reason;
  return s;
}

export function outcome(s) {
  if (s.winner !== null) return { winners: [s.winner], draw: false, reason: s.endReason };
  if (s.draw) return { winners: [], draw: true, reason: s.endReason };
  return null;
}

export function view(s) {
  return {
    board: s.board,
    turn: s.turn,
    last: s.last,
    line: s.line,
    winner: s.winner,
    draw: s.draw,
  };
}

export function winningLine(board, p) {
  for (const line of LINES) {
    if (line.every((i) => board[i] === p)) return line;
  }
  return null;
}

function emptyCells(board) {
  const out = [];
  for (let i = 0; i < 9; i++) if (board[i] === null) out.push(i);
  return out;
}

function findWin(board, p) {
  for (const i of emptyCells(board)) {
    board[i] = p;
    const w = winningLine(board, p);
    board[i] = null;
    if (w) return i;
  }
  return -1;
}

// Negamax with memoisation. Returns the score from the perspective of `p` to move.
function solve(board, p, memo) {
  const key = board.map((c) => (c === null ? '.' : c)).join('') + p;
  const hit = memo.get(key);
  if (hit !== undefined) return hit;
  const empty = emptyCells(board);
  let best = -Infinity;
  if (empty.length === 0) best = 0;
  for (const i of empty) {
    board[i] = p;
    let score;
    if (winningLine(board, p)) score = 10 + empty.length; // quicker wins score higher
    else if (empty.length === 1) score = 0;
    else score = -solve(board, 1 - p, memo);
    board[i] = null;
    if (score > best) best = score;
  }
  memo.set(key, best);
  return best;
}

// Tic-tac-toe has fewer than 6000 reachable positions, so one shared table is plenty.
const MEMO = new Map();

export function bestMoves(board, p) {
  const memo = MEMO;
  const b = board.slice();
  let best = -Infinity;
  let moves = [];
  for (const i of emptyCells(b)) {
    b[i] = p;
    let score;
    if (winningLine(b, p)) score = 100;
    else if (emptyCells(b).length === 0) score = 0;
    else score = -solve(b, 1 - p, memo);
    b[i] = null;
    if (score > best) {
      best = score;
      moves = [i];
    } else if (score === best) {
      moves.push(i);
    }
  }
  return { score: best, moves };
}

export function bot(s, p, level, ctx) {
  const rng = ctx.rng;
  const board = s.board.slice();
  const empty = emptyCells(board);
  const place = (cell) => ({ type: 'place', cell });
  const win = findWin(board, p);
  const block = findWin(board, 1 - p);

  if (level === 'easy') {
    if (win !== -1 && rng() < 0.6) return place(win);
    if (block !== -1 && rng() < 0.35) return place(block);
    return place(pick(rng, empty));
  }
  if (level === 'medium') {
    if (win !== -1) return place(win);
    if (block !== -1 && rng() < 0.9) return place(block);
    if (rng() < 0.3) return place(pick(rng, empty));
    if (board[4] === null) return place(4);
    const corners = [0, 2, 6, 8].filter((i) => board[i] === null);
    if (corners.length) return place(pick(rng, corners));
    return place(pick(rng, empty));
  }
  // hard: perfect play, random among equally good moves
  return place(pick(rng, bestMoves(board, p).moves));
}
