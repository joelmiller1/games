import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Position, perft, START_FEN } from '../shared/chess/position.js';
import { chooseMove, Searcher } from '../shared/chess/search.js';
import * as chess from '../shared/games/chess.js';
import { seeded } from '../shared/lib/rng.js';

const PERFT = [
  [START_FEN, [20, 400, 8902, 197281]],
  ['r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862]],
  ['8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238]],
  ['r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467]],
  ['rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379]],
  ['r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10', [46, 2079, 89890]],
];

test('perft matches reference node counts', () => {
  for (const [fen, counts] of PERFT) {
    const pos = new Position(fen);
    counts.forEach((expected, i) => assert.equal(perft(pos, i + 1), expected, `${fen} depth ${i + 1}`));
    assert.equal(pos.fen(), new Position(fen).fen(), 'make/unmake restores the position');
  }
});

test('FEN round trip', () => {
  for (const [fen] of PERFT) assert.equal(new Position(fen).fen(), fen);
});

function playSan(moves) {
  let s = chess.setup({ options: {} });
  for (const uci of moves) {
    s = chess.act(s, s.turn, { type: 'move', from: uci.slice(0, 2), to: uci.slice(2, 4), promo: uci[4] }, { now: 0 });
  }
  return s;
}

test('SAN notation and checkmate (fool’s mate)', () => {
  const s = playSan(['f2f3', 'e7e5', 'g2g4', 'd8h4']);
  assert.deepEqual(s.san, ['f3', 'e5', 'g4', 'Qh4#']);
  assert.deepEqual(chess.outcome(s), { winners: [1], draw: false, reason: 'Checkmate' });
  assert.deepEqual(chess.actors(s), []);
});

test('SAN disambiguation, castling, promotion', () => {
  const pos = new Position('r3k2r/8/8/8/8/8/1P6/R3K2R w KQkq - 0 1');
  const sans = pos.legalMoves().map((m) => pos.san(m));
  assert.ok(sans.includes('O-O'));
  assert.ok(sans.includes('O-O-O'));
  assert.ok(sans.includes('Rab1') || sans.includes('Rb1'));
  const p2 = new Position('8/P7/8/8/8/8/8/k6K w - - 0 1');
  const promos = p2.legalMoves().map((m) => p2.san(m)).filter((x) => x.startsWith('a8'));
  assert.deepEqual(promos.sort(), ['a8=B', 'a8=N', 'a8=Q+', 'a8=R+']); // Q and R give check along the a-file
  const p3 = new Position('7k/8/8/8/8/8/8/R3R2K w - - 0 1');
  const r = p3.legalMoves().map((m) => p3.san(m));
  assert.ok(r.includes('Rad1') && r.includes('Red1'));
});

test('illegal moves are rejected', () => {
  const s = chess.setup({ options: {} });
  assert.throws(() => chess.act(s, 0, { type: 'move', from: 'e2', to: 'e5' }), /Illegal/);
  assert.throws(() => chess.act(s, 1, { type: 'move', from: 'e7', to: 'e5' }), /not your turn/);
  assert.throws(() => chess.act(s, 0, { type: 'move', from: 'z9', to: 'e5' }), /Invalid/);
});

test('promotion to a chosen piece', () => {
  let s = chess.setup({ options: {} });
  s.fen = '8/P7/8/8/8/8/8/k6K w - - 0 1';
  s.keys = {};
  s = chess.act(s, 0, { type: 'move', from: 'a7', to: 'a8', promo: 'n' }, { now: 0 });
  assert.equal(s.san[0], 'a8=N');
  assert.match(s.fen, /^N7/);
});

test('stalemate and insufficient material are draws', () => {
  let s = chess.setup({ options: {} });
  s.fen = 'k7/8/1Q6/8/8/8/8/7K w - - 0 1';
  s.keys = {};
  s = chess.act(s, 0, { type: 'move', from: 'b6', to: 'c7' }, { now: 0 });
  assert.equal(chess.outcome(s).reason, 'Stalemate');

  let t = chess.setup({ options: {} });
  t.fen = 'k7/8/8/8/8/8/1r6/K7 w - - 0 1';
  t.keys = {};
  t = chess.act(t, 0, { type: 'move', from: 'a1', to: 'b2' }, { now: 0 });
  assert.equal(chess.outcome(t).reason, 'Insufficient material');
});

test('threefold repetition', () => {
  const s = playSan(['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8']);
  assert.equal(chess.outcome(s).reason, 'Threefold repetition');
});

test('clocks: increment, and flag fall on timeout', () => {
  let s = chess.setup({ options: { clock: '60+2' } });
  s = chess.act(s, 0, { type: 'move', from: 'e2', to: 'e4' }, { now: 1000 });
  assert.equal(chess.deadline(s), null, 'clock not running before both sides move');
  s = chess.act(s, 1, { type: 'move', from: 'e7', to: 'e5' }, { now: 5000 });
  assert.equal(s.clock.turnStart, 5000);
  s = chess.act(s, 0, { type: 'move', from: 'g1', to: 'f3' }, { now: 15000 });
  assert.equal(s.clock.remaining[0], 60000 - 10000 + 2000);
  assert.equal(chess.deadline(s), 15000 + 60000);
  assert.equal(chess.timeout(s, 20000), null);
  const t = chess.timeout(s, 80000);
  assert.deepEqual(chess.outcome(t), { winners: [0], draw: false, reason: 'Time out' });
});

test('draw offers', () => {
  let s = chess.setup({ options: {} });
  s = chess.act(s, 0, { type: 'offerDraw' });
  assert.deepEqual(chess.actors(s).sort(), [0, 1]);
  s = chess.act(s, 1, { type: 'acceptDraw' });
  assert.deepEqual(chess.outcome(s), { winners: [], draw: true, reason: 'Draw agreed' });
});

test('search finds mate in one and mate in two', () => {
  const m1 = new Position('6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1');
  assert.equal(chooseMove(m1, 'hard', { rng: seeded(1), deadline: Date.now() + 500 }), 'd1d8');
  assert.equal(chooseMove(m1, 'medium', { rng: seeded(1) }), 'd1d8');
  // Mate in two: 1. Nf6+ gxf6 2. Bxf7#
  const m2 = new Position('r2qkb1r/pp2nppp/3p4/2pNN1B1/2BnP3/3P4/PPP2PPP/R2bK2R w KQkq - 1 1');
  const srch = new Searcher(m2, { deadline: Date.now() + 3000 });
  const r = srch.think(8);
  assert.ok(r.score > 90000, `expected a mate score, got ${r.score} (${m2.moveToUci(r.move)})`);
  assert.equal(m2.moveToUci(r.move), 'd5f6');
});

test('bots of every level play legal games to completion', () => {
  const rng = seeded(42);
  for (const levels of [['easy', 'medium'], ['medium', 'easy']]) {
    let s = chess.setup({ options: {} });
    let plies = 0;
    while (!chess.outcome(s) && plies < 120) {
      const p = s.turn;
      const a = chess.bot(s, p, levels[p], { rng, deadline: Date.now() + 50 });
      s = chess.act(s, p, a, { now: Date.now() });
      plies++;
    }
    assert.ok(plies > 0);
  }
});

test('hard bot uses the opening book and replies quickly', () => {
  const s = chess.setup({ options: {} });
  const t = Date.now();
  const a = chess.bot(s, 0, 'hard', { rng: seeded(3), deadline: Date.now() + 1000 });
  assert.ok(Date.now() - t < 500);
  assert.ok(['e2e4', 'd2d4', 'c2c4', 'g1f3'].includes(a.from + a.to));
});
