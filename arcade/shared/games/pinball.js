// Pinball "score attack": every player plays their own table in the browser at the same time.
// The table itself lives in public/js/pinball; the server only keeps score (see arcade.js).
import { pinball } from './arcade.js';

export { MAX_SCORE } from './arcade.js';
export const { setup, actors, act, forfeit, outcome, view, bot } = pinball;
