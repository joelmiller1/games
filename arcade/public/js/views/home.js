// Home: game catalogue, live list of open tables and the hall of fame.
import { h, toast, fill } from '../ui.js';
import { gameArt, gameBadge, icon } from '../icons.js';
import { GAMES, CATEGORIES, getGame, formatScore, scoring } from '../../shared/games/meta.js';
import { net } from '../net.js';
import { navigate } from '../router.js';

export function playersText(g) {
  const [a, b] = g.players;
  return a === b ? `${a} players` : `${a}–${b} players`;
}

function gameCard(g) {
  return h(
    'a',
    { class: 'game-card', href: `play/${g.id}`, 'data-link': true, style: { '--accent-c': g.accent } },
    gameArt(g.id, 84),
    h('h3', g.name),
    h('p', g.tagline),
    h('div', { class: 'chips' }, h('span', { class: 'chip' }, playersText(g)), g.bots ? h('span', { class: 'chip' }, 'vs computer') : g.leaderboard ? h('span', { class: 'chip' }, 'high scores') : null),
  );
}

export function tableRow(room, { showGame = true } = {}) {
  const meta = getGame(room.game);
  const people = room.seats.map((s) => (s.kind === 'open' ? 'open seat' : s.name));
  const phase =
    room.phase === 'waiting'
      ? room.open > 0
        ? `Waiting for ${room.open} more`
        : 'Ready to start'
      : room.phase === 'playing'
        ? 'In progress'
        : 'Finished';
  const canJoin = room.phase === 'waiting' && room.open > 0;
  return h(
    'div',
    { class: 'table-row' },
    showGame ? gameBadge(room.game, 38) : null,
    h(
      'div',
      { class: 'info' },
      h('div', { class: 'title' }, showGame ? `${meta?.name || room.game} · ` : '', h('span', { class: 'room-code' }, room.code)),
      h('div', { class: 'sub' }, `${phase} · ${people.join(', ')}${room.spectators ? ` · ${room.spectators} watching` : ''}`),
    ),
    h('a', { class: `btn btn-sm ${canJoin ? 'btn-primary' : ''}`, href: `room/${room.code}`, 'data-link': true }, canJoin ? 'Join' : 'Watch'),
  );
}

function rankList(items, value) {
  return h(
    'ol',
    { class: 'rank-list' },
    items.map((it, i) => h('li', h('span', { class: 'pos' }, i + 1), h('span', { class: 'who' }, it.name), h('span', { class: 'val' }, value(it)))),
  );
}

export function renderBoards(boards, { only = null, limit = 5 } = {}) {
  const sections = [];
  for (const g of GAMES) {
    if (only && g.id !== only) continue;
    const b = boards[g.id];
    if (!b) continue;
    if (b.boards) {
      const kind = scoring(g).format === 'time' ? 'best times' : 'high scores';
      for (const board of b.boards) {
        if (!board.scores?.length) continue;
        const title = only ? `${board.label ? `${board.label} ` : ''}${kind}` : `${g.name}${board.label ? ` · ${board.label}` : ''} ${kind}`;
        sections.push(h('div', h('h4', title), rankList(board.scores.slice(0, limit), (x) => formatScore(g, x.score))));
      }
    } else if (b.records?.length) {
      sections.push(
        h(
          'div',
          h('h4', `${g.name} champions`),
          rankList(b.records.slice(0, limit), (x) => `${x.wins}W ${x.losses}L${x.draws ? ` ${x.draws}D` : ''}`),
        ),
      );
    }
  }
  return sections;
}

export async function fetchBoards() {
  const r = await fetch('api/leaderboards', { cache: 'no-store' });
  if (!r.ok) throw new Error('failed');
  return r.json();
}

export function mount(el) {
  const tables = h('div', { class: 'table-list' }, h('div', { class: 'empty' }, 'Looking for tables…'));
  const fame = h('div', { class: 'fame' });
  const onlineChip = h('span', { class: 'chip live' }, 'connecting');
  const codeInput = h('input', {
    class: 'input code',
    maxlength: 4,
    placeholder: 'CODE',
    'aria-label': 'Table code',
    autocomplete: 'off',
    autocapitalize: 'characters',
    spellcheck: 'false',
  });
  const join = () => {
    const c = codeInput.value.trim().toUpperCase();
    if (/^[A-Z]{4}$/.test(c)) navigate(`room/${c}`);
    else toast('Table codes are four letters', 'error');
  };
  codeInput.addEventListener('keydown', (e) => e.key === 'Enter' && join());

  el.append(
    h(
      'div',
      { class: 'page' },
      h(
        'section',
        { class: 'hero' },
        h(
          'div',
          h('h1', 'Game night, ', h('span', { class: 'grad' }, 'on your network.')),
          h('p', 'Play the computer, pass the device around, or invite anyone on your Wi-Fi to a table.'),
        ),
        h('div', { class: 'join-inline' }, codeInput, h('button', { class: 'btn btn-primary', type: 'button', onClick: join }, 'Join table')),
      ),
      ...CATEGORIES.map((cat) =>
        h('section', { class: 'catalogue' }, h('h2', { class: 'cat-title' }, cat.name), h('div', { class: 'game-grid' }, GAMES.filter((g) => g.category === cat.id).map(gameCard))),
      ),
      h(
        'div',
        { class: 'home-columns' },
        h('section', { class: 'panel' }, h('div', { class: 'panel-title' }, icon('wifi'), 'Open tables', h('span', { class: 'spacer' }), onlineChip), tables),
        h('section', { class: 'panel' }, h('div', { class: 'panel-title' }, icon('trophy'), 'Hall of fame'), fame),
      ),
    ),
  );

  function renderLobby(msg) {
    onlineChip.textContent = `${msg.online} online`;
    if (!msg.rooms.length) {
      fill(tables, h('div', { class: 'empty' }, 'No open tables right now. Pick a game above and choose “Online” to start one.'));
      return;
    }
    fill(tables, ...msg.rooms.map((r) => tableRow(r)));
  }

  fetchBoards()
    .then((boards) => {
      const sections = renderBoards(boards);
      fill(fame, ...(sections.length ? sections : [h('div', { class: 'empty' }, 'No champions yet. High scores and wins between players show up here.')]));
    })
    .catch(() => fill(fame, h('div', { class: 'empty' }, 'Could not load the hall of fame.')));

  const offs = [net.on('lobby', renderLobby), net.on('ready', () => net.send({ t: 'lobby.watch' }))];
  if (net.ready) net.send({ t: 'lobby.watch' });
  return {
    unmount() {
      offs.forEach((f) => f());
      net.send({ t: 'lobby.watch', on: false });
    },
  };
}
