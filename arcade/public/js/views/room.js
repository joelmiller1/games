// A game table: waiting room (seats, invite link, QR), live game, result + rematch, chat.
import { h, toast, modal, copyText, avatar, plural, fill } from '../ui.js';
import { gameBadge, icon } from '../icons.js';
import { getGame, LEVELS, formatScore } from '../../shared/games/meta.js';
import { net } from '../net.js';
import { navigate, absoluteUrl } from '../router.js';
import { qrSvg } from '../qr.js';
import { play } from '../sound.js';

const GAME_UI = {
  tictactoe: () => import('../games/tictactoe.js'),
  connect4: () => import('../games/connect4.js'),
  checkers: () => import('../games/checkers.js'),
  chess: () => import('../games/chess.js'),
  battleship: () => import('../games/battleship.js'),
  yahtzee: () => import('../games/yahtzee.js'),
  pinball: () => import('../games/pinball.js'),
  reversi: () => import('../games/reversi.js'),
  mancala: () => import('../games/mancala.js'),
  dotsboxes: () => import('../games/dotsboxes.js'),
  mastermind: () => import('../games/mastermind.js'),
  tetris: () => import('../games/arcade.js'),
  asteroids: () => import('../games/arcade.js'),
  snake: () => import('../games/arcade.js'),
  minesweeper: () => import('../games/arcade.js'),
  breakout: () => import('../games/arcade.js'),
  2048: () => import('../games/arcade.js'),
  bejeweled: () => import('../games/arcade.js'),
};

export function mount(el, { code }) {
  code = String(code).toUpperCase();
  let room = null;
  let meta = null;
  let ui = null;
  let uiLoading = null;
  let lastSeat = null;
  let prevPhase = null;
  let prevMyTurn = false;
  let closed = false;

  const head = h('div', { class: 'room-head' });
  const players = h('div', { class: 'players' });
  const statusText = h('div', { class: 'status-text' });
  const statusActions = h('div', { class: 'actions' });
  const status = h('div', { class: 'status-bar' }, statusText, statusActions);
  const resultBox = h('div');
  const boardArea = h('div', { class: 'board-area' }, h('div', { class: 'empty' }, 'Joining table…'));
  const sidePanel = h('section', { class: 'panel side-panel', hidden: true });
  const chatLog = h('div', { class: 'chat-log', 'aria-live': 'polite' });
  const chatInput = h('input', { class: 'input', maxlength: 300, placeholder: 'Say something…', 'aria-label': 'Chat message' });
  const chatForm = h(
    'form',
    {
      class: 'chat-form',
      onSubmit: (e) => {
        e.preventDefault();
        const text = chatInput.value.trim();
        if (!text) return;
        net.request({ t: 'room.chat', code, text }).catch((err) => toast(err.message, 'error'));
        chatInput.value = '';
      },
    },
    chatInput,
    h('button', { class: 'btn btn-sm', type: 'submit' }, 'Send'),
  );
  const chat = h('section', { class: 'panel chat' }, h('div', { class: 'chat-head' }, icon('chat', 18), 'Table chat'), chatLog, chatForm);

  const root = h(
    'div',
    { class: 'room' },
    head,
    h('div', { class: 'room-body' }, h('div', { class: 'room-main' }, players, status, resultBox, boardArea), h('aside', { class: 'room-side' }, sidePanel, chat)),
  );
  el.append(root);

  // ---------- chat ----------
  function addChat(m, quiet = false) {
    const who = m.from ? h('span', { class: 'who', style: { color: m.color } }, m.name) : null;
    chatLog.append(h('div', { class: `chat-msg ${m.from ? '' : 'sys'}` }, who, m.text));
    while (chatLog.childElementCount > 120) chatLog.firstChild.remove();
    chatLog.scrollTop = chatLog.scrollHeight;
    if (!quiet && m.from && m.from !== room?.you.id) play('chat');
  }

  // ---------- helpers ----------
  const mySeats = () => room?.you.seats || [];
  const isLocal = () => room?.mode === 'local';

  function activeSeat() {
    const mine = mySeats();
    if (!mine.length) return null;
    if (mine.length === 1) return mine[0];
    const acting = room.actors.find((a) => mine.includes(a));
    if (acting !== undefined) lastSeat = acting;
    return lastSeat ?? mine[0];
  }

  function currentView(seat) {
    if (seat !== null && room.views[seat]) return room.views[seat];
    return room.view;
  }

  function act(action, seat = activeSeat()) {
    return net.request({ t: 'room.act', code, seat, action }).catch((e) => {
      toast(e.message, 'error');
      throw e;
    });
  }

  async function leave() {
    const inGame = room && room.phase === 'playing' && mySeats().length;
    if (inGame && room.mode === 'online') {
      const msg = meta.leaveMode === 'bot' ? 'A computer player will take over your seat.' : meta.leaveMode === 'forfeit' ? 'Your score so far will stand.' : 'Leaving now counts as resigning.';
      const ok = await modal({ title: 'Leave the game?', body: msg, actions: [{ label: 'Stay', value: false }, { label: 'Leave', value: true, danger: true }] });
      if (!ok) return;
    }
    net.send({ t: 'room.leave', code });
    navigate(meta ? `play/${meta.id}` : '');
  }

  async function share() {
    const url = absoluteUrl(`room/${code}`);
    const qr = qrSvg(url, { size: 220 });
    const res = await modal({
      title: 'Invite players',
      body: [
        h('p', { style: { margin: 0 } }, 'Anyone on your network can scan the code, open the link, or type the table code on the home page.'),
        qr ? h('div', { style: { display: 'grid', placeItems: 'center' } }, h('div', { class: 'share-box' }, h('div', { class: 'qr' }, qr))) : null,
        h('div', { class: 'share-url' }, url),
        h('div', { style: { textAlign: 'center' } }, h('span', { class: 'big-code' }, code)),
      ],
      actions: [
        { label: 'Close', value: false },
        { label: 'Copy link', value: true, primary: true },
      ],
    });
    if (res) toast((await copyText(url)) ? 'Link copied' : 'Copy the link above', 'good');
  }

  // ---------- rendering ----------
  function renderHead() {
    const buttons = [];
    if (room.mode === 'online') buttons.push(h('button', { class: 'btn btn-sm', type: 'button', onClick: share }, icon('share', 16), 'Invite'));
    buttons.push(h('button', { class: 'btn btn-sm btn-ghost', type: 'button', onClick: leave }, icon('exit', 16), 'Leave'));
    const modeLabel = room.mode === 'solo' ? 'vs computer' : room.mode === 'local' ? 'pass & play' : room.visibility === 'private' ? 'private table' : 'online table';
    fill(head, 
      h('a', { class: 'icon-btn', href: `play/${meta.id}`, 'data-link': true, 'aria-label': 'Back' }, icon('back', 18)),
      h('div', { class: 'room-title' }, gameBadge(meta.id, 38), h('h1', meta.name), h('span', { class: 'room-code', title: 'Table code' }, code), h('span', { class: 'chip' }, modeLabel)),
      room.spectators.length ? h('span', { class: 'chip', title: room.spectators.join(', ') }, icon('eye', 14), `${room.spectators.length}`) : null,
      ...buttons,
    );
  }

  function renderPlayers() {
    const actors = room.phase === 'playing' ? room.actors : [];
    fill(players, 
      ...room.seats.map((s) => {
        if (s.kind === 'open') {
          return h('div', { class: 'player', style: { '--pc': s.color } }, h('span', { class: 'avatar', style: { background: 'transparent', border: '2px dashed var(--border-strong)' } }, '?'), h('div', { class: 'meta' }, h('span', { class: 'pname muted' }, 'Open seat'), h('span', { class: 'plabel' }, s.label)));
        }
        const winner = room.phase === 'over' && room.result && !room.result.draw && room.result.winners.includes(s.index);
        return h(
          'div',
          {
            class: ['player', actors.includes(s.index) && 'active', !s.connected && 'offline'],
            style: { '--pc': s.color },
            title: s.connected ? '' : 'Disconnected',
          },
          avatar(s.name, s.color, '', s.kind === 'bot'),
          h(
            'div',
            { class: 'meta' },
            h('span', { class: 'pname' }, s.name, mySeats().includes(s.index) && !isLocal() ? ' (you)' : ''),
            h('span', { class: 'plabel' }, s.kind === 'bot' ? icon('robot', 12) : h('span', { class: `conn-dot ${s.connected ? '' : 'off'}` }), s.label, winner ? icon('crown', 12) : null),
          ),
          s.wins ? h('span', { class: 'wins', title: 'Games won at this table' }, s.wins) : null,
        );
      }),
    );
  }

  function renderStatus() {
    status.classList.remove('mine');
    fill(statusActions);
    if (room.phase !== 'playing') {
      status.hidden = true;
      return;
    }
    status.hidden = false;
    const seat = activeSeat();
    const view = currentView(seat);
    const custom = ui?.status?.(room, view, seat);
    const mine = room.actors.filter((a) => mySeats().includes(a));
    let text;
    if (custom) text = custom;
    else if (mine.length) {
      text = isLocal() && mySeats().length > 1 ? `${room.seats[mine[0]].name}'s turn` : 'Your turn';
    } else {
      const who = room.actors.map((a) => room.seats[a]);
      if (who.length === 1 && who[0].kind === 'bot') text = h('span', { class: 'thinking' }, `${who[0].name} is thinking`);
      else if (who.length) text = `Waiting for ${who.map((w) => w.name).join(' and ')}`;
      else text = '';
    }
    if (mine.length) status.classList.add('mine');
    fill(statusText, text);
    if (ui?.actions) statusActions.append(ui.actions);
    if (mySeats().length && meta.leaveMode === 'resign' && room.phase === 'playing' && !isLocal()) {
      statusActions.append(
        h(
          'button',
          {
            class: 'btn btn-sm btn-ghost',
            type: 'button',
            onClick: async () => {
              const ok = await modal({ title: 'Resign?', body: 'Your opponent will win this game.', actions: [{ label: 'Keep playing', value: false }, { label: 'Resign', value: true, danger: true }] });
              if (ok) net.request({ t: 'room.resign', code }).catch((e) => toast(e.message, 'error'));
            },
          },
          icon('flag', 16),
          'Resign',
        ),
      );
    }
    // A little ping when it becomes your turn in an online game.
    const myTurn = mine.length > 0;
    if (myTurn && !prevMyTurn && room.mode === 'online') play('turn');
    prevMyTurn = myTurn;
  }

  function renderResult() {
    if (room.phase !== 'over' || !room.result) {
      fill(resultBox);
      return;
    }
    const r = room.result;
    const mine = mySeats();
    const iWon = !r.draw && r.winners.some((w) => mine.includes(w));
    const winnerNames = r.winners.map((w) => room.seats[w]?.name).filter(Boolean);
    let title;
    let cls = '';
    if (room.seats.length === 1) {
      // A solo game (Yahtzee, a Mastermind puzzle): there is nobody to beat.
      title = meta.id === 'mastermind' && iWon ? 'Code cracked!' : 'Game over';
      if (meta.id === 'mastermind') cls = iWon ? 'win' : 'lose';
    } else if (r.draw && (r.winners.length <= 1 || r.winners.length === room.seats.length)) title = "It's a draw";
    else if (r.draw) title = `Tie: ${winnerNames.join(' & ')}`;
    else if (isLocal() || !mine.length) title = `${winnerNames.join(' & ')} wins!`;
    else if (iWon) {
      title = room.seats.length === 1 ? 'Game over' : 'You win!';
      cls = 'win';
    } else {
      title = `${winnerNames.join(' & ')} wins`;
      cls = 'lose';
    }
    let scores = null;
    if (r.scores && room.seats.length > 1) {
      // Best first: highest points, or lowest time (unfinished runs last).
      const asc = r.order === 'asc';
      const rank = (x) => (x === null || x === undefined ? Infinity : asc ? x : -x);
      const order = r.scores.map((sc, i) => ({ sc, i })).sort((a, b) => rank(a.sc) - rank(b.sc));
      scores = h('div', { class: 'row small' }, order.map(({ sc, i }, k) => h('span', { class: 'chip' }, `${k + 1}. ${room.seats[i].name}: ${sc === null ? 'did not finish' : formatScore(meta, sc)}`)));
    }
    const voted = room.rematch.includes(room.you.id);
    const others = room.seats.filter((s) => s.kind === 'human' && !room.rematch.includes(s.playerId) && s.playerId !== room.you.id && !String(s.playerId).startsWith('left:'));
    const someoneLeft = room.seats.some((s) => s.kind === 'human' && String(s.playerId).startsWith('left:'));
    const buttons = [];
    if (mine.length) {
      buttons.push(
        h(
          'button',
          {
            class: 'btn btn-primary',
            type: 'button',
            disabled: voted,
            onClick: () => net.request({ t: 'room.rematch', code }).catch((e) => toast(e.message, 'error')),
          },
          icon('refresh', 16),
          someoneLeft ? 'New game' : voted ? `Waiting for ${others.map((o) => o.name).join(', ') || 'others'}` : room.seats.length > 1 ? 'Rematch' : 'Play again',
        ),
      );
    }
    buttons.push(h('a', { class: 'btn btn-ghost', href: `play/${meta.id}`, 'data-link': true }, 'Other games'));
    fill(resultBox, 
      h(
        'div',
        { class: `result-banner ${cls}` },
        h('div', { class: 'grow' }, h('h2', title), h('div', { class: 'why' }, r.reason || ''), scores),
        h('div', { class: 'row' }, buttons),
      ),
    );
    if (prevPhase === 'playing') {
      if (r.draw && r.winners.length !== 1) play('draw');
      else if (iWon || (isLocal() && mine.length) || !mine.length) play('win');
      else play('lose');
    }
  }

  function seatControls(s) {
    const host = room.you.host;
    const mine = mySeats().includes(s.index);
    const controls = [];
    if (s.kind === 'open') {
      if (!mine && room.mode === 'online') controls.push(h('button', { class: 'btn btn-sm', type: 'button', onClick: () => net.request({ t: 'room.sit', code, seat: s.index }).catch((e) => toast(e.message, 'error')) }, 'Sit here'));
      if (host && meta.bots) {
        const sel = h(
          'select',
          { class: 'input', style: { width: 'auto', minHeight: '34px' }, 'aria-label': 'Computer difficulty' },
          LEVELS.map((l) => h('option', { value: l.id, selected: l.id === 'medium' }, l.name)),
        );
        controls.push(sel, h('button', { class: 'btn btn-sm', type: 'button', onClick: () => net.request({ t: 'room.seat', code, seat: s.index, kind: 'bot', level: sel.value }).catch((e) => toast(e.message, 'error')) }, icon('robot', 16), 'Add computer'));
      }
    } else if (host && !mine) {
      controls.push(h('button', { class: 'btn btn-sm btn-ghost', type: 'button', onClick: () => net.request({ t: 'room.seat', code, seat: s.index, kind: 'open' }).catch((e) => toast(e.message, 'error')) }, s.kind === 'bot' ? 'Remove' : 'Move to audience'));
    }
    if (host && room.seats.length > meta.players[0] && !mine && room.seats.length > 1) {
      controls.push(h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Remove seat', title: 'Remove seat', onClick: () => net.request({ t: 'room.removeSeat', code, seat: s.index }).catch((e) => toast(e.message, 'error')) }, icon('close', 16)));
    }
    return controls;
  }

  function renderWaiting() {
    const host = room.you.host;
    const url = absoluteUrl(`room/${code}`);
    const qr = qrSvg(url, { size: 150 });
    const full = !room.seats.some((s) => s.kind === 'open');
    const seated = mySeats().length > 0;
    const hostSeat = room.seats.find((s) => s.playerId === room.hostId);
    const list = h(
      'div',
      { class: 'seat-list' },
      room.seats.map((s) =>
        h(
          'div',
          { class: ['seat', s.kind === 'open' && 'open'] },
          h('span', { class: 'seat-label' }, s.label),
          s.kind === 'open' ? h('span', { class: 'avatar', style: { background: 'transparent', border: '2px dashed var(--border-strong)' } }, '?') : avatar(s.name, s.color, '', s.kind === 'bot'),
          h('span', { class: 'seat-name' }, s.kind === 'open' ? h('span', { class: 'muted' }, 'Waiting for a player…') : s.name, s.playerId === room.hostId ? h('span', { class: 'chip', style: { marginLeft: '8px' } }, 'host') : null),
          h('div', { class: 'seat-actions' }, seatControls(s)),
        ),
      ),
      host && room.seats.length < meta.players[1] ? h('button', { class: 'btn btn-sm btn-ghost', type: 'button', onClick: () => net.request({ t: 'room.addSeat', code }).catch((e) => toast(e.message, 'error')) }, icon('plus', 16), 'Add seat') : null,
    );
    const startRow = host
      ? h(
          'button',
          { class: 'btn btn-primary btn-lg btn-block', type: 'button', disabled: !full, onClick: () => net.request({ t: 'room.start', code }).catch((e) => toast(e.message, 'error')) },
          icon('play', 18),
          full ? 'Start game' : `Waiting for ${plural(room.seats.filter((s) => s.kind === 'open').length, 'player')}`,
        )
      : h('div', { class: 'empty' }, seated ? `Waiting for ${hostSeat?.name || 'the host'} to start the game…` : 'You are watching. Pick a free seat to play.');
    const last = room.lastResult ? h('p', { class: 'muted small', style: { margin: 0 } }, `Last game: ${room.lastResult.draw ? 'draw' : `${room.lastResult.names?.join(' & ')} won`} (${room.lastResult.reason})`) : null;
    fill(boardArea, 
      h(
        'div',
        { class: 'waiting' },
        room.mode === 'online'
          ? h(
              'section',
              { class: 'panel' },
              h('div', { class: 'panel-title' }, icon('share', 18), 'Invite players'),
              h(
                'div',
                { class: 'share-box' },
                qr ? h('div', { class: 'qr' }, qr) : null,
                h(
                  'div',
                  { class: 'form-grid' },
                  h('div', h('div', { class: 'muted small' }, 'Table code'), h('div', { class: 'big-code' }, code)),
                  h('div', { class: 'share-url' }, url),
                  h('div', { class: 'row' }, h('button', { class: 'btn btn-sm', type: 'button', onClick: async () => toast((await copyText(url)) ? 'Link copied' : 'Copy the link above', 'good') }, icon('copy', 16), 'Copy link')),
                ),
              ),
            )
          : null,
        h('section', { class: 'panel' }, h('div', { class: 'panel-title' }, icon('users', 18), 'Players'), list),
        last,
        startRow,
      ),
    );
  }

  async function ensureUi() {
    if (ui && ui.game === room.game) return ui;
    if (uiLoading) return uiLoading;
    uiLoading = (async () => {
      const mod = await GAME_UI[room.game]();
      const instance = mod.create({
        act,
        room: () => room,
        seat: activeSeat,
        isLocal,
        toast,
        play,
        code,
      });
      instance.game = room.game;
      ui = instance;
      uiLoading = null;
      return instance;
    })();
    return uiLoading;
  }

  async function renderGame() {
    const inst = await ensureUi();
    if (closed || !room || room.phase === 'waiting') return;
    if (boardArea.firstChild !== inst.el) fill(boardArea, inst.el);
    const seat = activeSeat();
    try {
      inst.update(room, currentView(seat), seat);
    } catch (e) {
      console.error(e);
    }
    if (inst.side) {
      sidePanel.hidden = false;
      if (sidePanel.firstChild !== inst.side) fill(sidePanel, inst.side);
    } else sidePanel.hidden = true;
    renderStatus();
  }

  function update(r) {
    const first = !room;
    room = r;
    meta = getGame(r.game);
    renderHead();
    renderPlayers();
    if (r.phase === 'waiting') {
      status.hidden = true;
      sidePanel.hidden = true;
      if (ui) {
        ui.destroy?.();
        ui = null;
      }
      renderWaiting();
    } else {
      renderGame();
    }
    renderResult();
    if (first && r.phase === 'waiting' && r.you.spectator && r.seats.some((s) => s.kind === 'open')) {
      toast('Pick a free seat to join the game', 'info');
    }
    if (prevPhase === 'waiting' && r.phase === 'playing') play('join');
    prevPhase = r.phase;
  }

  function showClosed(reason) {
    closed = true;
    ui?.destroy?.();
    ui = null;
    status.hidden = true;
    fill(resultBox);
    fill(boardArea, 
      h(
        'div',
        { class: 'waiting', style: { textAlign: 'center' } },
        h('h2', 'This table is closed'),
        h('p', { class: 'muted' }, reason || 'It may have finished or the server restarted.'),
        h('div', { class: 'row', style: { justifyContent: 'center' } }, h('a', { class: 'btn btn-primary', href: meta ? `play/${meta.id}` : './', 'data-link': true }, 'Start a new game'), h('a', { class: 'btn', href: './', 'data-link': true }, 'Home')),
      ),
    );
  }

  function join() {
    if (closed) return;
    net.request({ t: 'room.join', code }).catch((e) => {
      fill(head, h('a', { class: 'icon-btn', href: './', 'data-link': true, 'aria-label': 'Back' }, icon('back', 18)), h('div', { class: 'room-title' }, h('h1', 'Table '), h('span', { class: 'room-code' }, code)));
      showClosed(e.message);
    });
  }

  const offs = [
    net.on('room', (m) => m.room.code === code && !closed && update(m.room)),
    net.on('chat', (m) => m.code === code && addChat(m.message)),
    net.on('chat.history', (m) => {
      if (m.code !== code) return;
      fill(chatLog);
      m.messages.forEach((x) => addChat(x, true));
    }),
    net.on('room.closed', (m) => m.code === code && showClosed(m.reason)),
    net.on('ready', join),
  ];
  if (net.ready) join();

  return {
    unmount() {
      closed = true;
      offs.forEach((f) => f());
      net.send({ t: 'room.unwatch' });
      ui?.destroy?.();
    },
  };
}
