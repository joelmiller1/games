import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { createApp } from '../server/app.js';
import { loadConfig } from '../server/config.js';

let dataDir;

before(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arcade-tables-'));
});

after(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

async function start(env = {}) {
  const config = { ...loadConfig(env), dataDir, botThreads: 0, logLevel: 'silent' };
  const app = await createApp(config);
  const addr = await app.listen(0, '127.0.0.1');
  app.base = `127.0.0.1:${addr.port}`;
  return app;
}

class Client {
  constructor(name, { id, secret } = {}) {
    this.name = name;
    this.id = id || 'id' + Math.random().toString(36).slice(2, 12);
    this.secret = secret || 'sec' + Math.random().toString(36).slice(2, 12);
    this.rid = 0;
    this.pending = new Map();
    this.messages = [];
    this.waiters = [];
  }

  async connect(app) {
    this.room = null;
    this.messages = [];
    this.ws = new WebSocket(`ws://${app.base}/ws`);
    await new Promise((resolve, reject) => {
      this.ws.once('open', resolve);
      this.ws.once('error', reject);
    });
    this.closed = new Promise((resolve) => this.ws.once('close', resolve));
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

test('an online game in progress survives a restart', async () => {
  let app = await start();
  const alice = await new Client('Alice').connect(app);
  const bob = await new Client('Bob').connect(app);
  const { code } = await alice.request({ t: 'room.create', game: 'tictactoe', mode: 'online' });
  await alice.request({ t: 'room.join', code });
  await bob.request({ t: 'room.join', code });
  await alice.waitRoom((r) => r.seats[1].kind === 'human');
  await alice.request({ t: 'room.start' });
  await alice.request({ t: 'room.act', action: { type: 'place', cell: 0 } });
  await bob.request({ t: 'room.act', action: { type: 'place', cell: 4 } });
  await alice.request({ t: 'room.chat', text: 'brb' });

  await app.close();
  await Promise.all([alice.closed, bob.closed]);
  assert.ok(alice.messages.some((m) => m.t === 'server.restart'));
  assert.ok(!alice.messages.some((m) => m.t === 'room.closed'), 'players are not told the table closed');

  app = await start();
  // Someone who saw Alice's id at the table cannot take her seat with a different secret.
  const imposter = new Client('Mallory', { id: alice.id });
  await assert.rejects(imposter.connect(app), /Identity already in use/);
  imposter.close();

  await alice.connect(app);
  await bob.connect(app);
  await alice.request({ t: 'room.join', code });
  await bob.request({ t: 'room.join', code });
  let room = await alice.waitRoom((r) => r.seats[1].connected);
  assert.equal(room.phase, 'playing');
  assert.equal(room.hostId, alice.id);
  assert.deepEqual(room.you.seats, [0]);
  assert.equal(room.views[0].board.filter((c) => c !== null).length, 2);
  const history = alice.messages.find((m) => m.t === 'chat.history');
  assert.ok(history.messages.some((m) => m.text === 'brb'));

  // Play carries on: Alice finishes the top row.
  await alice.request({ t: 'room.act', action: { type: 'place', cell: 1 } });
  await bob.request({ t: 'room.act', action: { type: 'place', cell: 5 } });
  await alice.request({ t: 'room.act', action: { type: 'place', cell: 2 } });
  room = await bob.waitRoom((r) => r.phase === 'over');
  assert.deepEqual(room.result.winners, [0]);
  alice.close();
  bob.close();
  await app.close();
});

test('a computer player waiting to move picks up after a restart', async () => {
  let app = await start();
  const carol = await new Client('Carol').connect(app);
  // Carol takes the second seat, so the computer moves first.
  const { code } = await carol.request({ t: 'room.create', game: 'connect4', mode: 'solo', level: 'easy', seat: 1 });
  await carol.request({ t: 'room.join', code });
  await carol.waitRoom((r) => r.phase === 'playing');
  // Shut down before the computer's move delay runs out.
  await app.close();

  app = await start();
  await carol.connect(app);
  await carol.request({ t: 'room.join', code });
  const room = await carol.waitRoom((r) => r.views[1] && r.views[1].cols.flat().length === 1);
  assert.equal(room.views[1].turn, 1);
  carol.close();
  await app.close();
});

test('SAVE_TABLES=false closes tables on restart as before', async () => {
  let app = await start({ SAVE_TABLES: 'false' });
  const dan = await new Client('Dan').connect(app);
  const { code } = await dan.request({ t: 'room.create', game: 'tictactoe', mode: 'online' });
  await dan.request({ t: 'room.join', code });
  await app.close();
  await dan.closed;
  assert.ok(dan.messages.some((m) => m.t === 'room.closed'));

  app = await start({ SAVE_TABLES: 'false' });
  await dan.connect(app);
  await assert.rejects(dan.request({ t: 'room.join', code }), /does not exist/);
  dan.close();
  await app.close();
});

test('a running chess clock is paused for the time the server was down', async () => {
  const { Room } = await import('../server/room.js');
  const saved = {
    code: 'ABCD',
    gameId: 'chess',
    mode: 'solo',
    visibility: 'private',
    options: { clock: '300+0' },
    hostId: null,
    seats: [],
    spectators: [],
    phase: 'playing',
    state: { clock: { base: 300000, inc: 0, remaining: [300000, 300000], turnStart: 1000 } },
    version: 3,
    result: null,
    lastResult: null,
    rematch: [],
    chat: [],
    chatSeq: 0,
    gameNo: 1,
    createdAt: 0,
    lastActive: 0,
  };
  const room = Room.fromJSON({}, saved, 60000);
  assert.equal(room.state.clock.turnStart, 61000);
  assert.throws(() => Room.fromJSON({}, { ...saved, gameId: 'nope' }), /unknown game/);
});
