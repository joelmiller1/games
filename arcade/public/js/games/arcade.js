// Online score attack (Tetris, Asteroids, Snake) and race (Minesweeper): everyone plays their own
// game at the same time from the same seed, and scores stream to the table.
import { h, fill } from '../ui.js';
import { icon } from '../icons.js';
import { getGame, formatScore, scoring } from '../../shared/games/meta.js';
import { GAME_MODULES, keysHelp, countdown, optionSummary } from '../views/arcade.js';

export function create(ctx) {
  let room = null;
  let view = null;
  let seat = null;
  let meta = null;
  let sc = null;
  let game = null;
  let gameNo = null;
  let finished = false;
  let lastSent = 0;
  let pending = null;
  let playing = false;
  let paused = false;
  let destroyed = false;

  const host = h('div', { class: 'ar-host' });
  const overlay = h('div', { class: 'pb-overlay ar-overlay' });
  const pauseBtn = h('button', { class: 'icon-btn ar-pause', type: 'button', 'aria-label': 'Pause', hidden: true, onClick: () => setPaused(!paused) }, h('span', { 'aria-hidden': 'true' }, '❚❚'));
  const stage = h('div', { class: 'ar-stage ar-room-stage' }, host, overlay, pauseBtn);
  const el = h('div', { class: 'ar-room' }, stage);
  const board = h('div', { class: 'pb-scores' });
  const help = h('div', { style: { marginTop: '12px' } });
  const side = h('div', h('div', { class: 'panel-title' }, 'Live scores'), board, help);

  function send(type, p) {
    const now = Date.now();
    if (type === 'progress' && now - lastSent < 700) {
      pending = p;
      return;
    }
    lastSent = now;
    pending = null;
    ctx.act({ type, score: p.score, stat: p.stat, ok: p.ok }, seat).catch(() => {});
  }
  const flush = setInterval(() => {
    if (pending && !finished) send('progress', pending);
  }, 800);

  const me = () => (seat !== null && view ? view.players[seat] : null);

  async function startGame() {
    finished = false;
    lastSent = 0;
    pending = null;
    playing = false;
    game?.destroy();
    game = null;
    fill(host);
    const myNo = room.gameNo;
    const mod = await GAME_MODULES[room.game]();
    if (destroyed || myNo !== room.gameNo) return;
    fill(help, keysHelp(mod.info));
    game = mod.create({
      host,
      options: view.options,
      seed: view.seed,
      onProgress: (p) => send('progress', p),
      onEnd: (r) => {
        finished = true;
        playing = false;
        pauseBtn.hidden = true;
        send('finish', r);
        showWaiting(r);
      },
    });
    if (window.matchMedia?.('(max-width: 700px)').matches) stage.scrollIntoView?.({ block: 'end', behavior: 'smooth' });
    await countdown(overlay, 'Get ready', `${optionSummary(meta, view.options) || meta.name}. ${sc.order === 'asc' ? 'Fastest clear wins.' : 'Highest score wins.'}`);
    if (destroyed || myNo !== room.gameNo || room.phase !== 'playing') return;
    playing = true;
    paused = false;
    pauseBtn.hidden = false;
    game.start();
  }

  function showWaiting(r) {
    overlay.hidden = false;
    const left = view.players.filter((p, i) => !p.done && i !== seat).length;
    fill(
      overlay,
      h('h2', r.ok ? formatScore(meta, r.score) : sc.order === 'asc' ? 'Boom!' : 'Game over'),
      h('p', { class: 'muted' }, left ? 'Waiting for the others to finish…' : 'That was the last one!'),
      board.cloneNode(true),
    );
  }

  function showResume() {
    const m = me();
    overlay.hidden = false;
    fill(
      overlay,
      h('h2', 'Welcome back'),
      h('p', { class: 'muted' }, 'You left in the middle of your game, so it cannot carry on.'),
      h(
        'button',
        {
          class: 'btn btn-primary',
          type: 'button',
          onClick: () => {
            finished = true;
            ctx.act({ type: 'finish', score: m.score, stat: m.stat, ok: sc.order !== 'asc' }, seat).catch(() => {});
          },
        },
        sc.order === 'asc' ? 'Give up this race' : `Finish with ${formatScore(meta, m.score)}`,
      ),
    );
  }

  function statText(p) {
    if (sc.order === 'asc') {
      if (p.done) return p.ok ? 'cleared' : 'boom';
      return `${p.stat}${sc.statSuffix} cleared`;
    }
    if (p.done) return 'finished';
    return sc.stat ? `${sc.stat.toLowerCase()} ${p.stat}` : 'playing';
  }

  function valueText(p) {
    if (sc.order === 'asc') return p.done && p.ok ? formatScore(meta, p.score) : p.done ? '—' : '…';
    return formatScore(meta, p.score);
  }

  function renderBoard() {
    const rank = (p) => (sc.order === 'asc' ? (p.done && p.ok ? p.score : 1e15 - p.stat) : -p.score);
    const rows = view.players
      .map((p, i) => ({ ...p, i }))
      .sort((a, b) => rank(a) - rank(b))
      .map((p, k) =>
        h(
          'div',
          { class: ['ar-score', p.i === seat && 'me'] },
          h('span', { class: 'n' }, `${k + 1}. ${room.seats[p.i]?.name || 'Player'}`),
          h('span', { class: 'v' }, valueText(p)),
          h('span', { class: 's' }, statText(p)),
        ),
      );
    fill(board, ...rows);
  }

  function setPaused(p) {
    if (!playing || !game) return;
    paused = p;
    game.setPaused(p);
    if (p) {
      overlay.hidden = false;
      fill(overlay, h('h2', 'Paused'), h('p', { class: 'muted' }, 'The others keep playing!'), h('button', { class: 'btn btn-primary btn-lg', type: 'button', onClick: () => setPaused(false) }, icon('play', 18), 'Resume'));
    } else overlay.hidden = true;
  }

  const onKey = (e) => {
    if (e.target.closest?.('input, textarea, select')) return;
    if ((e.code === 'KeyP' || e.code === 'Escape') && playing) {
      e.preventDefault();
      setPaused(!paused);
    }
  };
  const onVisibility = () => document.visibilityState === 'hidden' && playing && !paused && setPaused(true);
  window.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', onVisibility);

  return {
    el,
    side,
    update(r, v, s) {
      room = r;
      view = v;
      seat = s;
      meta = getGame(r.game);
      sc = scoring(meta);
      renderBoard();
      if (seat === null) {
        overlay.hidden = false;
        fill(overlay, h('h2', sc.order === 'asc' ? 'Race in progress' : 'Score attack'), h('p', { class: 'muted' }, 'Everyone is playing on their own device. Follow the live scores.'), board.cloneNode(true));
        return;
      }
      if (r.phase === 'playing' && gameNo !== r.gameNo) {
        gameNo = r.gameNo;
        const m = me();
        if (m.done) {
          finished = true;
          showWaiting({ score: m.score, ok: m.ok });
        } else if (m.score > 0 || m.stat > 0) showResume();
        else startGame();
      } else if (finished && r.phase === 'playing') {
        const m = me();
        if (m.done) showWaiting({ score: m.score, ok: m.ok });
      }
      if (r.phase !== 'playing' && game) {
        playing = false;
        pauseBtn.hidden = true;
      }
    },
    status(r, v, s) {
      if (r.phase !== 'playing' || !v) return null;
      const scoring2 = scoring(getGame(r.game));
      if (s === null) return scoring2.order === 'asc' ? 'Race in progress' : 'Score attack in progress';
      const m = v.players[s];
      if (m.done) {
        const left = v.players.filter((p) => !p.done).length;
        return `Finished! Waiting for ${left} more player${left === 1 ? '' : 's'}`;
      }
      return scoring2.order === 'asc' ? 'Race: clear the minefield first' : 'Score attack: highest score wins';
    },
    destroy() {
      destroyed = true;
      clearInterval(flush);
      game?.destroy();
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
