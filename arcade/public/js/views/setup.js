// Game setup: choose vs computer, online table or pass-and-play, then options.
import { h, toast, fill } from '../ui.js';
import { gameArt, icon } from '../icons.js';
import { getGame, LEVELS, seatLabel } from '../../shared/games/meta.js';
import { net } from '../net.js';
import { navigate } from '../router.js';
import { getProfile, pref, setPref } from '../profile.js';
import { tableRow, renderBoards, fetchBoards, playersText } from './home.js';
import { play } from '../sound.js';

function seg(options, value, onChange, label) {
  const wrap = h('div', { class: 'seg', role: 'group', 'aria-label': label });
  const render = (v) => {
    fill(wrap, 
      ...options.map((o) =>
        h(
          'button',
          {
            type: 'button',
            'aria-pressed': String(o.value === v),
            onClick: () => {
              render(o.value);
              onChange(o.value);
            },
          },
          o.label,
        ),
      ),
    );
  };
  render(value);
  return wrap;
}

function field(label, control) {
  return h('div', h('div', { class: 'field-label' }, label), control);
}

function optionControls(meta, options) {
  return meta.options.map((opt) => {
    if (opt.type === 'bool') {
      const cb = h('input', { type: 'checkbox', checked: options[opt.key], onChange: (e) => (options[opt.key] = e.target.checked) });
      return h('label', { class: 'toggle' }, cb, opt.label);
    }
    if (opt.choices.length <= 3) {
      return field(opt.label, seg(opt.choices, options[opt.key], (v) => (options[opt.key] = v), opt.label));
    }
    const sel = h(
      'select',
      { class: 'input', 'aria-label': opt.label, onChange: (e) => (options[opt.key] = e.target.value) },
      opt.choices.map((c) => h('option', { value: c.value, selected: c.value === options[opt.key] }, c.label)),
    );
    return field(opt.label, sel);
  });
}

function namesEditor(meta, names, { min, max, onChange }) {
  const box = h('div', { class: 'names-list' });
  const render = () => {
    fill(box, 
      ...names.map((n, i) =>
        h(
          'div',
          { class: 'name-row' },
          h('input', {
            class: 'input',
            value: n,
            maxlength: 20,
            'aria-label': `Player ${i + 1} name`,
            placeholder: `Player ${i + 1}`,
            onInput: (e) => {
              names[i] = e.target.value;
              onChange?.();
            },
          }),
          meta.seatLabels ? h('span', { class: 'chip' }, seatLabel(meta, i)) : null,
          names.length > min
            ? h(
                'button',
                {
                  class: 'icon-btn',
                  type: 'button',
                  'aria-label': 'Remove player',
                  onClick: () => {
                    names.splice(i, 1);
                    render();
                    onChange?.();
                  },
                },
                icon('minus', 16),
              )
            : null,
        ),
      ),
      names.length < max
        ? h(
            'button',
            {
              class: 'btn btn-sm btn-ghost',
              type: 'button',
              onClick: () => {
                names.push(`Player ${names.length + 1}`);
                render();
                onChange?.();
              },
            },
            icon('plus', 16),
            'Add player',
          )
        : null,
    );
  };
  render();
  return box;
}

async function createAndGo(payload, button) {
  if (button) button.disabled = true;
  try {
    const { code } = await net.request({ t: 'room.create', ...payload });
    play('click');
    navigate(`room/${code}`);
  } catch (e) {
    toast(e.message, 'error');
    if (button) button.disabled = false;
  }
}

function joinByCode() {
  const input = h('input', { class: 'input code', maxlength: 4, placeholder: 'CODE', 'aria-label': 'Table code', autocapitalize: 'characters', autocomplete: 'off' });
  const go = () => {
    const c = input.value.trim().toUpperCase();
    if (/^[A-Z]{4}$/.test(c)) navigate(`room/${c}`);
    else toast('Table codes are four letters', 'error');
  };
  input.addEventListener('keydown', (e) => e.key === 'Enter' && go());
  return h('div', { class: 'row' }, input, h('button', { class: 'btn', type: 'button', onClick: go }, 'Join'));
}

export function mount(el, { game }) {
  const meta = getGame(game);
  if (!meta) {
    navigate('', { replace: true });
    return null;
  }
  const isPinball = meta.id === 'pinball';
  const modes = isPinball
    ? [
        { id: 'solo', title: 'Solo', sub: 'Chase the high score', icon: 'play' },
        { id: 'local', title: 'Pass & Play', sub: 'Take turns on this device', icon: 'device' },
        { id: 'online', title: 'Score Attack', sub: 'Everyone plays at once', icon: 'wifi' },
      ]
    : [
        { id: 'solo', title: 'vs Computer', sub: meta.players[0] === 1 ? 'Solo or with bots' : 'Easy, medium or hard', icon: 'robot' },
        { id: 'online', title: 'Online', sub: 'Invite others on the network', icon: 'wifi' },
        { id: 'local', title: 'Pass & Play', sub: 'Share this device', icon: 'device' },
      ];
  let mode = pref(`mode.${meta.id}`, 'solo');
  if (!modes.some((m) => m.id === mode)) mode = modes[0].id;

  const state = {
    level: pref('level', 'medium'),
    seat: 0,
    bots: meta.id === 'yahtzee' ? 1 : 1,
    options: Object.fromEntries(meta.options.map((o) => [o.key, pref(`opt.${meta.id}.${o.key}`, o.default)])),
    listed: true,
    seats: meta.onlineDefault,
    names: [getProfile().name, 'Player 2'].slice(0, Math.max(2, meta.players[0])),
  };
  const saveOptions = () => {
    for (const [k, v] of Object.entries(state.options)) setPref(`opt.${meta.id}.${k}`, v);
  };

  const tabs = h('div', { class: 'mode-tabs', role: 'tablist' });
  const form = h('div', { class: 'form-grid' });
  const openTables = h('div', { class: 'table-list' });
  const boardsBox = h('div', { class: 'fame' });

  function renderTabs() {
    fill(tabs, 
      ...modes.map((m) =>
        h(
          'button',
          {
            type: 'button',
            class: 'mode-tab',
            role: 'tab',
            'aria-pressed': String(m.id === mode),
            'aria-selected': String(m.id === mode),
            onClick: () => {
              mode = m.id;
              setPref(`mode.${meta.id}`, mode);
              renderTabs();
              renderForm();
            },
          },
          icon(m.icon, 20),
          h('strong', m.title),
          h('span', m.sub),
        ),
      ),
    );
  }

  function startButton(label, onClick) {
    const b = h('button', { class: 'btn btn-primary btn-lg btn-block', type: 'button' }, icon('play', 18), label);
    b.addEventListener('click', () => onClick(b));
    return b;
  }

  function renderForm() {
    const parts = [];
    if (isPinball) {
      parts.push(...optionControls(meta, state.options));
      if (mode === 'solo') {
        parts.push(
          startButton('Play', () => {
            saveOptions();
            navigate(`pinball?balls=${state.options.balls}`);
          }),
        );
      } else if (mode === 'local') {
        const names = state.names.slice(0, 4);
        while (names.length < 2) names.push(`Player ${names.length + 1}`);
        state.names = names;
        parts.push(field('Players take turns, one ball each', namesEditor(meta, state.names, { min: 2, max: 4 })));
        parts.push(
          startButton('Play', () => {
            saveOptions();
            const list = state.names.map((n, i) => n.trim() || `Player ${i + 1}`).join('|');
            navigate(`pinball?balls=${state.options.balls}&players=${encodeURIComponent(list)}`);
          }),
        );
      } else {
        parts.push(field('Players', seg([2, 3, 4, 5, 6, 8].map((n) => ({ value: n, label: String(n) })), state.seats, (v) => (state.seats = v), 'Players')));
        parts.push(h('label', { class: 'toggle' }, h('input', { type: 'checkbox', checked: state.listed, onChange: (e) => (state.listed = e.target.checked) }), 'List in open tables'));
        parts.push(
          startButton('Create table', (b) => {
            saveOptions();
            createAndGo({ game: meta.id, mode: 'online', seats: state.seats, visibility: state.listed ? 'public' : 'private', options: state.options }, b);
          }),
        );
        parts.push(h('div', { class: 'divider' }, 'or join with a code'), joinByCode());
      }
    } else if (mode === 'solo') {
      parts.push(field('Difficulty', seg(LEVELS.map((l) => ({ value: l.id, label: l.name })), state.level, (v) => (state.level = v), 'Difficulty')));
      if (meta.players[1] === 2) {
        const choices = [0, 1].map((i) => ({ value: i, label: seatLabel(meta, i) })).concat([{ value: -1, label: 'Random' }]);
        parts.push(field(meta.id === 'battleship' ? 'Fire first?' : 'You play', seg(choices, state.seat, (v) => (state.seat = v), 'Your side')));
      } else {
        const choices = [];
        for (let n = 0; n < meta.players[1]; n++) choices.push({ value: n, label: n === 0 ? 'None (solo)' : String(n) });
        parts.push(field('Computer opponents', seg(choices, state.bots, (v) => (state.bots = v), 'Computer opponents')));
      }
      parts.push(...optionControls(meta, state.options));
      parts.push(
        startButton('Start game', (b) => {
          setPref('level', state.level);
          saveOptions();
          createAndGo({ game: meta.id, mode: 'solo', level: state.level, seat: state.seat, bots: state.bots, options: state.options }, b);
        }),
      );
    } else if (mode === 'online') {
      const [min, max] = meta.players;
      if (max > min) {
        const choices = [];
        for (let n = Math.max(2, min); n <= max; n++) choices.push({ value: n, label: String(n) });
        parts.push(field('Seats at the table', seg(choices, state.seats, (v) => (state.seats = v), 'Seats')));
      }
      parts.push(...optionControls(meta, state.options));
      parts.push(h('label', { class: 'toggle' }, h('input', { type: 'checkbox', checked: state.listed, onChange: (e) => (state.listed = e.target.checked) }), 'List in open tables so anyone can join'));
      parts.push(
        h('p', { class: 'muted small', style: { margin: 0 } }, 'You get a link, a QR code and a four-letter code to share. Empty seats can also be filled with computer players.'),
      );
      parts.push(
        startButton('Create table', (b) => {
          saveOptions();
          createAndGo({ game: meta.id, mode: 'online', seats: state.seats, visibility: state.listed ? 'public' : 'private', options: state.options }, b);
        }),
      );
      parts.push(h('div', { class: 'divider' }, 'or join with a code'), joinByCode());
    } else {
      const [min, max] = meta.players;
      const minHumans = meta.bots && max > 2 ? 1 : Math.max(2, min);
      while (state.names.length < minHumans) state.names.push(`Player ${state.names.length + 1}`);
      if (state.names.length > max) state.names.length = max;
      parts.push(field('Players', namesEditor(meta, state.names, { min: minHumans, max })));
      if (meta.bots && max > 2) {
        const choices = [0, 1, 2, 3].map((n) => ({ value: n, label: String(n) }));
        parts.push(field('Computer players too', seg(choices, 0, (v) => (state.localBots = v), 'Computer players')));
        parts.push(field('Computer difficulty', seg(LEVELS.map((l) => ({ value: l.id, label: l.name })), state.level, (v) => (state.level = v), 'Difficulty')));
      }
      parts.push(...optionControls(meta, state.options));
      parts.push(
        startButton('Start game', (b) => {
          saveOptions();
          const names = state.names.map((n, i) => n.trim() || `Player ${i + 1}`);
          createAndGo({ game: meta.id, mode: 'local', names, bots: state.localBots || 0, level: state.level, options: state.options }, b);
        }),
      );
    }
    fill(form, ...parts);
  }

  renderTabs();
  renderForm();

  el.append(
    h(
      'div',
      { class: 'page' },
      h('a', { class: 'back-link', href: './', 'data-link': true }, icon('back', 18), 'All games'),
      h(
        'section',
        { class: 'setup-head', style: { '--accent-c': meta.accent } },
        gameArt(meta.id, 86),
        h('div', h('h1', meta.name), h('p', meta.tagline), h('div', { class: 'row', style: { marginTop: '8px' } }, h('span', { class: 'chip' }, playersText(meta)))),
      ),
      h(
        'div',
        { class: 'setup-grid' },
        h('section', { class: 'panel' }, tabs, form),
        h(
          'div',
          { class: 'form-grid' },
          h('section', { class: 'panel' }, h('div', { class: 'panel-title' }, icon('info'), 'How to play'), h('ul', { class: 'rules' }, meta.rules.map((r) => h('li', r)))),
          h('section', { class: 'panel' }, h('div', { class: 'panel-title' }, icon('wifi'), 'Open tables'), openTables),
          boardsBox,
        ),
      ),
    ),
  );

  fetchBoards()
    .then((boards) => {
      const sections = renderBoards(boards, { only: meta.id, limit: 10 });
      if (sections.length) fill(boardsBox, h('section', { class: 'panel' }, h('div', { class: 'panel-title' }, icon('trophy'), 'Leaderboard'), ...sections));
    })
    .catch(() => {});

  const renderLobby = (msg) => {
    const rooms = msg.rooms.filter((r) => r.game === meta.id);
    fill(openTables, ...(rooms.length ? rooms.map((r) => tableRow(r, { showGame: false })) : [h('div', { class: 'empty' }, `No open ${meta.name} tables yet.`)]));
  };
  const offs = [net.on('lobby', renderLobby), net.on('ready', () => net.send({ t: 'lobby.watch' }))];
  if (net.ready) net.send({ t: 'lobby.watch' });
  return {
    unmount() {
      offs.forEach((f) => f());
      net.send({ t: 'lobby.watch', on: false });
    },
  };
}
