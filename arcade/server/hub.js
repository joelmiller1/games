// The hub owns every WebSocket connection, player identity, the lobby and the room registry.
import crypto from 'node:crypto';
import { Room, humanSeat, botSeat, openSeat } from './room.js';
import { GAMES, getGame, normalizeOptions, PLAYER_COLORS } from '../shared/games/meta.js';
import { GameError } from '../shared/lib/game.js';
import { MAX_SCORE } from '../shared/games/pinball.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const LEVELS = ['easy', 'medium', 'hard'];

export function cleanName(name, fallback = 'Player') {
  const s = String(name ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 20);
  return s || fallback;
}

function cleanColor(c) {
  return typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c) ? c : PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)];
}

export class Hub {
  constructor({ config, store, bots, log }) {
    this.config = config;
    this.store = store;
    this.bots = bots;
    this.log = log;
    this.players = new Map(); // id -> { id, secret, name, color, conns:Set }
    this.conns = new Set();
    this.rooms = new Map();
    this.lobbyWatchers = new Set();
    this.lobbyTimer = null;
    this.stats = { gamesStarted: 0, connections: 0 };
    this.nextConnId = 1;
    this.sweeper = setInterval(() => this.sweep(), 60 * 1000);
    this.sweeper.unref?.();
  }

  // ---- connections ----
  onConnection(ws, req) {
    const conn = {
      id: this.nextConnId++,
      ws,
      player: null,
      room: null,
      alive: true,
      tokens: 40,
      lastRefill: Date.now(),
      ip: req?.socket?.remoteAddress,
    };
    this.conns.add(conn);
    this.stats.connections++;
    ws.on('message', (data, isBinary) => this.onRaw(conn, data, isBinary));
    ws.on('pong', () => (conn.alive = true));
    ws.on('close', () => this.onClose(conn));
    ws.on('error', () => {});
  }

  onClose(conn) {
    this.conns.delete(conn);
    this.lobbyWatchers.delete(conn);
    if (conn.room) conn.room.removeViewer(conn);
    conn.room = null;
    if (conn.player) {
      conn.player.conns.delete(conn);
      this.lobbyChanged();
    }
  }

  heartbeat() {
    for (const conn of this.conns) {
      if (!conn.alive) {
        conn.ws.terminate();
        continue;
      }
      conn.alive = false;
      try {
        conn.ws.ping();
      } catch {
        /* closed */
      }
    }
  }

  send(conn, msg) {
    if (conn.ws.readyState !== 1) return;
    try {
      conn.ws.send(JSON.stringify(msg));
    } catch (e) {
      this.log.debug('send failed', e.message);
    }
  }

  rateLimited(conn) {
    const now = Date.now();
    conn.tokens = Math.min(40, conn.tokens + ((now - conn.lastRefill) / 1000) * 20);
    conn.lastRefill = now;
    if (conn.tokens < 1) return true;
    conn.tokens -= 1;
    return false;
  }

  onRaw(conn, data, isBinary) {
    if (isBinary) return;
    if (this.rateLimited(conn)) {
      this.send(conn, { t: 'error', message: 'Slow down!' });
      return;
    }
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (!msg || typeof msg.t !== 'string') return;
    const rid = msg.rid;
    try {
      const result = this.handle(conn, msg);
      if (rid !== undefined) this.send(conn, { t: 'res', rid, ok: true, data: result ?? null });
    } catch (e) {
      const message = e instanceof GameError ? e.message : 'Something went wrong';
      if (!(e instanceof GameError)) this.log.error(`error handling ${msg.t}`, e);
      if (rid !== undefined) this.send(conn, { t: 'res', rid, ok: false, error: message });
      else this.send(conn, { t: 'error', message });
    }
  }

  handle(conn, msg) {
    if (msg.t === 'hello') return this.hello(conn, msg);
    if (msg.t === 'ping') {
      this.send(conn, { t: 'pong', time: Date.now() });
      return null;
    }
    if (!conn.player) throw new GameError('Say hello first');
    const player = conn.player;
    const room = () => {
      const r = conn.room;
      if (!r || (msg.code && msg.code !== r.code)) throw new GameError('You are not in that room');
      return r;
    };
    switch (msg.t) {
      case 'profile':
        return this.updateProfile(player, msg);
      case 'lobby.watch':
        if (msg.on === false) this.lobbyWatchers.delete(conn);
        else {
          this.lobbyWatchers.add(conn);
          this.send(conn, this.lobbyMessage());
        }
        return null;
      case 'room.create':
        return this.createRoom(player, msg);
      case 'room.join':
        return this.joinRoom(conn, msg.code);
      case 'room.unwatch':
        if (conn.room) conn.room.removeViewer(conn);
        conn.room = null;
        return null;
      case 'room.leave': {
        const r = conn.room || this.rooms.get(String(msg.code || '').toUpperCase());
        if (r) r.leave(player);
        conn.room = null;
        return null;
      }
      case 'room.sit':
        return room().sit(player, msg.seat);
      case 'room.stand':
        return room().standUp(player);
      case 'room.seat':
        return room().configureSeat(player, msg.seat, msg.kind, msg.level);
      case 'room.addSeat':
        return room().addSeat(player);
      case 'room.removeSeat':
        return room().removeSeat(player, msg.seat);
      case 'room.start':
        return room().start(player);
      case 'room.act':
        return room().act(player, msg.seat, msg.action);
      case 'room.resign':
        return room().resign(player, msg.seat);
      case 'room.rematch':
        return room().voteRematch(player);
      case 'room.chat': {
        const text = String(msg.text ?? '')
          .replace(/[\u0000-\u001f\u007f]/g, ' ')
          .trim()
          .slice(0, 300);
        if (text) room().say(player, text);
        return null;
      }
      case 'score.submit':
        return this.submitScore(player, msg);
      default:
        throw new GameError('Unknown request');
    }
  }

  hello(conn, msg) {
    if (!ID_RE.test(msg.id || '') || !ID_RE.test(msg.secret || '')) throw new GameError('Invalid identity');
    let player = this.players.get(msg.id);
    if (player && player.secret !== msg.secret) {
      this.send(conn, { t: 'identity.reset' });
      throw new GameError('Identity already in use');
    }
    if (!player) {
      player = { id: msg.id, secret: msg.secret, name: cleanName(msg.name), color: cleanColor(msg.color), conns: new Set() };
      this.players.set(player.id, player);
    }
    if (conn.player && conn.player !== player) conn.player.conns.delete(conn);
    conn.player = player;
    player.conns.add(conn);
    if (msg.name) this.updateProfile(player, msg, true);
    this.send(conn, {
      t: 'welcome',
      id: player.id,
      name: player.name,
      color: player.color,
      time: Date.now(),
      version: this.config.version,
    });
    this.lobbyChanged();
    return null;
  }

  updateProfile(player, msg, quiet = false) {
    const name = cleanName(msg.name, player.name);
    const color = msg.color ? cleanColor(msg.color) : player.color;
    if (name === player.name && color === player.color) return null;
    player.name = name;
    player.color = color;
    for (const room of this.rooms.values()) {
      let changed = false;
      for (const seat of room.seats) {
        if (seat.kind === 'human' && seat.playerId === player.id && !seat.local) {
          seat.name = name;
          seat.color = color;
          changed = true;
        }
      }
      if (changed || room.spectators.has(player.id)) room.broadcast();
    }
    if (!quiet) this.lobbyChanged();
    return null;
  }

  playerName(id) {
    return this.players.get(id)?.name || 'Someone';
  }

  // ---- rooms ----
  newCode() {
    for (let i = 0; i < 1000; i++) {
      let code = '';
      for (let k = 0; k < 4; k++) code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
      if (!this.rooms.has(code)) return code;
    }
    throw new GameError('No free room codes');
  }

  createRoom(player, msg) {
    const meta = getGame(msg.game);
    if (!meta) throw new GameError('Unknown game');
    if (this.rooms.size >= this.config.maxRooms) throw new GameError('The server is full, try again later');
    const mine = [...this.rooms.values()].filter((r) => r.hostId === player.id);
    if (mine.length >= 12) {
      // Drop the player's oldest abandoned table instead of refusing.
      const idle = mine.filter((r) => r.viewers.size === 0).sort((a, b) => a.lastActive - b.lastActive)[0];
      if (idle) this.closeRoom(idle, 'Closed to make room');
      else throw new GameError('You have too many tables open');
    }
    const mode = ['online', 'solo', 'local'].includes(msg.mode) ? msg.mode : 'online';
    const options = normalizeOptions(meta, msg.options);
    const level = LEVELS.includes(msg.level) ? msg.level : 'medium';
    const [min, max] = meta.players;
    const room = new Room(this, {
      code: this.newCode(),
      gameId: meta.id,
      mode,
      visibility: mode === 'online' && msg.visibility !== 'private' ? 'public' : 'private',
      options,
      hostId: player.id,
    });

    if (mode === 'solo') {
      if (!meta.bots && max > 1 && min > 1) throw new GameError('This game has no computer players');
      const bots = meta.players[1] === 2 ? 1 : Math.max(0, Math.min(max - 1, Number(msg.bots) || 0));
      const total = Math.max(min, 1 + bots);
      let seat = Number.isInteger(msg.seat) && msg.seat >= 0 && msg.seat < total ? msg.seat : 0;
      if (msg.seat === -1) seat = Math.floor(Math.random() * total);
      for (let i = 0; i < total; i++) room.seats.push(i === seat ? humanSeat(player) : botSeat(level, i));
    } else if (mode === 'local') {
      const names = Array.isArray(msg.names) ? msg.names.slice(0, max) : [];
      const bots = meta.bots ? Math.max(0, Math.min(max - names.length, Number(msg.bots) || 0)) : 0;
      if (names.length + bots < min || names.length < 1) throw new GameError(`This game needs at least ${min} players`);
      names.forEach((n, i) => {
        room.seats.push({
          ...humanSeat(player),
          name: cleanName(n, `Player ${i + 1}`),
          color: PLAYER_COLORS[i % PLAYER_COLORS.length],
          local: true,
        });
      });
      for (let i = 0; i < bots; i++) room.seats.push(botSeat(level, i));
    } else {
      const seats = Math.max(min, Math.min(max, Number(msg.seats) || meta.onlineDefault || min));
      room.seats.push(humanSeat(player));
      for (let i = 1; i < seats; i++) room.seats.push(openSeat());
    }
    this.rooms.set(room.code, room);
    this.log.info(`room ${room.code} created: ${meta.id} (${mode}) by ${player.name}`);
    if (mode !== 'online') room.startGame();
    this.lobbyChanged();
    return { code: room.code };
  }

  joinRoom(conn, code) {
    const room = this.rooms.get(String(code || '').toUpperCase());
    if (!room) throw new GameError('That table does not exist (it may have closed)');
    if (conn.room && conn.room !== room) conn.room.removeViewer(conn);
    conn.room = room;
    room.addViewer(conn);
    return { code: room.code, game: room.gameId };
  }

  closeRoom(room, reason) {
    if (!this.rooms.has(room.code)) return;
    this.rooms.delete(room.code);
    room.close(reason);
    this.log.info(`room ${room.code} closed: ${reason}`);
    this.lobbyChanged();
  }

  // ---- results ----
  recordGame(room, out) {
    const humans = room.seats.map((s, i) => ({ s, i })).filter(({ s }) => s.kind === 'human' && !s.playerId.startsWith('left:'));
    if (room.meta.leaderboard && out.scores) {
      for (const { s, i } of humans) {
        const rank = this.store.addScore(room.gameId, s.name, out.scores[i], { players: room.seats.length });
        if (rank) room.system(`${s.name} is #${rank} on the ${room.meta.name} high score table!`);
      }
    } else if (humans.length >= 2) {
      for (const { s, i } of humans) {
        const result = out.draw ? 'draw' : out.winners.includes(i) ? 'win' : 'loss';
        this.store.recordResult(room.gameId, s.name, result);
      }
    }
  }

  /** Scores from games played entirely in the browser (solo / pass-and-play pinball). */
  submitScore(player, msg) {
    const meta = getGame(msg.game);
    if (!meta?.leaderboard || !meta.realtime) throw new GameError('Scores for that game are recorded automatically');
    const entries = Array.isArray(msg.scores) ? msg.scores.slice(0, 4) : [{ name: msg.name, score: msg.score }];
    for (const e of entries) {
      if (!e || !Number.isInteger(e.score) || e.score < 0 || e.score > MAX_SCORE) throw new GameError('Invalid score');
    }
    const now = Date.now();
    if (player.lastScoreAt && now - player.lastScoreAt < 3000) throw new GameError('Too many scores');
    player.lastScoreAt = now;
    const ranks = entries.map((e) => this.store.addScore(meta.id, cleanName(e.name, player.name), e.score, { players: entries.length }));
    return { rank: ranks[0], ranks };
  }

  leaderboards() {
    const out = {};
    for (const g of GAMES) {
      out[g.id] = g.leaderboard ? { scores: this.store.scores(g.id, 10) } : { records: this.store.records(g.id, 10) };
    }
    return out;
  }

  // ---- lobby ----
  lobbyMessage() {
    const rooms = [...this.rooms.values()]
      .filter((r) => r.visibility === 'public' && r.mode === 'online')
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 100)
      .map((r) => r.summary());
    let online = 0;
    for (const p of this.players.values()) if (p.conns.size) online++;
    return { t: 'lobby', rooms, online };
  }

  lobbyChanged() {
    if (this.lobbyTimer || this.lobbyWatchers.size === 0) return;
    this.lobbyTimer = setTimeout(() => {
      this.lobbyTimer = null;
      const msg = this.lobbyMessage();
      for (const c of this.lobbyWatchers) this.send(c, msg);
    }, 150);
    this.lobbyTimer.unref?.();
  }

  sweep() {
    const now = Date.now();
    const idleMs = this.config.roomIdleMinutes * 60 * 1000;
    for (const room of [...this.rooms.values()]) {
      const humansViewing = room.viewers.size > 0;
      if (!humansViewing && now - room.lastActive > idleMs) this.closeRoom(room, 'Closed after being idle');
    }
    // Forget players with no connections and no rooms after a while.
    for (const [id, p] of this.players) {
      if (p.conns.size) {
        p.seen = now;
        continue;
      }
      if (!p.seen) p.seen = now;
      if (now - p.seen > 6 * 60 * 60 * 1000) {
        const inRoom = [...this.rooms.values()].some((r) => r.humanIds().has(id) || r.spectators.has(id));
        if (!inRoom) this.players.delete(id);
      }
    }
  }

  info() {
    let online = 0;
    for (const p of this.players.values()) if (p.conns.size) online++;
    return { rooms: this.rooms.size, online, connections: this.conns.size, gamesStarted: this.stats.gamesStarted };
  }

  shutdown() {
    clearInterval(this.sweeper);
    for (const room of this.rooms.values()) room.close('The server is restarting');
    for (const c of this.conns) {
      this.send(c, { t: 'server.restart' });
      try {
        c.ws.close(1012, 'restart');
      } catch {
        /* ignore */
      }
    }
  }
}
