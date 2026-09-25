// Server-side registry of game engines, keyed by the ids in meta.js.
import * as yahtzee from './yahtzee.js';
import * as chess from './chess.js';
import * as checkers from './checkers.js';
import * as connect4 from './connect4.js';
import * as battleship from './battleship.js';
import * as tictactoe from './tictactoe.js';
import * as pinball from './pinball.js';

export const ENGINES = { yahtzee, chess, checkers, connect4, battleship, tictactoe, pinball };
