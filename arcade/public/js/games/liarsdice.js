// Liar's Dice UI: your hidden dice, the table's dice counts, a bid picker, and the reveal after
// every challenge. Pass & play hides each player's dice behind a "pass the device" screen.
import { h, fill } from '../ui.js';
import { icon } from '../icons.js';

const PIPS = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[28, 25], [72, 25], [28, 50], [72, 50], [28, 75], [72, 75]],
};

function die(value, cls = '') {
  return h('span', { class: ['ld-die', cls], role: 'img', 'aria-label': value ? String(value) : 'hidden' }, value ? PIPS[value].map(([x, y]) => h('i', { style: { left: `${x}%`, top: `${y}%` } })) : h('b', '?'));
}

const faceName = (f, q = 2) => (q === 1 ? ['', 'one', 'two', 'three', 'four', 'five', 'six'][f] : ['', 'ones', 'twos', 'threes', 'fours', 'fives', 'sixes'][f]);

export function create(ctx) {
  let room = null;
  let view = null;
  let seat = null;
  let q = 1;
  let f = 2;
  let pickedFor = null;
  let lastRoll = null;
  let lastBids = 0;
  let dismissed = null;
  let shownSeat = null;

  const el = h('div', { class: 'ld' });
  const side = h('div');

  const localPair = () => ctx.isLocal() && room.you.seats.length > 1;
  const myTurn = () => room.phase === 'playing' && seat !== null && view.turn === seat && room.actors.includes(seat);
  const minFace = () => (view.wild ? 2 : 1);
  const minQ = (face) => (!view.bid ? 1 : face > view.bid.f ? view.bid.q : view.bid.q + 1);
  const name = (i) => room.seats[i]?.name || `Player ${i + 1}`;

  function pickDefaults() {
    // Start from the face you hold most of (wild ones count), at the lowest legal quantity.
    const mine = view.dice[seat] || [];
    let best = view.bid ? view.bid.f : minFace();
    let bestN = -1;
    for (let face = minFace(); face <= 6; face++) {
      const n = mine.filter((d) => d === face || (view.wild && d === 1)).length;
      if (n > bestN && minQ(face) <= view.total) {
        bestN = n;
        best = face;
      }
    }
    f = best;
    q = Math.min(view.total, minQ(f));
  }

  function bid() {
    if (!myTurn()) return;
    ctx.act({ type: 'bid', q, f }, seat).catch(() => {});
  }

  function call(type) {
    if (!myTurn()) return;
    ctx.act({ type }, seat).catch(() => {});
  }

  function revealCard(last, compact = false) {
    const bidder = name(last.bid.by);
    const caller = name(last.caller);
    const matches = (d) => d === last.bid.f || (view.wild && d === 1 && last.bid.f !== 1);
    const headline = `${caller} called ${last.call === 'spot' ? '“Spot on”' : '“Liar!”'} on ${bidder}'s ${last.bid.q} ${faceName(last.bid.f, last.bid.q)}`;
    const verdict = `There ${last.count === 1 ? 'was' : 'were'} ${last.count} ${faceName(last.bid.f, last.count)}${view.wild && last.bid.f !== 1 ? ' (counting wild ones)' : ''}.`;
    const lost = last.losers.map(name);
    const outcome =
      last.call === 'spot' && last.correct
        ? `Spot on! Everyone else loses a die.`
        : `${lost.join(', ')} ${lost.length === 1 ? 'loses' : 'lose'} a die.`;
    const out = last.eliminated.length ? ` ${last.eliminated.map(name).join(', ')} ${last.eliminated.length === 1 ? 'is' : 'are'} out!` : '';
    if (compact) return h('div', { class: 'ld-last' }, h('p', { class: 'small', style: { margin: 0 } }, headline + '. ' + verdict + ' ' + outcome + out));
    return h(
      'div',
      { class: ['ld-reveal', last.correct ? 'caught' : 'safe'] },
      h('div', { class: 'ld-reveal-head' }, h('strong', headline), h('span', verdict), h('span', { class: 'ld-verdict' }, outcome + out)),
      h(
        'div',
        { class: 'ld-hands' },
        last.hands.map((hand, i) =>
          hand.length
            ? h(
                'div',
                { class: ['ld-hand', last.losers.includes(i) && 'lost'] },
                h('span', { class: 'ld-hand-name' }, name(i)),
                h('span', { class: 'ld-dice small' }, hand.map((d) => die(d, matches(d) ? (d === last.bid.f ? 'match' : 'wild match') : 'dim'))),
              )
            : null,
        ),
      ),
      h('button', { class: 'btn btn-sm', type: 'button', onClick: () => ((dismissed = last.round), render()) }, 'Got it'),
    );
  }

  function tableSeats() {
    return h(
      'div',
      { class: 'ld-table' },
      room.seats.map((st, i) => {
        const count = view.counts[i];
        const lastBid = [...view.bids].reverse().find((b) => b.by === i);
        return h(
          'div',
          { class: ['ld-seat', view.turn === i && room.phase === 'playing' && 'turn', count === 0 && 'out', i === seat && 'me'], style: { '--pc': st.color } },
          h('span', { class: 'ld-seat-name' }, st.name, i === seat && !ctx.isLocal() ? ' (you)' : ''),
          h('span', { class: 'ld-cups', 'aria-label': `${count} dice` }, count ? Array.from({ length: count }, () => h('i')) : h('span', { class: 'muted small' }, 'out')),
          lastBid ? h('span', { class: 'ld-bubble' }, `${lastBid.q} × `, die(lastBid.f, 'tiny')) : null,
        );
      }),
    );
  }

  function currentBid() {
    if (!view.bid) {
      return h('div', { class: 'ld-bid none' }, room.phase === 'playing' ? `Round ${view.round}: ${name(view.turn)} opens the bidding` : '');
    }
    return h('div', { class: 'ld-bid' }, h('span', { class: 'muted small' }, `${name(view.bid.by)} bids`), h('span', { class: 'ld-bid-q' }, `${view.bid.q} ×`), die(view.bid.f, 'big'), h('span', { class: 'muted small' }, `of ${view.total} dice`));
  }

  function controls() {
    if (!myTurn()) return null;
    if (pickedFor !== `${view.round}:${view.bids.length}`) {
      pickDefaults();
      pickedFor = `${view.round}:${view.bids.length}`;
    }
    const canBid = q >= minQ(f) && q <= view.total;
    const faces = [];
    for (let face = minFace(); face <= 6; face++) {
      const ok = minQ(face) <= view.total;
      faces.push(
        h(
          'button',
          {
            class: 'ld-face',
            type: 'button',
            'aria-pressed': String(face === f),
            'aria-label': faceName(face),
            disabled: !ok,
            onClick: () => {
              f = face;
              q = Math.max(q, minQ(f));
              if (q > view.total) q = view.total;
              render();
            },
          },
          die(face, 'small'),
        ),
      );
    }
    return h(
      'div',
      { class: 'ld-controls' },
      h(
        'div',
        { class: 'ld-picker' },
        h(
          'div',
          { class: 'ld-qty' },
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Fewer', disabled: q <= minQ(f), onClick: () => ((q = Math.max(minQ(f), q - 1)), render()) }, icon('minus', 18)),
          h('span', { class: 'ld-q' }, String(q)),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'More', disabled: q >= view.total, onClick: () => ((q = Math.min(view.total, q + 1)), render()) }, icon('plus', 18)),
          h('span', { class: 'muted' }, '×'),
        ),
        h('div', { class: 'ld-faces', role: 'group', 'aria-label': 'Face' }, faces),
      ),
      h(
        'div',
        { class: 'row', style: { justifyContent: 'center' } },
        h('button', { class: 'btn btn-primary', type: 'button', disabled: !canBid, onClick: bid }, `Bid ${q} ${faceName(f, q)}`),
        view.bid ? h('button', { class: 'btn btn-danger', type: 'button', onClick: () => call('liar') }, 'Liar!') : null,
        view.bid && view.spot ? h('button', { class: 'btn', type: 'button', onClick: () => call('spot') }, 'Spot on') : null,
      ),
    );
  }

  function myDice() {
    if (seat === null) return null;
    const dice = view.dice[seat] || [];
    if (!view.counts[seat]) return h('p', { class: 'muted', style: { textAlign: 'center' } }, 'You are out of dice. Watch the others battle it out.');
    return h('div', { class: 'ld-tray' }, h('span', { class: 'muted small' }, ctx.isLocal() ? `${name(seat)}'s dice` : 'Your dice'), h('div', { class: 'ld-dice', 'data-roll': String(view.rollId) }, dice.map((d) => die(d, view.wild && d === 1 ? 'wild' : ''))));
  }

  function renderSide() {
    const rows = view.bids.map((b) => h('div', { class: 'ld-hist' }, h('span', name(b.by)), h('span', { class: 'v' }, `${b.q} ×`, die(b.f, 'tiny'))));
    fill(
      side,
      h('div', { class: 'panel-title' }, `Round ${view.round}`),
      h('p', { class: 'small muted', style: { margin: '0 0 8px' } }, `${view.total} dice in play.${view.wild ? ' Ones are wild.' : ''}`),
      rows.length ? h('div', { class: 'ld-history' }, rows) : h('p', { class: 'muted small', style: { margin: 0 } }, 'No bids yet this round.'),
      view.last ? h('div', { style: { marginTop: '12px' } }, h('div', { class: 'panel-title' }, 'Last round'), revealCard(view.last, true)) : null,
    );
  }

  function renderPass() {
    const who = name(seat);
    const reveal = view.last && view.bids.length === 0 && dismissed !== view.last.round ? revealCard(view.last) : null;
    fill(
      el,
      reveal,
      h(
        'div',
        { class: 'pass-screen inline' },
        h('h2', `Pass the device to ${who}`),
        h('p', { class: 'muted' }, 'Everyone else: look away from the dice!'),
        h('button', { class: 'btn btn-primary btn-lg', type: 'button', onClick: () => ((shownSeat = seat), render()) }, `I'm ${who}, show my dice`),
      ),
    );
  }

  function render() {
    if (!view) return;
    renderSide();
    if (localPair() && room.phase === 'playing' && shownSeat !== seat && view.winner === null) return renderPass();
    const reveal = view.last && view.bids.length === 0 && dismissed !== view.last.round ? revealCard(view.last) : null;
    const allDice =
      room.phase === 'over' && view.last
        ? h('p', { class: 'muted small', style: { textAlign: 'center' } }, `${name(view.winner)} is the last one with dice.`)
        : null;
    fill(el, reveal, tableSeats(), currentBid(), myDice(), controls(), allDice);
  }

  return {
    el,
    side,
    update(r, v, st) {
      room = r;
      view = v;
      seat = st;
      const newRound = lastRoll !== null && v.rollId !== lastRoll;
      if (newRound) {
        ctx.play('liar');
        setTimeout(() => ctx.play('dice'), 700);
      } else if (v.bids.length > lastBids && lastRoll !== null) ctx.play('bid');
      lastRoll = v.rollId;
      lastBids = v.bids.length;
      render();
      if (newRound) el.querySelectorAll('.ld-tray .ld-die').forEach((d) => d.classList.add('rolling'));
    },
    status(r, v, st) {
      if (r.phase !== 'playing' || !v) return null;
      if (st !== null && v.turn === st) {
        const who = ctx.isLocal() ? `${r.seats[st].name}: ` : '';
        return v.bid ? `${who}Raise the bid, or call “Liar!”` : `${who}Open the bidding`;
      }
      return null;
    },
  };
}
