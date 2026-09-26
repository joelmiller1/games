// Server-side registry of game engines, keyed by the ids in meta.js.
import * as yahtzee from './yahtzee.js';
import * as chess from './chess.js';
import * as checkers from './checkers.js';
import * as connect4 from './connect4.js';
import * as battleship from './battleship.js';
import * as tictactoe from './tictactoe.js';
import * as reversi from './reversi.js';
import * as mancala from './mancala.js';
import * as dotsboxes from './dotsboxes.js';
import * as mastermind from './mastermind.js';
import { pinball, tetris, asteroids, snake, minesweeper, breakout, g2048, bejeweled } from './arcade.js';

export const ENGINES = {
  yahtzee,
  chess,
  checkers,
  connect4,
  battleship,
  tictactoe,
  reversi,
  mancala,
  dotsboxes,
  mastermind,
  pinball,
  tetris,
  asteroids,
  snake,
  minesweeper,
  breakout,
  '2048': g2048,
  bejeweled,
};
