// Yahtzee UI: dice tray with holds and roll animation, and a multi-player scorecard.
import { h, fill } from '../ui.js';
import { CATEGORIES } from '../../shared/games/yahtzee.js';

const PIPS = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[28, 25], [72, 25], [28, 50], [72, 50], [28, 75], [72, 75]],
};

const HINTS = {
  ones: 'Sum of 1s',
  twos: 'Sum of 2s',
  threes: 'Sum of 3s',
  fours: 'Sum of 4s',
  fives: 'Sum of 5s',
  sixes: 'Sum of 6s',
  threeKind: 'Sum of all dice',
  fourKind: 'Sum of all dice',
  fullHouse: '25',
  smallStraight: '30',
  largeStraight: '40',
  yahtzee: '50',
  chance: 'Sum of all dice',
};

function face(die, value) {
  fill(die, ...PIPS[value].map(([x, y]) => h('span', { class: 'pip', style: { left: `${x}%`, top: `${y}%` } })));
  die.dataset.value = String(value);
}

export function create(ctx) {
  let room = null;
  let view = null;
  let seat = null;
  let lastRollId = null;
  let lastScored = null;
  let localHeld = null;
  let rolling = false;

  const dice = Array.from({ length: 5 }, (_, i) =>
    h('button', {
      class: 'die',
      type: 'button',
      'aria-label': `Die ${i + 1}`,
      onClick: () => toggle(i),
    }),
  );
  dice.forEach((d, i) => face(d, i + 1));
  const rollBtn = h('button', { class: 'btn btn-primary btn-lg', type: 'button', onClick: roll }, 'Roll');
  const pips = h('div', { class: 'rolls-left', 'aria-label': 'Rolls left' }, h('i'), h('i'), h('i'));
  const tray = h('div', { class: 'dice-tray' }, h('div', { class: 'dice' }, dice), h('div', { class: 'roll-row' }, pips, rollBtn));
  const card = h('div', { class: 'scorecard-wrap' });
  const el = h('div', { class: 'yz' }, tray, card);
  const side = h('div');

  const myTurn = () => room && room.phase === 'playing' && seat !== null && view && view.turn === seat && !view.finished;
  const held = () => localHeld || view.held;

  function toggle(i) {
    if (!myTurn() || !view.rolled || view.rollsLeft === 0 || rolling) return;
    const next = held().slice();
    next[i] = !next[i];
    localHeld = next;
    ctx.play('hold');
    renderDice();
    ctx.act({ type: 'hold', held: next }).catch(() => {
      localHeld = null;
      renderDice();
    });
  }

  function roll() {
    if (!myTurn() || view.rollsLeft === 0 || rolling) return;
    if (view.rolled && held().every(Boolean)) return ctx.toast('Release at least one die to roll');
    rollBtn.disabled = true;
    ctx.act({ type: 'roll', held: view.rolled ? held() : undefined }).catch(() => (rollBtn.disabled = false));
  }

  function score(cat) {
    if (!myTurn() || !view.rolled) return;
    ctx.act({ type: 'score', category: cat }).catch(() => {});
  }

  function animateRoll(targets) {
    rolling = true;
    ctx.play('dice');
    const hv = view.held;
    const start = performance.now();
    dice.forEach((d, i) => {
      if (!hv[i] || targets === 'all') {
        d.classList.remove('rolling');
        d.getBoundingClientRect();
        d.classList.add('rolling');
      }
    });
    const tick = () => {
      if (performance.now() - start < 450) {
        dice.forEach((d, i) => (!hv[i] || targets === 'all') && face(d, 1 + Math.floor(Math.random() * 6)));
        setTimeout(tick, 70);
      } else {
        rolling = false;
        dice.forEach((d) => d.classList.remove('rolling'));
        renderDice();
      }
    };
    tick();
  }

  function renderDice() {
    const mine = myTurn();
    const hv = held();
    dice.forEach((d, i) => {
      if (!rolling) face(d, view.dice[i]);
      d.classList.toggle('held', view.rolled && !!hv[i]);
      d.classList.toggle('blank', !view.rolled);
      d.disabled = !mine || !view.rolled || view.rollsLeft === 0;
      d.setAttribute('aria-pressed', String(!!hv[i]));
      d.setAttribute('aria-label', `Die ${i + 1}: ${view.dice[i]}${hv[i] ? ', held' : ''}`);
    });
    [...pips.children].forEach((p, i) => p.classList.toggle('on', i < view.rollsLeft));
    rollBtn.disabled = !mine || view.rollsLeft === 0 || rolling;
    rollBtn.textContent = !view.rolled ? 'Roll' : view.rollsLeft ? `Roll again` : 'Pick a box';
    rollBtn.hidden = !mine && !ctx.isLocal() && seat === null;
  }

  function renderCard() {
    const n = view.players;
    const opts = view.options?.options || null;
    const head = h(
      'tr',
      h('th', 'Round ' + view.round + ' / 13'),
      room.seats.slice(0, n).map((s, i) => h('th', { class: i === view.turn && !view.finished ? 'cur' : '', style: { '--pc': s.color } }, s.name)),
    );
    const rows = [];
    const cell = (i, cat) => {
      const v = view.cards[i][cat];
      const just = lastScored && lastScored.player === i && lastScored.category === cat;
      if (v !== null) return h('td', { class: just ? 'just' : '' }, String(v));
      if (i === view.turn && opts && cat in opts && !view.finished) {
        if (myTurn()) return h('td', { class: 'pot' }, h('button', { class: ['pot-btn', opts[cat] === 0 && 'zero'], type: 'button', 'aria-label': `Score ${opts[cat]} in ${cat}`, onClick: () => score(cat) }, String(opts[cat])));
        return h('td', h('span', { class: 'pot-plain' }, String(opts[cat])));
      }
      return h('td', '');
    };
    const catRow = (c) =>
      h(
        'tr',
        h('td', h('span', { class: 'cat-name' }, c.name, h('small', HINTS[c.id]))),
        Array.from({ length: n }, (_, i) => cell(i, c.id)),
      );
    CATEGORIES.slice(0, 6).forEach((c) => rows.push(catRow(c)));
    rows.push(
      h('tr', { class: 'sum' }, h('td', 'Upper total'), view.totals.map((t) => h('td', String(t.upper)))),
      h(
        'tr',
        { class: 'sum' },
        h('td', h('span', { class: 'cat-name' }, 'Bonus', h('small', '63+ scores 35'))),
        view.totals.map((t) => h('td', t.upperBonus ? '35' : h('span', { class: 'muted small' }, `${Math.max(0, 63 - t.upper)} to go`))),
      ),
    );
    CATEGORIES.slice(6).forEach((c) => rows.push(catRow(c)));
    rows.push(
      h('tr', { class: 'sum' }, h('td', 'Yahtzee bonus'), view.totals.map((t) => h('td', t.yahtzeeBonus ? String(t.yahtzeeBonus) : ''))),
      h('tr', { class: 'sum total' }, h('td', 'Total'), view.totals.map((t) => h('td', String(t.total)))),
    );
    fill(card, h('table', { class: 'scorecard' }, h('thead', head), h('tbody', rows)));
  }

  function renderSide() {
    const last = view.last;
    const cat = last ? CATEGORIES.find((c) => c.id === last.category) : null;
    fill(side, 
      h('div', { class: 'panel-title' }, 'Game'),
      h('p', { style: { margin: '0 0 6px' } }, `Round ${view.round} of 13`),
      last
        ? h(
            'p',
            { class: 'small', style: { margin: 0 } },
            h('strong', room.seats[last.player]?.name || ''),
            ` scored ${last.points} in ${cat.name}`,
            last.bonus ? ' plus a 100 point Yahtzee bonus!' : '',
          )
        : h('p', { class: 'muted small', style: { margin: 0 } }, 'Roll the dice to begin.'),
    );
  }

  function onKey(e) {
    if (!myTurn() || e.target.closest('input, textarea, select, button')) return;
    if (e.key === ' ' || e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      roll();
    } else if (/^[1-5]$/.test(e.key)) toggle(Number(e.key) - 1);
  }
  document.addEventListener('keydown', onKey);

  return {
    el,
    side,
    update(r, v, s) {
      const firstView = !view;
      room = r;
      view = v;
      seat = s;
      localHeld = null;
      if (v.last && (!lastScored || lastScored.player !== v.last.player || lastScored.category !== v.last.category || lastScored.points !== v.last.points)) {
        if (!firstView) ctx.play('score');
        lastScored = v.last;
      } else if (firstView) lastScored = null;
      if (lastRollId !== null && v.rollId !== lastRollId && v.rolled) animateRoll(v.rollsLeft === 2 ? 'all' : 'free');
      lastRollId = v.rollId;
      renderDice();
      renderCard();
      renderSide();
    },
    status(r, v, s) {
      if (r.phase !== 'playing' || !v) return null;
      const name = r.seats[v.turn].name;
      if (s !== null && v.turn === s) {
        const who = ctx.isLocal() ? `${name}: ` : '';
        if (!v.rolled) return `${who}Roll the dice`;
        if (v.rollsLeft === 0) return `${who}Choose a box to score`;
        return `${who}Hold dice and roll again, or choose a box (${v.rollsLeft} roll${v.rollsLeft === 1 ? '' : 's'} left)`;
      }
      return null;
    },
    destroy() {
      document.removeEventListener('keydown', onKey);
    },
  };
}
