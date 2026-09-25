// Helpers shared by every game engine.
//
// An engine is a module exporting pure functions over plain, JSON-serialisable state:
//
//   setup({ players, options, rng })        -> state
//   actors(state)                           -> player indices allowed to act right now
//   act(state, player, action, ctx)         -> new state (throws GameError when illegal)
//   view(state, player | null)              -> what that player (or a spectator) may see
//   outcome(state)                          -> null while running, else
//                                              { winners: number[], draw: bool, reason, scores? }
//   bot(state, player, level, ctx)          -> an action for a computer player
//   forfeit(state, player, reason)          -> new state after a resignation / departure
//
// Optional: deadline(state) + timeout(state, now) for clocks.
// ctx = { rng: () => [0,1), now: epoch ms, deadline?: epoch ms for bots }

export class GameError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GameError';
  }
}

export function fail(message) {
  throw new GameError(message);
}

export function check(cond, message) {
  if (!cond) throw new GameError(message);
}

export function clone(state) {
  return structuredClone(state);
}

export function isInt(n, min, max) {
  return Number.isInteger(n) && n >= min && n <= max;
}
