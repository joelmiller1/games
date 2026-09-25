// Mastermind UI: a colour palette, the guess being built, and the board of past guesses with
// black / white pins. Two-player games show both boards; pass & play hides codes between turns.
import { h, fill } from '../ui.js';
import { icon } from '../icons.js';

export const PEG_COLORS = ['#ef4444', '#f97316', '#facc15', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#f1f5f9'];
const PEG_NAMES = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'white'];

function peg(c, extra = {}) {
  return h('span', {
    class: ['mm-peg', c === null || c === undefined ? 'empty' : '', extra.cls],
    style: c === null || c === undefined ? null : { '--c': PEG_COLORS[c] },
    'aria-label': c === null || c === undefined ? 'empty' : PEG_NAMES[c],
    role: 'img',
  });
}

function pins(g, pegs) {
  const out = [];
  for (let i = 0; i < pegs; i++) out.push(h('i', { class: i < g.black ? 'b' : i < g.black + g.white ? 'w' : '' }));
  return h('span', { class: ['mm-pins', pegs === 5 && 'five'], title: `${g.black} right place, ${g.white} right colour`, 'aria-label': `${g.black} black, ${g.white} white` }, out);
}

export function create(ctx) {
  let room = null;
  let view = null;
  let seat = null;
  let current = [];
  let shownSeat = null;
  let showCode = false;
  let lastCount = -1;

  const el = h('div', { class: 'mm' });
  const side = h('div');

  const localPair = () => ctx.isLocal() && room.you.seats.length > 1;
  const canGuess = () => room.phase === 'playing' && seat !== null && view.phase === 'playing' && view.turn === seat && room.actors.includes(seat);
  const canSet = () => room.phase === 'playing' && seat !== null && view.phase === 'setup' && !view.ready[seat];

  function add(c) {
    if (current.length >= view.pegs) return;
    current = [...current, c];
    ctx.play('peg');
    render();
  }

  function removeAt(i) {
    current = current.filter((_, k) => k !== i);
    render();
  }

  function submit() {
    if (current.length !== view.pegs) return;
    const code = current.slice();
    if (canSet()) {
      ctx.act({ type: 'setCode', code }, seat).then(() => ctx.play('join')).catch(() => {});
      current = [];
    } else if (canGuess()) {
      ctx.act({ type: 'guess', code }, seat).catch(() => {});
      current = [];
    }
    render();
  }

  function composer(title, submitLabel, extra = []) {
    const slots = h(
      'div',
      { class: 'mm-row mm-current' },
      Array.from({ length: view.pegs }, (_, i) =>
        h('button', { class: 'mm-slot', type: 'button', 'aria-label': current[i] !== undefined ? `Remove ${PEG_NAMES[current[i]]}` : 'Empty slot', onClick: () => current[i] !== undefined && removeAt(i) }, peg(current[i])),
      ),
    );
    const palette = h(
      'div',
      { class: 'mm-palette', role: 'group', 'aria-label': 'Colours' },
      Array.from({ length: view.colors }, (_, c) => h('button', { class: 'mm-color', type: 'button', style: { '--c': PEG_COLORS[c] }, 'aria-label': PEG_NAMES[c], onClick: () => add(c) }, h('span', String(c + 1)))),
    );
    return h(
      'div',
      { class: 'mm-composer' },
      h('div', { class: 'mm-title' }, title),
      slots,
      palette,
      h(
        'div',
        { class: 'row', style: { justifyContent: 'center' } },
        ...extra,
        h('button', { class: 'btn btn-sm btn-ghost', type: 'button', disabled: !current.length, onClick: () => ((current = []), render()) }, 'Clear'),
        h('button', { class: 'btn btn-primary', type: 'button', disabled: current.length !== view.pegs, onClick: submit }, icon('check', 16), submitLabel),
      ),
    );
  }

  function board(guesses, title, secret, rowsFor) {
    const rows = [];
    for (let i = 0; i < Math.min(rowsFor, guesses.length); i++) {
      const g = guesses[i];
      rows.push(
        h(
          'div',
          { class: ['mm-row', g && g.black === view.pegs && 'solved', i === guesses.length - 1 && lastCount !== null && 'latest'] },
          h('span', { class: 'mm-num' }, String(i + 1)),
          h('span', { class: 'mm-pegs' }, Array.from({ length: view.pegs }, (_, k) => peg(g ? g.code[k] : null))),
          g ? pins(g, view.pegs) : h('span', { class: ['mm-pins', view.pegs === 5 && 'five', 'none'] }, Array.from({ length: view.pegs }, () => h('i'))),
        ),
      );
    }
    return h(
      'div',
      { class: 'mm-board' },
      h('div', { class: 'mm-title' }, title),
      secret !== undefined ? h('div', { class: 'mm-row mm-secret' }, h('span', { class: 'mm-num' }, icon('eye', 14)), h('span', { class: 'mm-pegs' }, Array.from({ length: view.pegs }, (_, k) => peg(secret ? secret[k] : null, { cls: secret ? '' : 'hidden' }))), h('span', { class: 'mm-pins none' })) : null,
      h('div', { class: 'mm-rows' }, rows),
      guesses.length < rowsFor && !(guesses.length && guesses[guesses.length - 1].black === view.pegs) && view.phase !== 'over'
        ? h('div', { class: 'mm-left' }, guesses.length ? `${rowsFor - guesses.length} guesses left` : `${rowsFor} guesses to crack it`)
        : null,
    );
  }

  function codeToggle(code) {
    if (!localPair()) return code;
    return showCode ? code : null;
  }

  function renderPass() {
    const who = room.seats[seat].name;
    fill(
      el,
      h(
        'div',
        { class: 'pass-screen inline' },
        h('h2', `Pass the device to ${who}`),
        h('p', { class: 'muted' }, 'Codes are secret: no peeking!'),
        h(
          'button',
          {
            class: 'btn btn-primary btn-lg',
            type: 'button',
            onClick: () => {
              shownSeat = seat;
              showCode = false;
              render();
            },
          },
          `I'm ${who}, continue`,
        ),
      ),
    );
  }

  function render() {
    if (!view) return;
    if (localPair() && room.phase === 'playing' && view.phase !== 'over' && shownSeat !== seat) return renderPass();
    const over = view.phase === 'over';
    const solo = view.players === 1;
    const me = seat ?? 0;
    const opp = 1 - me;
    const oppName = room.seats[opp]?.name || 'your opponent';
    const parts = [];
    if (view.phase === 'setup') {
      if (canSet()) {
        parts.push(
          composer(`Set a secret code for ${oppName}`, 'Lock in code', [
            h('button', { class: 'btn btn-sm', type: 'button', onClick: () => ((current = Array.from({ length: view.pegs }, () => Math.floor(Math.random() * view.colors))), render()) }, icon('shuffle', 16), 'Random'),
          ]),
        );
      } else if (seat !== null) {
        parts.push(h('div', { class: 'mm-wait' }, h('p', { class: 'muted' }, `Waiting for ${oppName} to set a code…`), board([], 'Your code', codeToggle(view.myCode), 0)));
      } else parts.push(h('p', { class: 'muted' }, 'The players are choosing their secret codes…'));
      fill(el, ...parts);
      renderSide();
      return;
    }
    const mineGuesses = view.guesses[me] || [];
    if (solo) {
      parts.push(board(mineGuesses, over ? 'The code' : `Guess ${Math.min(mineGuesses.length + 1, view.maxGuesses)} of ${view.maxGuesses}`, over ? view.targets[0] : null, view.maxGuesses));
    } else {
      const theirs = view.guesses[opp] || [];
      const secretToCrack = over ? view.targets[me] : null;
      const cols = h(
        'div',
        { class: 'mm-boards' },
        board(mineGuesses, seat === null ? `${room.seats[0].name} guessing` : `Cracking ${oppName}'s code`, seat === null && !over ? undefined : secretToCrack, view.maxGuesses),
        board(theirs, seat === null ? `${room.seats[1].name} guessing` : `${oppName} cracking yours`, seat === null ? (over ? view.targets[opp] : undefined) : codeToggle(view.myCode), view.maxGuesses),
      );
      parts.push(cols);
      if (localPair() && !over) parts.push(h('button', { class: 'btn btn-sm btn-ghost', type: 'button', onClick: () => ((showCode = !showCode), render()) }, icon('eye', 16), showCode ? 'Hide my code' : 'Show my code'));
    }
    if (canGuess()) parts.push(composer('Your guess', 'Guess'));
    fill(el, ...parts);
    renderSide();
  }

  function renderSide() {
    const lines = [h('div', { class: 'panel-title' }, 'Code')];
    lines.push(h('p', { class: 'small', style: { margin: '0 0 8px' } }, `${view.pegs} pegs, ${view.colors} colours, repeats allowed. ${view.maxGuesses} guesses.`));
    lines.push(h('div', { class: 'mm-legend small' }, h('span', h('span', { class: 'mm-pins' }, h('i', { class: 'b' })), ' right colour, right place'), h('span', h('span', { class: 'mm-pins' }, h('i', { class: 'w' })), ' right colour, wrong place')));
    lines.push(h('p', { class: 'muted small', style: { margin: '8px 0 0' } }, 'Keys: 1–' + view.colors + ' add a colour, Backspace removes, Enter guesses.'));
    fill(side, ...lines);
  }

  function onKey(e) {
    if (!view || e.target.closest('input, textarea, select')) return;
    if (!canGuess() && !canSet()) return;
    const n = Number(e.key);
    if (n >= 1 && n <= view.colors) add(n - 1);
    else if (e.key === 'Backspace') {
      if (current.length) removeAt(current.length - 1);
    } else if (e.key === 'Enter' && !e.target.closest('button')) submit();
    else return;
    e.preventDefault();
  }
  document.addEventListener('keydown', onKey);

  return {
    el,
    side,
    update(r, v, st) {
      const seatChanged = st !== seat;
      room = r;
      view = v;
      seat = st;
      if (seatChanged) current = [];
      const count = v.guesses.reduce((a, g) => a + g.length, 0);
      if (lastCount >= 0 && count > lastCount) ctx.play('pins');
      lastCount = count;
      render();
    },
    status(r, v, st) {
      if (r.phase !== 'playing' || !v) return null;
      const who = ctx.isLocal() && st !== null ? `${r.seats[st].name}: ` : '';
      if (v.phase === 'setup') {
        if (st !== null && !v.ready[st]) return `${who}Set a secret code for your opponent`;
        return 'Waiting for the codes to be set';
      }
      if (st !== null && v.turn === st) {
        const left = v.maxGuesses - v.guesses[st].length;
        const lastChance = v.players === 2 && st === 1 && v.solvedAt[0] !== null;
        return `${who}${lastChance ? 'Last chance to draw! ' : ''}Make a guess (${left} left)`;
      }
      return null;
    },
    destroy() {
      document.removeEventListener('keydown', onKey);
    },
  };
}
