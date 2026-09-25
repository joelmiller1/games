import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as bs from '../shared/games/battleship.js';
import { seeded } from '../shared/lib/rng.js';

const rowsFleet = () => bs.FLEET.map((f, i) => ({ id: f.id, r: i * 2, c: 0, dir: 'h' }));

function deployed(mode = 'classic') {
  let s = bs.setup({ options: { mode } });
  s = bs.act(s, 0, { type: 'place', ships: rowsFleet() });
  s = bs.act(s, 1, { type: 'place', ships: rowsFleet() });
  return s;
}

test('placement validation', () => {
  const s = bs.setup({ options: {} });
  assert.deepEqual(bs.actors(s), [0, 1]);
  const overlap = rowsFleet();
  overlap[1].r = 0;
  assert.throws(() => bs.act(s, 0, { type: 'place', ships: overlap }), /overlap/);
  const off = rowsFleet();
  off[0].c = 7;
  assert.throws(() => bs.act(s, 0, { type: 'place', ships: off }), /does not fit/);
  assert.throws(() => bs.act(s, 0, { type: 'place', ships: rowsFleet().slice(1) }), /all five/);
  let t = bs.act(s, 0, { type: 'place', ships: rowsFleet() });
  assert.deepEqual(bs.actors(t), [1]);
  t = bs.act(t, 0, { type: 'unready' });
  assert.deepEqual(bs.actors(t), [0, 1]);
});

test('views hide the enemy fleet until the end', () => {
  const s = deployed();
  const v0 = bs.view(s, 0);
  assert.ok(v0.players[0].ships);
  assert.equal(v0.players[1].ships, null);
  const spectator = bs.view(s, null);
  assert.equal(spectator.players[0].ships, null);
});

test('hits, misses, sinking and winning', () => {
  let s = deployed();
  // Player 0 fires at player 1's destroyer: row 8, cols 0-1. Player 1 misses each time.
  s = bs.act(s, 0, { type: 'fire', cell: 99 });
  assert.equal(s.last.results[0].hit, false);
  assert.equal(s.turn, 1);
  assert.throws(() => bs.act(s, 0, { type: 'fire', cell: 98 }), /not your turn/);
  s = bs.act(s, 1, { type: 'fire', cell: 99 });
  assert.throws(() => bs.act(s, 0, { type: 'fire', cell: 99 }), /already fired/);
  s = bs.act(s, 0, { type: 'fire', cell: 80 });
  assert.equal(s.last.results[0].hit, true);
  s = bs.act(s, 1, { type: 'fire', cell: 98 });
  s = bs.act(s, 0, { type: 'fire', cell: 81 });
  assert.equal(s.last.results[0].sunk, 'destroyer');
  assert.deepEqual(s.sunk[1], ['destroyer']);
  // Sink everything else.
  let miss = 97;
  for (const ship of s.fleets[1]) {
    for (const cell of ship.cells) {
      if (s.shots[1][cell]) continue;
      s = bs.act(s, 1, { type: 'fire', cell: miss-- });
      s = bs.act(s, 0, { type: 'fire', cell });
    }
  }
  assert.deepEqual(bs.outcome(s), { winners: [0], draw: false, reason: 'Fleet destroyed' });
  assert.ok(bs.view(s, 1).players[0].ships, 'fleets revealed after the game');
});

test('streak mode keeps the turn after a hit', () => {
  let s = deployed('streak');
  s = bs.act(s, 0, { type: 'fire', cell: 0 });
  assert.equal(s.turn, 0);
  s = bs.act(s, 0, { type: 'fire', cell: 99 });
  assert.equal(s.turn, 1);
});

test('salvo mode fires one shot per surviving ship', () => {
  let s = deployed('salvo');
  assert.equal(bs.shotsAllowed(s, 0), 5);
  assert.throws(() => bs.act(s, 0, { type: 'fire', cells: [99] }), /Choose 5/);
  s = bs.act(s, 0, { type: 'fire', cells: [80, 81, 99, 98, 97] });
  assert.equal(s.sunk[1].length, 1);
  assert.equal(bs.shotsAllowed(s, 1), 4, 'player 1 lost a ship');
  s = bs.act(s, 1, { type: 'fire', cells: [96, 97, 98, 99] });
  assert.equal(bs.shotsAllowed(s, 0), 5);
});

function botGame(levels, seed, mode = 'classic') {
  const rng = seeded(seed);
  let s = bs.setup({ options: { mode } });
  let turns = 0;
  while (!bs.outcome(s) && turns < 500) {
    const p = bs.actors(s)[0];
    s = bs.act(s, p, bs.bot(s, p, levels[p], { rng }));
    turns++;
  }
  return { o: bs.outcome(s), s };
}

test('bots finish games in every mode; hard hunts better than easy', () => {
  for (const mode of ['classic', 'streak', 'salvo']) {
    const { o } = botGame(['hard', 'medium'], 3, mode);
    assert.ok(o, `${mode} finished`);
  }
  let hardWins = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const hardSeat = seed % 2;
    const { o } = botGame(hardSeat ? ['easy', 'hard'] : ['hard', 'easy'], seed);
    if (o.winners[0] === hardSeat) hardWins++;
  }
  assert.ok(hardWins >= 8, `hard won ${hardWins}/10`);
});

test('hard bot needs fewer shots than medium on average', () => {
  const shotsToWin = (level) => {
    let total = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const rng = seeded(seed * 7);
      let s = bs.setup({ options: {} });
      s = bs.act(s, 0, { type: 'place', ships: bs.randomFleet(rng) });
      s = bs.act(s, 1, { type: 'place', ships: bs.randomFleet(rng) });
      // Only player 0 shoots; player 1 always shoots a fixed cell sequence.
      let dummy = 0;
      while (!bs.outcome(s)) {
        if (s.turn === 0) s = bs.act(s, 0, bs.bot(s, 0, level, { rng }));
        else s = bs.act(s, 1, { type: 'fire', cell: dummy++ });
        if (dummy >= 100) break;
      }
      total += s.stats[0].shots;
    }
    return total / 12;
  };
  const hard = shotsToWin('hard');
  const medium = shotsToWin('medium');
  assert.ok(hard < medium, `hard ${hard} vs medium ${medium}`);
});
