// A room hosts one game table: seats (humans, computer players or open), spectators,
// the authoritative game state, chat, rematches and the computer-player/clock timers.
import { ENGINES } from '../shared/games/index.js';
import { getGame, seatLabel, botName, PLAYER_COLORS } from '../shared/games/meta.js';
import { GameError } from '../shared/lib/game.js';

const BOT_DELAY = {
  yahtzee: 850,
  battleship: 750,
  tictactoe: 550,
  connect4: 450,
  checkers: 350,
  chess: 250,
  reversi: 400,
  mancala: 700,
  dotsboxes: 450,
  mastermind: 900,
  liarsdice: 1300,
};
const BOT_COLORS = ['#94a3b8', '#a8a29e', '#9ca3af', '#a1a1aa', '#cbd5e1'];

export function humanSeat(player) {
  return { kind: 'human', playerId: player.id, name: player.name, color: player.color, level: null, wins: 0, local: false };
}

export function botSeat(level, index = 0) {
  return { kind: 'bot', playerId: null, name: botName(level), color: BOT_COLORS[index % BOT_COLORS.length], level, wins: 0 };
}

export function openSeat() {
  return { kind: 'open', playerId: null, name: 'Open seat', color: '#64748b', level: null, wins: 0 };
}

export class Room {
  constructor(hub, { code, gameId, mode, visibility, options, hostId }) {
    this.hub = hub;
    this.code = code;
    this.gameId = gameId;
    this.meta = getGame(gameId);
    this.engine = ENGINES[gameId];
    this.mode = mode; // 'online' | 'solo' | 'local'
    this.visibility = visibility; // 'public' | 'private'
    this.options = options;
    this.hostId = hostId;
    this.seats = [];
    this.spectators = new Set();
    this.viewers = new Set();
    this.phase = 'waiting'; // 'waiting' | 'playing' | 'over'
    this.state = null;
    this.version = 0;
    this.result = null;
    this.lastResult = null;
    this.rematch = new Set();
    this.chat = [];
    this.chatSeq = 0;
    this.gameNo = 0;
    this.createdAt = Date.now();
    this.lastActive = Date.now();
    this.botTimer = null;
    this.botPending = false;
    this.clockTimer = null;
    this.closed = false;
  }

  // ---- helpers ----
  touch() {
    this.lastActive = Date.now();
  }

  controlledSeats(playerId) {
    const out = [];
    this.seats.forEach((s, i) => {
      if (s.kind === 'human' && s.playerId === playerId) out.push(i);
    });
    return out;
  }

  humanIds() {
    return new Set(this.seats.filter((s) => s.kind === 'human').map((s) => s.playerId));
  }

  isViewing(playerId) {
    for (const c of this.viewers) if (c.player?.id === playerId) return true;
    return false;
  }

  seatConnected(seat) {
    if (seat.kind === 'bot') return true;
    if (seat.kind !== 'human') return false;
    return this.isViewing(seat.playerId);
  }

  isHost(player) {
    return player.id === this.hostId;
  }

  requireHost(player) {
    if (!this.isHost(player)) throw new GameError('Only the host can do that');
  }

  requireWaiting() {
    if (this.phase !== 'waiting') throw new GameError('The game has already started');
  }

  /** Seat numbers come from the browser: accept only real indexes. */
  seatAt(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.seats.length) throw new GameError('No such seat');
    return this.seats[index];
  }

  // ---- views ----
  summary() {
    return {
      code: this.code,
      game: this.gameId,
      phase: this.phase,
      mode: this.mode,
      host: this.hub.playerName(this.hostId),
      seats: this.seats.map((s) => ({ kind: s.kind, name: s.name, color: s.color })),
      open: this.seats.filter((s) => s.kind === 'open').length,
      spectators: this.spectators.size,
      createdAt: this.createdAt,
    };
  }

  snapshot(conn) {
    const pid = conn.player.id;
    const mine = this.controlledSeats(pid);
    const views = {};
    let view = null;
    if (this.state) {
      if (mine.length) for (const i of mine) views[i] = this.engine.view(this.state, i);
      else view = this.engine.view(this.state, null);
    }
    return {
      t: 'room',
      room: {
        code: this.code,
        game: this.gameId,
        mode: this.mode,
        visibility: this.visibility,
        options: this.options,
        phase: this.phase,
        gameNo: this.gameNo,
        version: this.version,
        hostId: this.hostId,
        seats: this.seats.map((s, i) => ({
          index: i,
          kind: s.kind,
          name: s.name,
          color: s.color,
          level: s.level,
          playerId: s.playerId,
          connected: this.seatConnected(s),
          wins: s.wins,
          label: seatLabel(this.meta, i),
        })),
        spectators: [...this.spectators].map((id) => this.hub.playerName(id)),
        you: { id: pid, seats: mine, host: pid === this.hostId, spectator: mine.length === 0 },
        actors: this.state && this.phase === 'playing' ? this.engine.actors(this.state) : [],
        result: this.result,
        lastResult: this.lastResult,
        rematch: [...this.rematch],
        views,
        view,
      },
    };
  }

  broadcast() {
    for (const c of this.viewers) this.hub.send(c, this.snapshot(c));
  }

  // ---- membership ----
  addViewer(conn) {
    this.touch();
    const player = conn.player;
    this.viewers.add(conn);
    if (this.controlledSeats(player.id).length === 0 && !this.spectators.has(player.id)) {
      const open = this.seats.findIndex((s) => s.kind === 'open');
      if (this.phase === 'waiting' && this.mode === 'online' && open >= 0) {
        this.seats[open] = humanSeat(player);
        this.system(`${player.name} joined`);
      } else {
        this.spectators.add(player.id);
        this.system(`${player.name} is watching`);
      }
      this.hub.lobbyChanged();
    }
    this.hub.send(conn, { t: 'chat.history', code: this.code, messages: this.chat });
    this.broadcast();
    this.hub.lobbyChanged();
  }

  removeViewer(conn) {
    if (!this.viewers.delete(conn)) return;
    if (!this.closed) this.broadcast();
    this.hub.lobbyChanged();
  }

  leave(player) {
    this.touch();
    const seats = this.controlledSeats(player.id);
    this.spectators.delete(player.id);
    this.rematch.delete(player.id);
    for (const c of [...this.viewers]) {
      if (c.player?.id === player.id) {
        this.viewers.delete(c);
        if (c.room === this) c.room = null;
      }
    }
    if (this.mode !== 'online' && seats.length) {
      // Solo and pass-and-play tables belong to one device: leaving closes them.
      this.hub.closeRoom(this, 'The table was closed');
      return;
    }
    if (seats.length) {
      const name = this.seats[seats[0]].name;
      if (this.phase === 'waiting') {
        for (const i of seats) this.seats[i] = openSeat();
        this.system(`${name} left`);
      } else if (this.phase === 'playing') {
        if (this.meta.leaveMode === 'bot') {
          for (const i of seats) {
            const wins = this.seats[i].wins;
            this.seats[i] = { ...botSeat('medium', i), wins, name: `${name} (computer)` };
          }
          this.system(`${name} left: the computer took over their seat`);
          this.scheduleBot();
        } else {
          let s = this.state;
          for (const i of seats) s = this.engine.forfeit(s, i, `${name} left the game`);
          for (const i of seats) this.seats[i] = { ...this.seats[i], playerId: `left:${player.id}` };
          this.system(`${name} left the game`);
          this.commit(s);
        }
      } else {
        for (const i of seats) this.seats[i] = openSeat();
        this.lastResult = this.result;
        this.result = null;
        this.state = null;
        this.phase = 'waiting';
        this.system(`${name} left`);
      }
    }
    if (this.hostId === player.id) {
      const next = [...this.humanIds()].find((id) => !id.startsWith('left:'));
      this.hostId = next || null;
      if (next) this.system(`${this.hub.playerName(next)} is now the host`);
    }
    const humans = [...this.humanIds()].filter((id) => !id.startsWith('left:'));
    if (humans.length === 0 && this.spectators.size === 0) {
      this.hub.closeRoom(this, 'Everyone left');
      return;
    }
    this.broadcast();
    this.hub.lobbyChanged();
  }

  sit(player, index) {
    this.requireWaiting();
    if (this.mode !== 'online') throw new GameError('Seats cannot be changed here');
    const seat = this.seatAt(index);
    if (seat.kind !== 'open') throw new GameError('That seat is not free');
    for (const i of this.controlledSeats(player.id)) this.seats[i] = openSeat();
    this.seats[index] = humanSeat(player);
    this.spectators.delete(player.id);
    this.touch();
    this.broadcast();
    this.hub.lobbyChanged();
  }

  standUp(player) {
    this.requireWaiting();
    const seats = this.controlledSeats(player.id);
    if (!seats.length) return;
    for (const i of seats) this.seats[i] = openSeat();
    this.spectators.add(player.id);
    this.broadcast();
    this.hub.lobbyChanged();
  }

  configureSeat(player, index, kind, level) {
    this.requireHost(player);
    this.requireWaiting();
    const seat = this.seatAt(index);
    if (seat.kind === 'human' && seat.playerId === player.id) throw new GameError('You are sitting there');
    if (kind === 'bot') {
      if (!this.meta.bots) throw new GameError('This game has no computer players');
      const lv = ['easy', 'medium', 'hard'].includes(level) ? level : 'medium';
      if (seat.kind === 'human') this.spectators.add(seat.playerId);
      this.seats[index] = botSeat(lv, index);
    } else if (kind === 'open') {
      if (seat.kind === 'human') {
        this.spectators.add(seat.playerId);
        this.system(`${seat.name} was moved to the audience`);
      }
      this.seats[index] = openSeat();
    } else throw new GameError('Invalid seat type');
    this.touch();
    this.broadcast();
    this.hub.lobbyChanged();
  }

  addSeat(player) {
    this.requireHost(player);
    this.requireWaiting();
    if (this.seats.length >= this.meta.players[1]) throw new GameError('The table is full');
    this.seats.push(openSeat());
    this.broadcast();
    this.hub.lobbyChanged();
  }

  removeSeat(player, index) {
    this.requireHost(player);
    this.requireWaiting();
    if (this.seats.length <= this.meta.players[0]) throw new GameError(`This game needs at least ${this.meta.players[0]} players`);
    const seat = this.seatAt(index);
    if (seat.kind === 'human') {
      if (seat.playerId === player.id) throw new GameError('You cannot remove your own seat');
      this.spectators.add(seat.playerId);
    }
    this.seats.splice(index, 1);
    this.broadcast();
    this.hub.lobbyChanged();
  }

  // ---- game flow ----
  start(player) {
    this.requireHost(player);
    this.requireWaiting();
    if (this.seats.some((s) => s.kind === 'open')) throw new GameError('Waiting for players to fill the open seats');
    if (!this.seats.some((s) => s.kind === 'human')) throw new GameError('At least one person has to play');
    this.startGame();
  }

  startGame() {
    this.state = this.engine.setup({ players: this.seats.length, options: this.options, rng: Math.random });
    this.phase = 'playing';
    this.result = null;
    this.rematch.clear();
    this.gameNo++;
    this.version++;
    this.touch();
    this.hub.stats.gamesStarted++;
    if (this.gameNo > 1) this.system(`Game ${this.gameNo} started`);
    this.broadcast();
    this.hub.lobbyChanged();
    this.scheduleBot();
    this.scheduleClock();
  }

  act(player, seatIndex, action) {
    if (this.phase !== 'playing') throw new GameError('The game is not in progress');
    const mine = this.controlledSeats(player.id);
    const seat = seatIndex === undefined || seatIndex === null ? (mine.length === 1 ? mine[0] : -1) : seatIndex;
    if (!mine.includes(seat)) throw new GameError('That is not your seat');
    this.touch();
    const next = this.engine.act(this.state, seat, action, { rng: Math.random, now: Date.now() });
    this.commit(next);
  }

  resign(player, seatIndex) {
    if (this.phase !== 'playing') throw new GameError('The game is not in progress');
    const mine = this.controlledSeats(player.id);
    const seat = seatIndex ?? mine[0];
    if (!mine.includes(seat)) throw new GameError('That is not your seat');
    if (this.meta.leaveMode === 'bot') throw new GameError('Resigning is not available in this game');
    this.commit(this.engine.forfeit(this.state, seat, `${this.seats[seat].name} resigned`));
  }

  commit(next) {
    this.state = next;
    this.version++;
    const out = this.engine.outcome(next);
    if (out && this.phase === 'playing') this.finish(out);
    this.broadcast();
    this.scheduleBot();
    this.scheduleClock();
  }

  finish(out) {
    this.phase = 'over';
    this.result = {
      ...out,
      names: out.winners.map((i) => this.seats[i]?.name),
    };
    if (!out.draw) for (const i of out.winners) if (this.seats[i]) this.seats[i].wins++;
    this.rematch.clear();
    this.clearTimers();
    try {
      this.hub.recordGame(this, out);
    } catch (e) {
      this.hub.log.warn('recording results failed', e.message);
    }
    this.hub.lobbyChanged();
  }

  voteRematch(player) {
    if (this.phase !== 'over') throw new GameError('The game is still going');
    if (!this.controlledSeats(player.id).length) throw new GameError('Only players can ask for a rematch');
    this.rematch.add(player.id);
    if (this.seats.some((s) => s.kind === 'human' && s.playerId.startsWith('left:'))) {
      // Someone walked out: reopen their seat so a new player (or the computer) can take it.
      this.seats = this.seats.map((s) => (s.kind === 'human' && s.playerId.startsWith('left:') ? openSeat() : s));
      this.lastResult = this.result;
      this.result = null;
      this.state = null;
      this.phase = 'waiting';
      this.rematch.clear();
      if (this.mode === 'online' && !this.hostId) this.hostId = player.id;
      this.broadcast();
      this.hub.lobbyChanged();
      return;
    }
    // Wait for everyone who is still at the table; players who dropped out keep their seat.
    const humans = [...this.humanIds()].filter((id) => this.isViewing(id) || id === player.id);
    if (humans.every((id) => this.rematch.has(id))) {
      // Rotate seats so someone else moves first (and colours swap in two-player games).
      if (this.seats.length > 1) this.seats.push(this.seats.shift());
      this.startGame();
    } else {
      this.system(`${this.seats[this.controlledSeats(player.id)[0]].name} wants a rematch`);
      this.broadcast();
    }
  }

  // ---- computer players and clocks ----
  scheduleBot() {
    if (this.closed || this.botPending || this.phase !== 'playing') return;
    const actors = this.engine.actors(this.state);
    const seatIndex = actors.find((i) => this.seats[i]?.kind === 'bot');
    if (seatIndex === undefined) return;
    this.botPending = true;
    const version = this.version;
    const delay = this.engine.botDelay?.(this.state) ?? BOT_DELAY[this.gameId] ?? 500;
    this.botTimer = setTimeout(() => this.runBot(seatIndex, version), delay);
    this.botTimer.unref?.();
  }

  async runBot(seatIndex, version) {
    this.botTimer = null;
    const seat = this.seats[seatIndex];
    let action = null;
    let error = null;
    try {
      action = await this.hub.bots.run({ game: this.gameId, state: this.state, player: seatIndex, level: seat.level });
    } catch (e) {
      error = e;
    }
    this.botPending = false;
    if (this.closed || this.phase !== 'playing') return;
    if (this.version !== version || this.seats[seatIndex]?.kind !== 'bot') {
      this.scheduleBot();
      return;
    }
    const ctx = () => ({ rng: Math.random, now: Date.now(), deadline: Date.now() + 250 });
    try {
      if (error) throw error;
      this.commit(this.engine.act(this.state, seatIndex, action, ctx()));
    } catch (e) {
      this.hub.log.warn(`computer player failed in room ${this.code} (${this.gameId}): ${e.message}`);
      try {
        const fallback = this.engine.bot(this.state, seatIndex, 'easy', ctx());
        this.commit(this.engine.act(this.state, seatIndex, fallback, ctx()));
      } catch (e2) {
        this.commit(this.engine.forfeit(this.state, seatIndex, 'The computer gave up'));
      }
    }
  }

  scheduleClock() {
    if (this.clockTimer) clearTimeout(this.clockTimer);
    this.clockTimer = null;
    if (this.closed || this.phase !== 'playing' || !this.engine.deadline) return;
    const d = this.engine.deadline(this.state);
    if (d === null) return;
    this.clockTimer = setTimeout(() => {
      this.clockTimer = null;
      if (this.phase !== 'playing') return;
      const next = this.engine.timeout(this.state, Date.now());
      if (next) this.commit(next);
      else this.scheduleClock();
    }, Math.max(0, d - Date.now()) + 20);
    this.clockTimer.unref?.();
  }

  clearTimers() {
    if (this.clockTimer) clearTimeout(this.clockTimer);
    this.clockTimer = null;
  }

  // ---- chat ----
  say(player, text) {
    this.touch();
    this.post({ from: player.id, name: player.name, color: player.color, text });
  }

  system(text) {
    this.post({ from: null, name: null, color: null, text });
  }

  post(msg) {
    const m = { id: ++this.chatSeq, ts: Date.now(), ...msg };
    this.chat.push(m);
    if (this.chat.length > 100) this.chat.shift();
    for (const c of this.viewers) this.hub.send(c, { t: 'chat', code: this.code, message: m });
  }

  close(reason) {
    if (this.closed) return;
    this.closed = true;
    if (this.botTimer) clearTimeout(this.botTimer);
    this.clearTimers();
    for (const c of this.viewers) {
      this.hub.send(c, { t: 'room.closed', code: this.code, reason });
      if (c.room === this) c.room = null;
    }
    this.viewers.clear();
  }
}

export { PLAYER_COLORS };
