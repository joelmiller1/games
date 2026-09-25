// Battleship UI: fleet placement, targeting (classic / streak / salvo) and pass-the-device screens.
import { h, fill } from '../ui.js';
import { icon } from '../icons.js';

const N = 10;
const LETTERS = 'ABCDEFGHIJ';
const cellName = (i) => `${LETTERS[Math.floor(i / N)]}${(i % N) + 1}`;

function cellsOf(r, c, dir, len) {
  const out = [];
  for (let k = 0; k < len; k++) {
    const rr = dir === 'v' ? r + k : r;
    const cc = dir === 'h' ? c + k : c;
    if (rr >= N || cc >= N) return null;
    out.push(rr * N + cc);
  }
  return out;
}

function shipBox(ship, len, cls = '') {
  const w = ship.dir === 'h' ? len : 1;
  const hgt = ship.dir === 'v' ? len : 1;
  return h('div', {
    class: `bs-ship ${ship.dir} ${cls}`,
    style: {
      left: `calc(6px + var(--cell) * ${ship.c + 1} + 3px)`,
      top: `calc(6px + var(--cell) * ${ship.r + 1} + 3px)`,
      width: `calc(var(--cell) * ${w} - 6px)`,
      height: `calc(var(--cell) * ${hgt} - 6px)`,
    },
  });
}

/** Build a 10x10 grid element. */
function grid({ shots, ships = [], fleet, small = false, targetable = false, aim = new Set(), preview = null, fresh = new Set(), onCell, onHover, label }) {
  const g = h('div', { class: ['bs-grid', small && 'small', targetable && 'targetable'], role: 'grid', 'aria-label': label });
  g.append(h('div'));
  for (let c = 0; c < N; c++) g.append(h('div', { class: 'bs-label' }, c + 1));
  for (let r = 0; r < N; r++) {
    g.append(h('div', { class: 'bs-label' }, LETTERS[r]));
    for (let c = 0; c < N; c++) {
      const i = r * N + c;
      const shot = shots ? shots[i] : 0;
      const cls = ['bs-cell', shot === 0 && 'open', aim.has(i) && 'aim'];
      if (preview && preview.cells.includes(i)) cls.push(preview.ok ? 'place-ok' : 'place-bad');
      const cell = h('div', { class: cls, role: 'gridcell', dataset: { i: String(i) }, 'aria-label': `${cellName(i)}${shot === 2 ? ' hit' : shot === 1 ? ' miss' : ''}` });
      if (shot) cell.append(h('div', { class: ['bs-mark', shot === 2 ? 'hit' : 'miss', fresh.has(i) && 'fresh'] }));
      if (onCell) cell.addEventListener('click', () => onCell(i));
      // Hover previews only make sense with a mouse; on touch they would fight with taps.
      if (onHover) cell.addEventListener('pointerenter', (e) => e.pointerType !== 'touch' && onHover(i));
      g.append(cell);
    }
  }
  const lens = Object.fromEntries(fleet.map((f) => [f.id, f.len]));
  for (const sh of ships) g.append(shipBox(sh, lens[sh.id], `${sh.sunk ? 'sunk' : ''} ${sh.selected ? 'selected' : ''}`));
  if (onHover) g.addEventListener('pointerleave', () => onHover(null));
  return g;
}

export function create(ctx) {
  let room = null;
  let view = null;
  let seat = null;
  // placement editor state
  let placed = {};
  let selected = null;
  let dir = 'h';
  let hoverCell = null;
  // targeting
  let aim = new Set();
  let lastShotKey = '';
  let fresh = { mine: new Set(), theirs: new Set() };
  // pass & play
  let shownSeat = null;
  let passNote = '';

  const el = h('div', { class: 'bs' });
  const side = h('div');

  const fleetList = () => view.fleet;

  function resetPlacement() {
    placed = {};
    selected = view.fleet[0].id;
    aim = new Set();
  }

  function occupied(except) {
    const set = new Set();
    for (const f of fleetList()) {
      const p = placed[f.id];
      if (!p || f.id === except) continue;
      for (const x of cellsOf(p.r, p.c, p.dir, f.len)) set.add(x);
    }
    return set;
  }

  function previewFor(i) {
    if (selected === null || i === null) return null;
    const f = fleetList().find((x) => x.id === selected);
    const r = Math.floor(i / N);
    const c = i % N;
    const cells = cellsOf(r, c, dir, f.len);
    if (!cells) {
      const clipped = [];
      for (let k = 0; k < f.len; k++) {
        const rr = dir === 'v' ? r + k : r;
        const cc = dir === 'h' ? c + k : c;
        if (rr < N && cc < N) clipped.push(rr * N + cc);
      }
      return { cells: clipped, ok: false };
    }
    const occ = occupied(selected);
    return { cells, ok: cells.every((x) => !occ.has(x)), r, c };
  }

  function placeAt(i) {
    const ownerShip = fleetList().find((f) => placed[f.id] && cellsOf(placed[f.id].r, placed[f.id].c, placed[f.id].dir, f.len).includes(i));
    if (selected === null && ownerShip) {
      // Pick a placed ship back up.
      selected = ownerShip.id;
      dir = placed[ownerShip.id].dir;
      delete placed[ownerShip.id];
      ctx.play('click');
      return render();
    }
    if (selected === null) return;
    const p = previewFor(i);
    if (!p || !p.ok) {
      if (ownerShip && ownerShip.id !== selected) {
        selected = ownerShip.id;
        dir = placed[ownerShip.id].dir;
        delete placed[ownerShip.id];
        return render();
      }
      return ctx.toast('That ship does not fit there', 'error');
    }
    placed[selected] = { r: p.r, c: p.c, dir };
    ctx.play('place');
    const next = fleetList().find((f) => !placed[f.id]);
    selected = next ? next.id : null;
    render();
  }

  function randomize() {
    for (let attempt = 0; attempt < 500; attempt++) {
      const occ = new Set();
      const out = {};
      let ok = true;
      for (const f of fleetList()) {
        let done = false;
        for (let t = 0; t < 300 && !done; t++) {
          const d = Math.random() < 0.5 ? 'h' : 'v';
          const r = Math.floor(Math.random() * N);
          const c = Math.floor(Math.random() * N);
          const cells = cellsOf(r, c, d, f.len);
          if (!cells || cells.some((x) => occ.has(x))) continue;
          cells.forEach((x) => occ.add(x));
          out[f.id] = { r, c, dir: d };
          done = true;
        }
        if (!done) {
          ok = false;
          break;
        }
      }
      if (ok) {
        placed = out;
        selected = null;
        ctx.play('place');
        return render();
      }
    }
  }

  function rotate() {
    dir = dir === 'h' ? 'v' : 'h';
    render();
  }

  function ready() {
    const ships = fleetList().map((f) => ({ id: f.id, ...placed[f.id] }));
    ctx.act({ type: 'place', ships }, seat).then(() => ctx.play('join')).catch(() => {});
  }

  function fire(i) {
    if (!myTurn()) return;
    const target = view.players[1 - seat];
    if (target.shots[i] !== 0) return;
    if (view.mode === 'salvo') {
      if (aim.has(i)) aim.delete(i);
      else if (aim.size < view.shotsAllowed) aim.add(i);
      ctx.play('click');
      return render();
    }
    ctx.act({ type: 'fire', cells: [i] }, seat).catch(() => {});
  }

  function fireSalvo() {
    if (aim.size !== view.shotsAllowed) return;
    const cells = [...aim];
    aim = new Set();
    ctx.act({ type: 'fire', cells }, seat).catch(() => {});
  }

  const myTurn = () => room && room.phase === 'playing' && view.phase === 'battle' && seat !== null && view.turn === seat;

  function fleetChips(p) {
    const sunk = new Set(view.players[p].sunk.map((x) => x.id));
    return h('div', { class: 'fleet-status' }, view.fleet.map((f) => h('span', { class: ['chip', sunk.has(f.id) && 'sunk'], title: sunk.has(f.id) ? 'Sunk' : 'Afloat' }, `${f.name} (${f.len})`)));
  }

  function shotText(last) {
    if (!last) return '';
    const hits = last.results.filter((r) => r.hit);
    const sunk = last.results.filter((r) => r.sunk).map((r) => view.fleet.find((f) => f.id === r.sunk)?.name);
    if (sunk.length) return `sank the ${sunk.join(' and the ')}!`;
    if (last.results.length > 1) return `${hits.length} hit${hits.length === 1 ? '' : 's'} out of ${last.results.length}`;
    return hits.length ? `hit at ${cellName(last.results[0].cell)}!` : `missed at ${cellName(last.results[0].cell)}`;
  }

  function showPreview(g) {
    g.querySelectorAll('.place-ok, .place-bad').forEach((c) => c.classList.remove('place-ok', 'place-bad'));
    const p = previewFor(hoverCell);
    if (!p) return;
    for (const i of p.cells) g.querySelector(`[data-i="${i}"]`)?.classList.add(p.ok ? 'place-ok' : 'place-bad');
  }

  function renderPlacement() {
    const me = view.players[seat];
    if (me.ready) {
      const opp = view.players[1 - seat];
      fill(el, 
        h('div', { class: 'bs-board-title' }, icon('check', 18), 'Your fleet is deployed'),
        grid({ shots: me.shots, ships: me.ships || [], fleet: view.fleet, label: 'Your fleet' }),
        opp.ready ? null : h('p', { class: 'muted' }, `Waiting for ${room.seats[1 - seat].name} to deploy…`),
        opp.ready ? null : h('button', { class: 'btn btn-sm', type: 'button', onClick: () => ctx.act({ type: 'unready' }, seat) }, 'Rearrange ships'),
      );
      return;
    }
    if (selected === undefined) selected = view.fleet[0].id;
    const ships = view.fleet.filter((f) => placed[f.id]).map((f) => ({ id: f.id, ...placed[f.id] }));
    const g = grid({
      shots: null,
      ships,
      fleet: view.fleet,
      preview: previewFor(hoverCell),
      onCell: placeAt,
      onHover: (i) => {
        hoverCell = i;
        showPreview(g);
      },
      label: 'Place your fleet',
    });
    const roster = h(
      'div',
      { class: 'fleet-roster' },
      view.fleet.map((f) =>
        h(
          'button',
          {
            type: 'button',
            class: ['roster-ship', placed[f.id] && 'placed'],
            'aria-pressed': String(selected === f.id),
            onClick: () => {
              if (placed[f.id]) {
                dir = placed[f.id].dir;
                delete placed[f.id];
              }
              selected = f.id;
              render();
            },
          },
          h('span', { class: 'pips' }, Array.from({ length: f.len }, () => h('i'))),
          f.name,
        ),
      ),
    );
    const allPlaced = view.fleet.every((f) => placed[f.id]);
    fill(el, 
      h('div', { class: 'bs-board-title' }, 'Deploy your fleet', h('span', { class: 'chip' }, dir === 'h' ? 'Horizontal' : 'Vertical')),
      h('p', { class: 'muted small', style: { margin: 0, textAlign: 'center' } }, selected ? 'Tap the grid to place the highlighted ship. Tap a placed ship to move it. Press R or Rotate to turn it.' : 'All set? Press Ready, or tap a ship to move it.'),
      g,
      roster,
      h(
        'div',
        { class: 'row', style: { justifyContent: 'center' } },
        h('button', { class: 'btn btn-sm', type: 'button', onClick: rotate }, icon('rotate', 16), 'Rotate'),
        h('button', { class: 'btn btn-sm', type: 'button', onClick: randomize }, icon('shuffle', 16), 'Random'),
        h(
          'button',
          {
            class: 'btn btn-sm btn-ghost',
            type: 'button',
            onClick: () => {
              resetPlacement();
              render();
            },
          },
          icon('trash', 16),
          'Clear',
        ),
        h('button', { class: 'btn btn-primary', type: 'button', disabled: !allPlaced, onClick: ready }, icon('check', 16), 'Ready'),
      ),
    );
  }

  function renderBattle() {
    const spectator = seat === null;
    const me = spectator ? 0 : seat;
    const opp = 1 - me;
    const over = view.phase === 'over';
    const oppView = view.players[opp];
    const myView = view.players[me];
    const oppShips = over && oppView.ships ? oppView.ships : oppView.sunk.map((x) => ({ ...x, sunk: true }));
    const targetGrid = grid({
      shots: oppView.shots,
      ships: oppShips,
      fleet: view.fleet,
      targetable: myTurn(),
      aim,
      fresh: fresh.theirs,
      onCell: spectator ? null : fire,
      label: spectator ? `${room.seats[opp].name}'s waters` : 'Enemy waters',
    });
    const myShips = myView.ships || myView.sunk.map((x) => ({ ...x, sunk: true }));
    const ownGrid = grid({ shots: myView.shots, ships: myShips, fleet: view.fleet, small: !spectator, fresh: fresh.mine, label: 'Your fleet' });
    const salvoBar =
      view.mode === 'salvo' && myTurn()
        ? h(
            'div',
            { class: 'row', style: { justifyContent: 'center' } },
            h('span', { class: 'chip' }, `Targets ${aim.size} / ${view.shotsAllowed}`),
            h('button', { class: 'btn btn-primary', type: 'button', disabled: aim.size !== view.shotsAllowed, onClick: fireSalvo }, 'Fire salvo'),
          )
        : null;
    fill(el, 
      h(
        'div',
        { class: 'bs-boards' },
        h(
          'div',
          { class: 'bs-board-wrap' },
          h('div', { class: 'bs-board-title' }, icon('eye', 16), spectator ? `${room.seats[opp].name}'s fleet` : `Enemy waters: ${room.seats[opp].name}`),
          targetGrid,
          fleetChips(opp),
        ),
        h(
          'div',
          { class: 'bs-board-wrap' },
          h('div', { class: 'bs-board-title' }, spectator ? `${room.seats[me].name}'s fleet` : 'Your fleet'),
          ownGrid,
          fleetChips(me),
        ),
      ),
      salvoBar,
    );
  }

  function renderPassScreen() {
    const who = room.seats[seat].name;
    el.append(
      h(
        'div',
        { class: 'pass-screen' },
        passNote ? h('p', { class: 'muted' }, passNote) : null,
        h('h2', `Pass the device to ${who}`),
        h('p', { class: 'muted' }, 'No peeking at the other fleet!'),
        h(
          'button',
          {
            class: 'btn btn-primary btn-lg',
            type: 'button',
            onClick: () => {
              shownSeat = seat;
              passNote = '';
              render();
            },
          },
          `I'm ${who}, show my board`,
        ),
      ),
    );
  }

  function render() {
    if (!view) return;
    const localPair = ctx.isLocal() && room.you.seats.length > 1;
    if (view.phase === 'placing' && seat !== null && !view.players[seat].ready) renderPlacement();
    else if (view.phase === 'placing' && seat !== null) renderPlacement();
    else if (view.phase === 'placing') fill(el, h('p', { class: 'muted' }, 'The admirals are deploying their fleets…'));
    else renderBattle();
    if (localPair && view.phase !== 'over' && room.phase === 'playing' && shownSeat !== seat) {
      el.style.position = 'relative';
      renderPassScreen();
    }
    fill(side, 
      h('div', { class: 'panel-title' }, 'Battle report'),
      h('p', { class: 'small muted', style: { margin: '0 0 8px' } }, { classic: 'Classic rules: one shot per turn.', streak: 'Streak rules: keep firing while you hit.', salvo: 'Salvo rules: one shot per surviving ship.' }[view.mode]),
      view.last ? h('p', { style: { margin: 0 } }, h('strong', room.seats[view.last.by].name), ' ', shotText(view.last)) : h('p', { class: 'muted small', style: { margin: 0 } }, 'No shots fired yet.'),
      view.phase !== 'placing'
        ? h(
            'div',
            { class: 'small muted', style: { marginTop: '8px', display: 'grid', gap: '2px' } },
            [0, 1].map((p) => {
              const st = view.players[p].stats;
              return h('span', `${room.seats[p].name}: ${st.shots} shots, ${st.hits} hits${st.shots ? ` (${Math.round((100 * st.hits) / st.shots)}%)` : ''}`);
            }),
          )
        : null,
    );
  }

  document.addEventListener('keydown', onKey);
  function onKey(e) {
    if ((e.key === 'r' || e.key === 'R') && view?.phase === 'placing' && !e.target.closest('input, textarea')) rotate();
  }

  return {
    el,
    side,
    update(r, v, s) {
      const firstView = !view;
      const seatChanged = s !== seat;
      room = r;
      view = v;
      seat = s;
      if (firstView || seatChanged || (v.phase === 'placing' && s !== null && !v.players[s].ready && Object.keys(placed).length === 0)) {
        if (firstView || seatChanged) resetPlacement();
      }
      if (seatChanged && !firstView && ctx.isLocal() && v.last) passNote = `${room.seats[v.last.by].name} ${shotText(v.last)}`;
      // Sounds and fresh-mark animation for new shots.
      const key = v.last ? `${v.last.by}:${v.last.results.map((x) => x.cell).join(',')}:${v.players[0].stats.shots + v.players[1].stats.shots}` : '';
      fresh = { mine: new Set(), theirs: new Set() };
      if (key && key !== lastShotKey && lastShotKey !== null) {
        const cells = new Set(v.last.results.map((x) => x.cell));
        const byMe = s !== null && v.last.by === s;
        if (byMe || s === null) fresh.theirs = cells;
        else fresh.mine = cells;
        if (!firstView) {
          if (v.last.results.some((x) => x.sunk)) ctx.play('sink');
          else if (v.last.results.some((x) => x.hit)) ctx.play('boom');
          else ctx.play('splash');
        }
      }
      lastShotKey = key;
      if (!myTurn()) aim = new Set();
      render();
    },
    status(r, v, s) {
      if (r.phase !== 'playing' || !v) return null;
      if (v.phase === 'placing') {
        if (s === null) return 'Fleets are being deployed';
        if (!v.players[s].ready) return ctx.isLocal() ? `${r.seats[s].name}: deploy your fleet` : 'Deploy your fleet, then press Ready';
        return `Waiting for ${r.seats[1 - s].name} to deploy`;
      }
      if (s !== null && v.turn === s) {
        const prefix = ctx.isLocal() ? `${r.seats[s].name}: ` : '';
        if (v.last && v.last.by === s && v.mode === 'streak') return `${prefix}Hit! Fire again`;
        return v.mode === 'salvo' ? `${prefix}Pick ${v.shotsAllowed} targets and fire the salvo` : `${prefix}Your shot: pick a target in enemy waters`;
      }
      return null;
    },
    destroy() {
      document.removeEventListener('keydown', onKey);
    },
  };
}
