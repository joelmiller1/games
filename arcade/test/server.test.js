import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { createApp } from '../server/app.js';
import { loadConfig } from '../server/config.js';

let app;
let base;
let dataDir;

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arcade-test-'));
  const config = { ...loadConfig({}), dataDir, botThreads: 1, logLevel: 'silent' };
  app = await createApp(config);
  const addr = await app.listen(0, '127.0.0.1');
  base = `127.0.0.1:${addr.port}`;
});

after(async () => {
  await app.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

class Client {
  constructor(name) {
    this.name = name;
    this.id = 'id' + Math.random().toString(36).slice(2, 12);
    this.secret = 'sec' + Math.random().toString(36).slice(2, 12);
    this.rid = 0;
    this.pending = new Map();
    this.messages = [];
    this.waiters = [];
  }

  async connect() {
    this.ws = new WebSocket(`ws://${base}/ws`);
    await new Promise((resolve, reject) => {
      this.ws.once('open', resolve);
      this.ws.once('error', reject);
    });
    this.ws.on('message', (d) => {
      const msg = JSON.parse(d.toString());
      if (msg.t === 'res') {
        const p = this.pending.get(msg.rid);
        this.pending.delete(msg.rid);
        if (msg.ok) p.resolve(msg.data);
        else p.reject(new Error(msg.error));
        return;
      }
      this.messages.push(msg);
      if (msg.t === 'room') this.room = msg.room;
      for (const w of [...this.waiters]) {
        if (w.pred(msg)) {
          this.waiters.splice(this.waiters.indexOf(w), 1);
          w.resolve(msg);
        }
      }
    });
    await this.request({ t: 'hello', id: this.id, secret: this.secret, name: this.name });
    return this;
  }

  request(msg) {
    const rid = ++this.rid;
    return new Promise((resolve, reject) => {
      this.pending.set(rid, { resolve, reject });
      this.ws.send(JSON.stringify({ ...msg, rid }));
    });
  }

  waitFor(pred, ms = 8000) {
    return new Promise((resolve, reject) => {
      const w = { pred, resolve };
      this.waiters.push(w);
      setTimeout(() => reject(new Error('timed out waiting')), ms).unref();
    });
  }

  waitRoom(pred, ms) {
    if (this.room && pred(this.room)) return Promise.resolve(this.room);
    return this.waitFor((m) => m.t === 'room' && pred(m.room), ms).then((m) => m.room);
  }

  close() {
    this.ws.close();
  }
}

test('health, info, static files and SPA fallback', async () => {
  let r = await fetch(`http://${base}/healthz`);
  assert.equal(r.status, 200);
  r = await fetch(`http://${base}/api/info`);
  const info = await r.json();
  assert.equal(info.games.length, 18);
  r = await fetch(`http://${base}/`);
  assert.equal(r.status, 200);
  assert.match(await r.text(), /<html/i);
  r = await fetch(`http://${base}/room/ABCD`);
  assert.equal(r.status, 200, 'client routes fall back to index.html');
  r = await fetch(`http://${base}/shared/games/meta.js`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /javascript/);
  r = await fetch(`http://${base}/../server/hub.js`);
  assert.notEqual(r.status, 200);
  r = await fetch(`http://${base}/shared/%2e%2e/server/hub.js`);
  assert.notEqual(r.status, 200);
});

test('online tic-tac-toe between two players, with rematch', async () => {
  const alice = await new Client('Alice').connect();
  const bob = await new Client('Bob').connect();
  const lobby = await new Promise((resolve) => {
    bob.waitFor((m) => m.t === 'lobby' && m.rooms.length > 0).then(resolve);
    bob.request({ t: 'lobby.watch' }).then(async () => {
      const { code } = await alice.request({ t: 'room.create', game: 'tictactoe', mode: 'online' });
      alice.code = code;
      await alice.request({ t: 'room.join', code });
    });
  });
  assert.equal(lobby.rooms[0].code, alice.code);
  await bob.request({ t: 'room.join', code: alice.code });
  let room = await alice.waitRoom((r) => r.seats[1].kind === 'human');
  assert.equal(room.seats[1].name, 'Bob');
  await assert.rejects(bob.request({ t: 'room.start' }), /Only the host/);
  await alice.request({ t: 'room.start' });
  await bob.waitRoom((r) => r.phase === 'playing');
  const moves = [
    [alice, 0],
    [bob, 3],
    [alice, 1],
    [bob, 4],
  ];
  for (const [c, cell] of moves) await c.request({ t: 'room.act', action: { type: 'place', cell } });
  await assert.rejects(alice.request({ t: 'room.act', action: { type: 'place', cell: 0 } }), /taken/);
  await alice.request({ t: 'room.act', action: { type: 'place', cell: 2 } });
  room = await bob.waitRoom((r) => r.phase === 'over');
  assert.deepEqual(room.result.winners, [0]);
  assert.equal(room.seats[0].wins, 1);
  // Rematch: seats rotate, so Bob plays X.
  await alice.request({ t: 'room.rematch' });
  await bob.request({ t: 'room.rematch' });
  room = await alice.waitRoom((r) => r.phase === 'playing' && r.gameNo === 2);
  assert.equal(room.seats[0].name, 'Bob');
  assert.deepEqual(room.you.seats, [1]);
  // Chat
  const chatP = alice.waitFor((m) => m.t === 'chat' && m.message.text === 'good game');
  await bob.request({ t: 'room.chat', text: 'good game' });
  const chat = await chatP;
  assert.equal(chat.message.name, 'Bob');
  // Leaving mid-game forfeits.
  await bob.request({ t: 'room.leave' });
  room = await alice.waitRoom((r) => r.phase === 'over' && r.gameNo === 2);
  assert.deepEqual(room.result.winners, [1]);
  alice.close();
  bob.close();
});

test('solo game against the computer plays bot moves', async () => {
  const carol = await new Client('Carol').connect();
  const { code } = await carol.request({ t: 'room.create', game: 'connect4', mode: 'solo', level: 'easy', seat: 0 });
  await carol.request({ t: 'room.join', code });
  let room = await carol.waitRoom((r) => r.phase === 'playing');
  assert.equal(room.seats[1].kind, 'bot');
  assert.equal(room.visibility, 'private');
  await carol.request({ t: 'room.act', action: { type: 'drop', col: 3 } });
  room = await carol.waitRoom((r) => r.views[0].turn === 0 && r.views[0].cols.flat().length === 2);
  assert.equal(room.views[0].cols.flat().length, 2);
  carol.close();
});

test('pass-and-play controls several seats from one connection', async () => {
  const dan = await new Client('Dan').connect();
  const { code } = await dan.request({ t: 'room.create', game: 'yahtzee', mode: 'local', names: ['Dan', 'Eve'] });
  await dan.request({ t: 'room.join', code });
  let room = await dan.waitRoom((r) => r.phase === 'playing');
  assert.deepEqual(room.you.seats, [0, 1]);
  assert.deepEqual(Object.keys(room.views), ['0', '1']);
  await dan.request({ t: 'room.act', seat: 0, action: { type: 'roll' } });
  await dan.request({ t: 'room.act', seat: 0, action: { type: 'score', category: 'chance' } });
  room = await dan.waitRoom((r) => r.views[1].turn === 1);
  await assert.rejects(dan.request({ t: 'room.act', seat: 0, action: { type: 'roll' } }), /not your turn/);
  await dan.request({ t: 'room.act', seat: 1, action: { type: 'roll' } });
  dan.close();
});

test('chess clock game against the computer and leaderboard API', async () => {
  const fay = await new Client('Fay').connect();
  const { code } = await fay.request({ t: 'room.create', game: 'chess', mode: 'solo', level: 'medium', seat: 1, options: { clock: '300+0' } });
  await fay.request({ t: 'room.join', code });
  // Computer is White and moves first.
  const room = await fay.waitRoom((r) => r.views[1] && r.views[1].san.length === 1);
  assert.equal(room.options.clock, '300+0');
  assert.ok(room.views[1].legal.length > 0);
  const r = await fetch(`http://${base}/api/leaderboards`);
  const boards = await r.json();
  assert.ok(boards.pinball.boards[0].scores);
  assert.equal(boards.minesweeper.boards.length, 3);
  assert.ok(boards.chess.records);
  fay.close();
});

test('pinball score submission', async () => {
  const gus = await new Client('Gus').connect();
  const res = await gus.request({ t: 'score.submit', game: 'pinball', score: 123450 });
  assert.equal(res.rank, 1);
  await assert.rejects(gus.request({ t: 'score.submit', game: 'chess', score: 5 }), /recorded automatically/);
  let boards = await (await fetch(`http://${base}/api/leaderboards`)).json();
  assert.equal(boards.pinball.boards[0].scores[0].name, 'Gus');
  // Minesweeper times: lower is better, one table per difficulty.
  await new Promise((r) => setTimeout(r, 3100));
  const t1 = await gus.request({ t: 'score.submit', game: 'minesweeper', options: { level: 'expert' }, scores: [{ name: 'Gus', score: 95000 }, { name: 'Hana', score: 80000 }] });
  assert.deepEqual(t1.ranks, [1, 1]);
  assert.equal(t1.board, 'minesweeper:expert');
  boards = await (await fetch(`http://${base}/api/leaderboards`)).json();
  const expert = boards.minesweeper.boards.find((b) => b.id === 'minesweeper:expert');
  assert.deepEqual(expert.scores.map((x) => x.name), ['Hana', 'Gus']);
  assert.equal(boards.minesweeper.boards.find((b) => b.id === 'minesweeper:beginner').scores.length, 0);
  gus.close();
});

test('identity secrets are enforced', async () => {
  const a = await new Client('Hal').connect();
  const b = new Client('Imposter');
  b.id = a.id;
  await assert.rejects(b.connect(), /Identity already in use/);
  a.close();
  b.close();
});

test('seat indexes from clients are validated', async () => {
  const host = await new Client('Ivy').connect();
  const { code } = await host.request({ t: 'room.create', game: 'yahtzee', mode: 'online', seats: 3 });
  await host.request({ t: 'room.join', code });
  for (const seat of ['__proto__', -1, 1.5, 99, '1']) {
    await assert.rejects(host.request({ t: 'room.seat', code, seat, kind: 'bot', level: 'easy' }), /No such seat/);
  }
  await host.request({ t: 'room.seat', code, seat: 1, kind: 'bot', level: 'easy' });
  const room = await host.waitRoom((r) => r.seats[1].kind === 'bot');
  assert.equal(room.seats.length, 3);
  host.close();
});

test('mastermind online: each player sees only the code they set', async () => {
  const ana = await new Client('Ana').connect();
  const ben = await new Client('Ben').connect();
  const { code } = await ana.request({ t: 'room.create', game: 'mastermind', mode: 'online', seats: 2 });
  await ana.request({ t: 'room.join', code });
  await ben.request({ t: 'room.join', code });
  await ana.waitRoom((r) => r.seats[1].kind === 'human');
  await ana.request({ t: 'room.start' });
  await ben.waitRoom((r) => r.phase === 'playing');
  await ana.request({ t: 'room.act', action: { type: 'setCode', code: [1, 2, 3, 4] } });
  await ben.request({ t: 'room.act', action: { type: 'setCode', code: [5, 5, 0, 0] } });
  const rb = await ben.waitRoom((r) => r.views[1]?.phase === 'playing');
  const ra = await ana.waitRoom((r) => r.views[0]?.phase === 'playing');
  assert.deepEqual(ra.views[0].myCode, [1, 2, 3, 4]);
  assert.deepEqual(rb.views[1].myCode, [5, 5, 0, 0]);
  assert.equal(ra.views[0].targets, null, 'nobody sees the code they have to crack');
  assert.equal(rb.views[1].targets, null);
  assert.ok(!JSON.stringify(ra).includes('[5,5,0,0]'), "Ben's code never reaches Ana's browser");
  await ana.request({ t: 'room.act', action: { type: 'guess', code: [5, 5, 0, 0] } });
  await ben.request({ t: 'room.act', action: { type: 'guess', code: [1, 2, 3, 3] } });
  const over = await ana.waitRoom((r) => r.phase === 'over');
  assert.deepEqual(over.result.winners, [0]);
  assert.deepEqual(over.views[0].targets, [[5, 5, 0, 0], [1, 2, 3, 4]], 'codes are revealed at the end');
  ana.close();
  ben.close();
});

test('mastermind solo can be played without a computer opponent', async () => {
  const kim = await new Client('Kim').connect();
  const { code } = await kim.request({ t: 'room.create', game: 'mastermind', mode: 'solo', bots: 0, level: 'hard' });
  await kim.request({ t: 'room.join', code });
  const room = await kim.waitRoom((r) => r.phase === 'playing');
  assert.equal(room.seats.length, 1);
  assert.equal(room.views[0].phase, 'playing');
  const two = await kim.request({ t: 'room.create', game: 'mastermind', mode: 'solo', bots: 1, level: 'hard' });
  await kim.request({ t: 'room.join', code: two.code });
  const r2 = await kim.waitRoom((r) => r.code === two.code && r.phase === 'playing' && r.views[0]?.ready[1]);
  assert.equal(r2.seats[1].kind, 'bot');
  assert.equal(r2.views[0].phase, 'setup', 'the computer has set its code; you still need to set yours');
  kim.close();
});
