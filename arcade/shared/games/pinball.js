// Pinball "score attack": every player plays their own table in the browser at the same time.
// The server only keeps score, so this engine just validates progress reports.
import { check, clone, isInt } from '../lib/game.js';

export const MAX_SCORE = 999999999;

export function setup({ players, options }) {
  const balls = Number(options?.balls) === 5 ? 5 : 3;
  return {
    balls,
    players: Array.from({ length: players }, () => ({ score: 0, ball: 1, done: false })),
    finished: false,
  };
}

export function actors(s) {
  return s.finished ? [] : s.players.map((p, i) => (p.done ? -1 : i)).filter((i) => i >= 0);
}

export function act(state, player, action) {
  check(!state.finished, 'The game is over');
  const me = state.players[player];
  check(me && !me.done, 'You have already finished');
  check(action && (action.type === 'progress' || action.type === 'finish'), 'Unknown action');
  check(isInt(action.score, 0, MAX_SCORE), 'Invalid score');
  check(action.score >= me.score, 'Scores only go up');
  const s = clone(state);
  const p = s.players[player];
  p.score = action.score;
  if (isInt(action.ball, 1, s.balls)) p.ball = action.ball;
  if (action.type === 'finish') {
    p.done = true;
    if (s.players.every((x) => x.done)) s.finished = true;
  }
  return s;
}

export function forfeit(state, player) {
  const s = clone(state);
  if (s.finished) return s;
  s.players[player].done = true;
  if (s.players.every((x) => x.done)) s.finished = true;
  return s;
}

export function outcome(s) {
  if (!s.finished) return null;
  const scores = s.players.map((p) => p.score);
  const best = Math.max(...scores);
  const winners = scores.map((x, i) => (x === best ? i : -1)).filter((i) => i >= 0);
  return { winners, draw: winners.length > 1, reason: `Top score ${best.toLocaleString('en-US')}`, scores };
}

export function view(s) {
  return { balls: s.balls, players: s.players, finished: s.finished };
}

export function bot() {
  throw new Error('Pinball has no computer players');
}
