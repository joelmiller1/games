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

export const CATEGORIES = [
  { id: 'board', name: 'Board games' },
  { id: 'puzzle', name: 'Dice & puzzles' },
  { id: 'arcade', name: 'Arcade' },
];

export const GAMES = [
  {
    id: 'chess',
    name: 'Chess',
    category: 'board',
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
    category: 'board',
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
    id: 'reversi',
    name: 'Reversi',
    category: 'board',
    tagline: 'Outflank and flip your way to the most discs.',
    players: [2, 2],
    onlineDefault: 2,
    bots: true,
    leaveMode: 'resign',
    accent: '#16a34a',
    seatLabels: ['Black', 'White'],
    options: [],
    rules: [
      'Black moves first. Place a disc so that one or more straight lines of your opponent’s discs are trapped between it and another of your discs.',
      'Every trapped disc, in every direction, flips to your colour.',
      'If you cannot make a legal move you pass. When neither player can move, the game ends.',
      'Whoever has the most discs on the board wins. Corners can never be flipped back, so they are worth fighting for.',
    ],
  },
  {
    id: 'connect4',
    name: 'Connect 4',
    category: 'board',
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
    id: 'tictactoe',
    name: 'Tic-Tac-Toe',
    category: 'board',
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
    id: 'mancala',
    name: 'Mancala',
    category: 'board',
    tagline: 'Sow the seeds, fill your store, steal from across the board.',
    players: [2, 2],
    onlineDefault: 2,
    bots: true,
    leaveMode: 'resign',
    accent: '#b45309',
    seatLabels: null,
    options: [
      {
        key: 'seeds',
        label: 'Seeds per pit',
        type: 'select',
        default: '4',
        choices: [
          { value: '3', label: '3 (quick)' },
          { value: '4', label: '4 (classic)' },
          { value: '6', label: '6 (long)' },
        ],
      },
    ],
    rules: [
      'Kalah rules. Each player owns the six pits on their side and the store on their right.',
      'Pick up all the seeds from one of your pits and sow them one by one, anticlockwise, into the following pits and your own store (never your opponent’s store).',
      'If your last seed lands in your store, you get another turn.',
      'If your last seed lands in an empty pit on your side and the pit opposite has seeds, you capture them all, together with your last seed.',
      'When one side runs out of seeds the game ends and the other player keeps the seeds left on their side. The fullest store wins.',
    ],
  },
  {
    id: 'dotsboxes',
    name: 'Dots & Boxes',
    category: 'board',
    tagline: 'Join the dots, close the boxes, and move again.',
    players: [2, 4],
    onlineDefault: 2,
    bots: true,
    leaveMode: 'bot',
    accent: '#9333ea',
    seatLabels: null,
    options: [
      {
        key: 'size',
        label: 'Board',
        type: 'select',
        default: '4',
        choices: [
          { value: '3', label: '3×3 boxes' },
          { value: '4', label: '4×4 boxes' },
          { value: '6', label: '6×6 boxes' },
        ],
      },
    ],
    rules: [
      'Take turns drawing a line between two neighbouring dots.',
      'Draw the fourth side of a box to claim it, then draw another line. Keep going as long as you close boxes.',
      'When every line is drawn, the player with the most boxes wins.',
      'Careful: drawing the third side of a box hands it to the next player. Late in the game, sometimes giving away two boxes on purpose wins you the rest.',
    ],
  },
  {
    id: 'battleship',
    name: 'Battleship',
    category: 'board',
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
    id: 'yahtzee',
    name: 'Yahtzee',
    category: 'puzzle',
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
    id: 'mastermind',
    name: 'Mastermind',
    category: 'puzzle',
    tagline: 'Crack the secret colour code in as few guesses as you can.',
    players: [1, 2],
    onlineDefault: 2,
    bots: true,
    leaveMode: 'resign',
    accent: '#d946ef',
    seatLabels: null,
    options: [
      {
        key: 'code',
        label: 'Code',
        type: 'select',
        default: '4x6',
        choices: [
          { value: '4x6', label: '4 pegs, 6 colours' },
          { value: '5x8', label: '5 pegs, 8 colours' },
        ],
      },
    ],
    rules: [
      'A secret code of coloured pegs is hidden from you. Colours can repeat.',
      'Make a guess and get feedback: a black pin for each peg with the right colour in the right place, a white pin for each right colour in the wrong place.',
      'Solo: crack the computer’s code within 10 guesses (12 with 5 pegs).',
      'Two players: each of you secretly sets a code for the other, then you take turns guessing. The first to crack the other’s code wins; if the second player cracks it in the same number of guesses, it is a draw.',
    ],
  },
  {
    id: 'minesweeper',
    name: 'Minesweeper',
    category: 'puzzle',
    tagline: 'Clear the minefield using the numbers. Don’t blow up.',
    players: [1, 8],
    onlineDefault: 2,
    bots: false,
    leaveMode: 'forfeit',
    leaderboard: true,
    realtime: true,
    scoring: { order: 'asc', format: 'time', stat: 'Cleared', statSuffix: '%', boardBy: 'level' },
    accent: '#2563eb',
    seatLabels: null,
    options: [
      {
        key: 'level',
        label: 'Difficulty',
        type: 'select',
        default: 'beginner',
        choices: [
          { value: 'beginner', label: 'Beginner' },
          { value: 'intermediate', label: 'Intermediate' },
          { value: 'expert', label: 'Expert' },
        ],
      },
    ],
    rules: [
      'Reveal every square that is not a mine. Your first click is always safe.',
      'A number tells you how many of the eight neighbouring squares hide a mine.',
      'Right-click (or long-press, or use the flag button) to flag a mine. Click a number whose mines are all flagged to open its other neighbours.',
      'Beginner is 9×9 with 10 mines, Intermediate 16×16 with 40, Expert 30×16 with 99. The fastest clear wins.',
      'Online race: everyone plays the same minefield at once.',
    ],
  },
  {
    id: '2048',
    name: '2048',
    category: 'puzzle',
    tagline: 'Slide the tiles, merge the numbers, reach 2048.',
    players: [1, 8],
    onlineDefault: 2,
    bots: false,
    leaveMode: 'forfeit',
    leaderboard: true,
    realtime: true,
    scoring: { stat: 'Best tile', boardBy: 'time' },
    accent: '#f97316',
    seatLabels: null,
    options: [
      {
        key: 'time',
        label: 'Time limit',
        type: 'select',
        default: 'none',
        choices: [
          { value: 'none', label: 'No limit' },
          { value: '120', label: '2 minutes' },
          { value: '300', label: '5 minutes' },
        ],
      },
    ],
    rules: [
      'Swipe or use the arrow keys to slide every tile as far as it will go.',
      'Two tiles with the same number merge into one worth their sum, and that sum is added to your score.',
      'After every move a new 2 (sometimes a 4) appears.',
      'Reach the 2048 tile to win, then keep going for a bigger score. The game ends when no move is left (or the time runs out).',
      'Online, everyone gets the same new tiles in the same order; a time limit keeps the race short.',
    ],
  },
  {
    id: 'bejeweled',
    name: 'Bejeweled',
    category: 'puzzle',
    tagline: 'Swap gems, line up three and set off cascades.',
    players: [1, 8],
    onlineDefault: 2,
    bots: false,
    leaveMode: 'forfeit',
    leaderboard: true,
    realtime: true,
    scoring: { stat: 'Level', boardBy: 'mode' },
    accent: '#db2777',
    seatLabels: null,
    options: [
      {
        key: 'mode',
        label: 'Mode',
        type: 'select',
        default: 'classic',
        choices: [
          { value: 'classic', label: 'Classic' },
          { value: 'blitz', label: '1-minute blitz' },
        ],
      },
    ],
    rules: [
      'Swap two gems that sit side by side to line up three or more of the same colour, across or down. A swap that makes no line is undone.',
      'Matched gems vanish, the gems above fall and new ones drop in from the top. Lines made by falling gems are cascades, and every step of a cascade scores more.',
      'Four in a row makes a flame gem, which explodes when it is matched. An L or T shape makes a star gem, which clears its whole row and column. Five in a row makes a hypercube: swap it with any gem to clear every gem of that colour.',
      'Fill the bar to go up a level. Every level multiplies your points.',
      'Classic ends when no move is left. In the 1-minute blitz the board reshuffles instead: score as much as you can before the time runs out.',
      'Every colour has its own shape, so the gems are easy to tell apart. Stuck? Press Hint (or H).',
    ],
  },
  {
    id: 'tetris',
    name: 'Tetris',
    category: 'arcade',
    tagline: 'Rotate, drop and clear lines as the pace picks up.',
    players: [1, 8],
    onlineDefault: 2,
    bots: false,
    leaveMode: 'forfeit',
    leaderboard: true,
    realtime: true,
    scoring: { stat: 'Lines' },
    accent: '#06b6d4',
    seatLabels: null,
    options: [
      {
        key: 'start',
        label: 'Starting level',
        type: 'select',
        default: '1',
        choices: [
          { value: '1', label: 'Level 1' },
          { value: '5', label: 'Level 5' },
          { value: '10', label: 'Level 10' },
        ],
      },
    ],
    rules: [
      'Move and rotate the falling pieces to complete horizontal lines, which then disappear.',
      'Keys: ← → move, ↓ soft drop, Space hard drop, ↑ or X rotate, Z rotate the other way, C hold, P pause.',
      'Touch: tap to rotate, drag sideways to move, drag down to drop faster and flick down to drop. Buttons work too.',
      'Clearing 1–4 lines at once scores 100, 300, 500 or 800 points, times the level. T-spins, combos and back-to-back Tetrises earn extra.',
      'Every 10 lines the level goes up and the pieces fall faster.',
    ],
  },
  {
    id: 'pinball',
    name: 'Pinball',
    category: 'arcade',
    tagline: 'Flippers, bumpers and a high score to beat.',
    players: [1, 8],
    onlineDefault: 2,
    bots: false,
    leaveMode: 'forfeit',
    leaderboard: true,
    realtime: true,
    scoring: { stat: 'Ball' },
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
  {
    id: 'breakout',
    name: 'Breakout',
    category: 'arcade',
    tagline: 'Smash the wall of bricks with a bouncing ball.',
    players: [1, 8],
    onlineDefault: 2,
    bots: false,
    leaveMode: 'forfeit',
    leaderboard: true,
    realtime: true,
    scoring: { stat: 'Level' },
    accent: '#0d9488',
    seatLabels: null,
    options: [],
    rules: [
      'Bounce the ball off your paddle to knock out every brick. Where it hits the paddle sets its angle.',
      'Silver bricks take two hits and gold ones never break. Higher rows score more.',
      'Catch falling capsules: W widens the paddle, M splits the ball in three, S slows it down and + is an extra life.',
      'Controls: the mouse, ← →, or drag anywhere on a touch screen. Space or a tap launches the ball.',
      'Clear the wall for a bonus and a new level. The ball speeds up as you go.',
    ],
  },
  {
    id: 'asteroids',
    name: 'Asteroids',
    category: 'arcade',
    tagline: 'Blast the rocks, dodge the saucers, survive the waves.',
    players: [1, 8],
    onlineDefault: 2,
    bots: false,
    leaveMode: 'forfeit',
    leaderboard: true,
    realtime: true,
    scoring: { stat: 'Wave' },
    accent: '#4f46e5',
    seatLabels: null,
    options: [],
    rules: [
      'Shoot the asteroids: big ones split into smaller, faster ones. Clear them all to start the next wave.',
      'Keys: ← → rotate, ↑ thrust, Space fire, ↓ or Shift hyperspace, P pause. On touch screens use the on-screen buttons.',
      'Flying saucers shoot back. The small one aims at you and is worth 1,000 points.',
      'Large rocks score 20, medium 50 and small 100. You get an extra ship every 10,000 points.',
    ],
  },
  {
    id: 'snake',
    name: 'Snake',
    category: 'arcade',
    tagline: 'Eat, grow, and don’t bite your own tail.',
    players: [1, 8],
    onlineDefault: 2,
    bots: false,
    leaveMode: 'forfeit',
    leaderboard: true,
    realtime: true,
    scoring: { stat: 'Length', boardBy: 'walls' },
    accent: '#84cc16',
    seatLabels: null,
    options: [
      {
        key: 'walls',
        label: 'Walls',
        type: 'select',
        default: 'solid',
        choices: [
          { value: 'solid', label: 'Solid walls' },
          { value: 'wrap', label: 'Wrap around' },
        ],
      },
    ],
    rules: [
      'Steer the snake to eat the apples. Each one makes you longer and a little faster.',
      'Golden apples appear now and then and are worth much more, but only for a few seconds.',
      'Keys: arrows or WASD. Touch: swipe on the board or use the arrow pad.',
      'Hitting a wall (with solid walls) or your own body ends the game.',
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

export function categoryOf(meta) {
  return CATEGORIES.find((c) => c.id === meta.category) || CATEGORIES[0];
}

/** How a leaderboard game ranks scores: higher points (default) or lower times. */
export function scoring(meta) {
  return { order: 'desc', format: 'points', stat: null, statSuffix: '', boardBy: null, ...(meta?.scoring || {}) };
}

/** High score tables for a game: one, or one per value of an option (e.g. Minesweeper difficulty). */
export function scoreBoards(meta) {
  const sc = scoring(meta);
  const opt = sc.boardBy && meta.options.find((o) => o.key === sc.boardBy);
  if (!opt) return [{ id: meta.id, label: null }];
  return opt.choices.map((c) => ({ id: `${meta.id}:${c.value}`, label: c.label }));
}

export function boardFor(meta, options) {
  const sc = scoring(meta);
  if (!sc.boardBy) return meta.id;
  return `${meta.id}:${normalizeOptions(meta, options)[sc.boardBy]}`;
}

export function formatScore(meta, value) {
  if (value === null || value === undefined) return '—';
  if (scoring(meta).format === 'time') return formatTime(value);
  return Number(value).toLocaleString('en-US');
}

/** Milliseconds as "12.3 s" or "2:05.4". */
export function formatTime(ms) {
  const t = Math.max(0, Math.round(ms / 100)) / 10;
  if (t < 60) return `${t.toFixed(1)} s`;
  const m = Math.floor(t / 60);
  return `${m}:${(t - m * 60).toFixed(1).padStart(4, '0')}`;
}

export function botName(level) {
  return `Computer (${levelName(level)})`;
}
