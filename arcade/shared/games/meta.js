// Game catalogue shared by the server and the browser client.
// Pure data + helpers only: no engine code lives here so the client can load it cheaply.

export const LEVELS = [
  { id: 'easy', name: 'Easy' },
  { id: 'medium', name: 'Medium' },
  { id: 'hard', name: 'Hard' },
];

export const PLAYER_COLORS = [
  '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
];

export const GAMES = [
  {
    id: 'yahtzee',
    name: 'Yahtzee',
    tagline: 'Five dice, three rolls, thirteen boxes to fill.',
    players: [1, 6],
    onlineDefault: 2,
    bots: true,
    leaveMode: 'bot',
    leaderboard: true,
    accent: '#ef4444',
    seatLabels: null,
    options: [],
    rules: [
      'On your turn roll the five dice up to three times. Tap dice between rolls to hold them.',
      'After rolling, you must score in one empty box on your scorecard, even if it scores zero.',
      'Upper section: add up only the dice showing that number. Score 63 or more for a 35 point bonus.',
      '3 / 4 of a kind and Chance score the total of all dice. Full House 25, Small Straight (4 in a row) 30, Large Straight (5 in a row) 40, Yahtzee (5 of a kind) 50.',
      'Every extra Yahtzee earns a 100 point bonus if your Yahtzee box holds 50. Joker rules apply.',
      'After 13 rounds the highest total wins.',
    ],
  },
  {
    id: 'chess',
    name: 'Chess',
    tagline: 'The classic battle of kings, with optional clocks.',
    players: [2, 2],
    onlineDefault: 2,
    bots: true,
    leaveMode: 'resign',
    accent: '#a78bfa',
    seatLabels: ['White', 'Black'],
    options: [
      {
        key: 'clock',
        label: 'Clock',
        type: 'select',
        default: 'none',
        choices: [
          { value: 'none', label: 'No clock' },
          { value: '180+2', label: '3 | 2 blitz' },
          { value: '300+0', label: '5 min' },
          { value: '600+0', label: '10 min' },
          { value: '900+10', label: '15 | 10' },
          { value: '1800+0', label: '30 min' },
        ],
      },
    ],
    rules: [
      'Standard FIDE rules including castling, en passant and promotion.',
      'Checkmate the enemy king to win. Stalemate, threefold repetition, the fifty-move rule and insufficient material are draws.',
      'Drag or tap a piece to see its legal moves. You can offer a draw or resign at any time.',
      'With a clock, running out of time loses (unless your opponent cannot possibly mate).',
    ],
  },
  {
    id: 'checkers',
    name: 'Checkers',
    tagline: 'Jump, capture and crown your kings.',
    players: [2, 2],
    onlineDefault: 2,
    bots: true,
    leaveMode: 'resign',
    accent: '#f87171',
    seatLabels: ['Red', 'White'],
    options: [
      { key: 'forcedCapture', label: 'Captures are mandatory', type: 'bool', default: true },
    ],
    rules: [
      'American rules on an 8×8 board. Red moves first.',
      'Men move one square diagonally forward. Reaching the far row crowns a man as a king, which can also move backwards.',
      'Capture by jumping over an adjacent enemy piece. Multiple jumps must be completed.',
      'With mandatory captures on (the official rule), you must jump when you can.',
      'You win when your opponent has no pieces or no legal moves. 40 moves each without a capture or a man moving is a draw.',
    ],
  },
  {
    id: 'connect4',
    name: 'Connect 4',
    tagline: 'Drop discs, line up four in a row.',
    players: [2, 2],
    onlineDefault: 2,
    bots: true,
    leaveMode: 'resign',
    accent: '#facc15',
    seatLabels: ['Red', 'Yellow'],
    options: [],
    rules: [
      'Take turns dropping a disc into one of the seven columns.',
      'The first to connect four discs horizontally, vertically or diagonally wins.',
      'If the board fills up with no four in a row, the game is a draw.',
    ],
  },
  {
    id: 'battleship',
    name: 'Battleship',
    tagline: 'Hide your fleet, hunt down theirs.',
    players: [2, 2],
    onlineDefault: 2,
    bots: true,
    leaveMode: 'resign',
    accent: '#38bdf8',
    seatLabels: ['Blue fleet', 'Red fleet'],
    options: [
      {
        key: 'mode',
        label: 'Firing rules',
        type: 'select',
        default: 'classic',
        choices: [
          { value: 'classic', label: 'Classic: one shot per turn' },
          { value: 'streak', label: 'Streak: fire again after a hit' },
          { value: 'salvo', label: 'Salvo: one shot per surviving ship' },
        ],
      },
    ],
    rules: [
      'Secretly place your five ships on your 10×10 grid: Carrier (5), Battleship (4), Cruiser (3), Submarine (3) and Destroyer (2).',
      'Take turns firing at the enemy grid. You will hear “hit”, “miss” or which ship you sank.',
      'Sink the entire enemy fleet to win.',
      'Streak mode lets you keep firing while you hit. Salvo mode gives one shot per ship you still have afloat.',
    ],
  },
  {
    id: 'tictactoe',
    name: 'Tic-Tac-Toe',
    tagline: 'Three in a row. Quick and timeless.',
    players: [2, 2],
    onlineDefault: 2,
    bots: true,
    leaveMode: 'resign',
    accent: '#34d399',
    seatLabels: ['X', 'O'],
    options: [],
    rules: [
      'Take turns placing your mark in an empty square. X goes first.',
      'Get three in a row horizontally, vertically or diagonally to win.',
      'The computer on Hard never loses. Can you force a draw?',
    ],
  },
  {
    id: 'pinball',
    name: 'Pinball',
    tagline: 'Flippers, bumpers and a high score to beat.',
    players: [1, 8],
    onlineDefault: 2,
    bots: false,
    leaveMode: 'forfeit',
    leaderboard: true,
    realtime: true,
    accent: '#fb7185',
    seatLabels: null,
    options: [
      {
        key: 'balls',
        label: 'Balls per player',
        type: 'select',
        default: '3',
        choices: [
          { value: '3', label: '3 balls' },
          { value: '5', label: '5 balls' },
        ],
      },
    ],
    rules: [
      'Launch the ball with the plunger: hold Space / ↓ (or the Launch button) and release.',
      'Flippers: Z / ← and M / → (or the left and right halves of the screen on touch devices).',
      'Light all three top lanes to raise the bonus multiplier. Knock down all drop targets for a big bonus.',
      'Nudge the table with the N key or the Nudge button, but careful: nudge too much and you tilt!',
      'Online score attack: everyone plays their own table at the same time and the best score wins.',
    ],
  },
];

export const GAME_IDS = GAMES.map((g) => g.id);

export function getGame(id) {
  return GAMES.find((g) => g.id === id) || null;
}

/** Fill defaults and drop unknown/invalid option values. */
export function normalizeOptions(meta, input) {
  const out = {};
  const src = input && typeof input === 'object' ? input : {};
  for (const opt of meta.options) {
    const v = src[opt.key];
    if (opt.type === 'bool') {
      out[opt.key] = typeof v === 'boolean' ? v : opt.default;
    } else if (opt.type === 'select') {
      out[opt.key] = opt.choices.some((c) => c.value === v) ? v : opt.default;
    }
  }
  return out;
}

export function seatLabel(meta, index) {
  if (meta.seatLabels && meta.seatLabels[index]) return meta.seatLabels[index];
  return `Player ${index + 1}`;
}

export function levelName(level) {
  const l = LEVELS.find((x) => x.id === level);
  return l ? l.name : 'Medium';
}

export function botName(level) {
  return `Computer (${levelName(level)})`;
}
