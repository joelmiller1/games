// "Score attack" engine for games that run entirely in the browser (pinball, Tetris, Asteroids,
// Snake, Minesweeper). Everyone plays their own game at the same time; the server only keeps
// the scores, hands out a shared random seed (same pieces / rocks / minefield for everyone) and
// decides the winner.
import { check, clone, isInt } from '../lib/game.js';
import { getGame, scoring, formatScore } from './meta.js';

export const MAX_SCORE = 999999999;
const MAX_STAT = 1000000;

/**
 * players[i] = { score, stat, done, ok }
 *   score: points (higher is better) or elapsed milliseconds (lower is better)
 *   stat:  a small progress number shown next to the score (ball, lines, wave, length, % cleared)
 *   ok:    false when a timed game ended without finishing (a Minesweeper explosion)
 */
export function scoreAttack(id) {
  const meta = getGame(id);
  const sc = scoring(meta);
  const asc = sc.order === 'asc';

  function setup({ players, options, rng = Math.random }) {
    return {
      seed: Math.floor(rng() * 2147483647),
      options: { ...(options || {}) },
      players: Array.from({ length: players }, () => ({ score: 0, stat: 0, done: false, ok: true })),
      finished: false,
    };
  }

  function actors(s) {
    return s.finished ? [] : s.players.map((p, i) => (p.done ? -1 : i)).filter((i) => i >= 0);
  }

  function act(state, player, action) {
    check(!state.finished, 'The game is over');
    const me = state.players[player];
    check(me && !me.done, 'You have already finished');
    check(action && (action.type === 'progress' || action.type === 'finish'), 'Unknown action');
    check(isInt(action.score, 0, MAX_SCORE), 'Invalid score');
    check(action.score >= me.score, 'Scores only go up');
    const s = clone(state);
    const p = s.players[player];
    p.score = action.score;
    if (isInt(action.stat, 0, MAX_STAT)) p.stat = action.stat;
    if (action.type === 'finish') {
      p.done = true;
      p.ok = action.ok !== false;
      if (s.players.every((x) => x.done)) s.finished = true;
    }
    return s;
  }

  function forfeit(state, player) {
    const s = clone(state);
    if (s.finished) return s;
    const p = s.players[player];
    p.done = true;
    // Walking out of a timed race means not finishing it; a points game keeps what was scored.
    if (asc) p.ok = false;
    if (s.players.every((x) => x.done)) s.finished = true;
    return s;
  }

  function outcome(s) {
    if (!s.finished) return null;
    const ps = s.players;
    let winners;
    let reason;
    if (asc) {
      const finishers = ps.map((p, i) => ({ p, i })).filter(({ p }) => p.ok);
      if (finishers.length) {
        const best = Math.min(...finishers.map(({ p }) => p.score));
        winners = finishers.filter(({ p }) => p.score === best).map(({ i }) => i);
        reason = `Fastest: ${formatScore(meta, best)}`;
      } else if (ps.length === 1) {
        winners = [];
        reason = 'Not finished';
      } else {
        const most = Math.max(...ps.map((p) => p.stat));
        winners = ps.map((p, i) => (p.stat === most ? i : -1)).filter((i) => i >= 0);
        reason = `Nobody finished; the furthest got to ${most}${sc.statSuffix}`;
      }
    } else {
      const best = Math.max(...ps.map((p) => p.score));
      winners = ps.map((p, i) => (p.score === best ? i : -1)).filter((i) => i >= 0);
      reason = `Top score ${formatScore(meta, best)}`;
    }
    const scores = ps.map((p) => (asc && !p.ok ? null : p.score));
    return { winners, draw: winners.length > 1, reason, scores, order: sc.order, format: sc.format };
  }

  function view(s) {
    return { seed: s.seed, options: s.options, players: s.players, finished: s.finished };
  }

  function bot() {
    throw new Error(`${meta.name} has no computer players`);
  }

  return { setup, actors, act, forfeit, outcome, view, bot };
}

export const pinball = scoreAttack('pinball');
export const tetris = scoreAttack('tetris');
export const asteroids = scoreAttack('asteroids');
export const snake = scoreAttack('snake');
export const minesweeper = scoreAttack('minesweeper');
export const breakout = scoreAttack('breakout');
export const g2048 = scoreAttack('2048');
export const bejeweled = scoreAttack('bejeweled');
