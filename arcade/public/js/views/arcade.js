// Solo and pass-and-play page for the browser arcade games (Tetris, Asteroids, Snake, Minesweeper).
// Players take turns, one game each, on the same seed (same pieces / rocks / minefield).
import { h, fill } from '../ui.js';
import { icon } from '../icons.js';
import { net } from '../net.js';
import { getProfile } from '../profile.js';
import { play } from '../sound.js';
import { getGame, normalizeOptions, formatScore, scoring } from '../../shared/games/meta.js';
import { fetchBoards } from './home.js';
import { navigate } from '../router.js';

export const GAME_MODULES = {
  tetris: () => import('../arcade/tetris.js'),
  asteroids: () => import('../arcade/asteroids.js'),
  snake: () => import('../arcade/snake.js'),
  minesweeper: () => import('../arcade/minesweeper.js'),
  breakout: () => import('../arcade/breakout.js'),
  2048: () => import('../arcade/g2048.js'),
  bejeweled: () => import('../arcade/bejeweled.js'),
};

function cleanName(n, i) {
  const s = String(n || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 20);
  return s || `Player ${i + 1}`;
}

export function keysHelp(info) {
  return h(
    'div',
    { class: 'keys' },
    info.keys.flatMap(([ks, what]) => [h('span', ks.map((k, i) => [i ? ' ' : null, h('kbd', k)])), h('span', what)]),
  );
}

/** One-line description of the options in play, e.g. "Expert: 30×16, 99 mines". */
export function optionSummary(meta, options) {
  return meta.options
    .map((o) => o.choices?.find((c) => c.value === options[o.key])?.label)
    .filter(Boolean)
    .join(' · ');
}

/** Big 3-2-1 in an overlay, then resolves. */
export function countdown(overlay, title, sub) {
  return new Promise((resolve) => {
    let n = 3;
    overlay.hidden = false;
    const tick = () => {
      if (!overlay.isConnected) return;
      if (n === 0) {
        overlay.hidden = true;
        play('join');
        resolve();
        return;
      }
      fill(overlay, h('h2', title), h('p', { class: 'big-code' }, String(n)), sub ? h('p', { class: 'muted' }, sub) : null);
      play('click');
      n--;
      setTimeout(tick, 650);
    };
    tick();
  });
}

export function mount(el, { game: id }, query) {
  const meta = getGame(id);
  if (!meta || !GAME_MODULES[id]) {
    navigate('', { replace: true });
    return null;
  }
  const sc = scoring(meta);
  const options = normalizeOptions(meta, Object.fromEntries(query.entries()));
  const raw = query.get('players');
  const names = (raw ? raw.split('|') : [getProfile().name]).slice(0, 4).map(cleanName);
  let mod = null;
  let game = null;
  let seed = 0;
  let turn = 0;
  let results = [];
  let live = names.map(() => ({ score: 0, stat: 0 }));
  let paused = false;
  let playing = false;
  let closed = false;

  const host = h('div', { class: 'ar-host' });
  const overlay = h('div', { class: 'pb-overlay ar-overlay' });
  const pauseBtn = h('button', { class: 'icon-btn ar-pause', type: 'button', 'aria-label': 'Pause', onClick: () => setPaused(!paused) }, h('span', { 'aria-hidden': 'true' }, '❚❚'));
  const stage = h('div', { class: 'ar-stage' }, host, overlay, pauseBtn);
  const scoreList = h('div', { class: 'pb-scores' });
  const controls = h('div');
  const boardList = h('div', { class: 'fame' });
  const variant = optionSummary(meta, options);

  el.append(
    h(
      'div',
      { class: 'arcade-page', style: { '--accent-c': meta.accent } },
      h(
        'aside',
        { class: 'pinball-side left' },
        h('a', { class: 'btn btn-sm btn-ghost', href: `play/${id}`, 'data-link': true }, icon('back', 16), `${meta.name} menu`),
        h('section', { class: 'panel' }, h('div', { class: 'panel-title' }, names.length > 1 ? 'Players' : 'Score'), scoreList),
        h('section', { class: 'panel' }, h('div', { class: 'panel-title' }, 'Controls'), controls),
      ),
      stage,
      h(
        'aside',
        { class: 'pinball-side right' },
        h(
          'section',
          { class: 'panel' },
          h('div', { class: 'panel-title' }, icon('trophy', 18), sc.format === 'time' ? 'Best times' : 'High scores'),
          sc.boardBy && variant ? h('p', { class: 'small muted', style: { margin: '-4px 0 10px' } }, variant) : null,
          boardList,
        ),
      ),
    ),
  );

  function renderScores() {
    fill(
      scoreList,
      ...names.map((n, i) => {
        const done = results[i];
        const cur = playing && i === turn ? live[i] : null;
        const value = done ? (done.ok ? formatScore(meta, done.score) : 'did not finish') : cur ? (sc.format === 'time' ? `${cur.stat}%` : formatScore(meta, cur.score)) : '—';
        const note = done ? (sc.stat && done.ok ? `${sc.stat} ${done.stat}${sc.statSuffix}` : '') : cur && sc.stat ? `${sc.stat} ${cur.stat}${sc.statSuffix}` : names.length > 1 && i === turn ? 'up next' : '';
        return h('div', { class: ['ar-score', i === turn && !done && 'me'] }, h('span', { class: 'n' }, n), h('span', { class: 'v' }, value), note ? h('span', { class: 's' }, note) : null);
      }),
    );
  }

  function loadBoard() {
    fetchBoards()
      .then((b) => {
        const board = b[id]?.boards?.find((x) => x.id === (sc.boardBy ? `${id}:${options[sc.boardBy]}` : id));
        const list = board?.scores || [];
        fill(
          boardList,
          list.length
            ? h('ol', { class: 'rank-list' }, list.map((s, i) => h('li', h('span', { class: 'pos' }, i + 1), h('span', { class: 'who' }, s.name), h('span', { class: 'val' }, formatScore(meta, s.score)))))
            : h('div', { class: 'empty' }, sc.format === 'time' ? 'No times yet. Be the first!' : 'No high scores yet. Be the first!'),
        );
      })
      .catch(() => {});
  }

  function showIntro() {
    overlay.hidden = false;
    pauseBtn.hidden = true;
    const first = names.length > 1 ? `${names[turn]}, you're up` : meta.name;
    fill(
      overlay,
      h('h2', first),
      h('p', { class: 'muted' }, names.length > 1 && turn === 0 ? `${names.length} players take turns, one game each, with the same ${{ minesweeper: 'minefield', tetris: 'pieces', 2048: 'tiles', bejeweled: 'gems', breakout: 'wall' }[id] || 'start'}.` : mod.info.intro),
      variant ? h('p', h('span', { class: 'chip' }, variant)) : null,
      h('div', { class: 'desktop-only' }, keysHelp(mod.info)),
      h('p', { class: 'muted small touch-only' }, mod.info.touch),
      h('button', { class: 'btn btn-primary btn-lg', type: 'button', onClick: begin }, icon('play', 18), 'Start'),
    );
  }

  async function begin() {
    if (game) game.destroy();
    fill(host);
    live[turn] = { score: 0, stat: 0 };
    playing = true;
    renderScores();
    game = mod.create({
      host,
      options,
      seed,
      onProgress: (p) => {
        live[turn] = p;
        renderScores();
      },
      onEnd: (r) => finishTurn(r),
    });
    await countdown(overlay, names.length > 1 ? names[turn] : 'Get ready', variant);
    if (closed) return;
    pauseBtn.hidden = false;
    paused = false;
    game.start();
  }

  function finishTurn(r) {
    results[turn] = r;
    playing = false;
    pauseBtn.hidden = true;
    renderScores();
    if (turn < names.length - 1) {
      const prev = names[turn];
      turn++;
      overlay.hidden = false;
      fill(
        overlay,
        h('h2', r.ok ? formatScore(meta, r.score) : 'Game over'),
        h('p', { class: 'muted' }, `${prev} ${r.ok ? (sc.format === 'time' ? 'cleared it' : 'scored that') : 'did not finish'}. Pass the device to ${names[turn]}.`),
        h('button', { class: 'btn btn-primary btn-lg', type: 'button', onClick: begin }, icon('play', 18), `${names[turn]}: start`),
      );
      play('bonus');
      return;
    }
    gameOver();
  }

  async function gameOver() {
    const order = results.map((r, i) => ({ r, i })).sort((a, b) => rankValue(a.r) - rankValue(b.r));
    const rows = order.map(({ r, i }, k) => h('div', { class: 'ar-score' }, h('span', { class: 'n' }, `${k + 1}. ${names[i]}`), h('span', { class: 'v' }, r.ok ? formatScore(meta, r.score) : 'did not finish')));
    const rankBox = h('p', { class: 'muted' }, 'Saving…');
    const solo = names.length === 1;
    const best = results[order[0].i];
    overlay.hidden = false;
    fill(
      overlay,
      h('h2', solo ? (best.ok ? (sc.format === 'time' ? 'Cleared!' : 'Game over') : 'Boom!') : best.ok ? `${names[order[0].i]} wins!` : 'Nobody finished'),
      solo && best.ok ? h('p', { class: 'big-code', style: { letterSpacing: '0.05em' } }, formatScore(meta, best.score)) : null,
      solo ? null : h('div', { class: 'pb-scores' }, rows),
      rankBox,
      h(
        'div',
        { class: 'row', style: { justifyContent: 'center' } },
        h('button', { class: 'btn btn-primary', type: 'button', onClick: newMatch }, icon('refresh', 16), 'Play again'),
        h('a', { class: 'btn', href: `play/${id}`, 'data-link': true }, 'Menu'),
      ),
    );
    play(best.ok ? 'win' : 'lose');
    const entries = results.map((r, i) => ({ r, name: names[i] })).filter(({ r }) => r.ok && r.score > 0);
    if (!entries.length) {
      fill(rankBox, sc.format === 'time' ? 'Clear the board to get on the leaderboard.' : '');
      return;
    }
    try {
      const res = await net.request({ t: 'score.submit', game: id, options, scores: entries.map(({ r, name }) => ({ name, score: r.score })) });
      const ranked = (res.ranks || []).map((rank, k) => (rank ? `${entries[k].name} is #${rank} on the ${sc.format === 'time' ? 'best times' : 'high score'} table!` : null)).filter(Boolean);
      fill(rankBox, ranked.length ? ranked.join(' ') : 'Not quite a record this time.');
      if (ranked.length) play('extra');
      loadBoard();
    } catch (e) {
      fill(rankBox, `Could not save: ${e.message}`);
    }
  }

  // Best first: points high to low, or times low to high; unfinished runs last (furthest first).
  function rankValue(r) {
    if (!r.ok) return 1e15 - (r.stat || 0);
    return sc.order === 'asc' ? r.score : -r.score;
  }

  function newMatch() {
    seed = Math.floor(Math.random() * 2147483647);
    turn = 0;
    results = [];
    live = names.map(() => ({ score: 0, stat: 0 }));
    renderScores();
    if (names.length > 1) showIntro();
    else begin();
  }

  function setPaused(p) {
    if (!playing || !game) return;
    paused = p;
    game.setPaused(p);
    if (p) {
      overlay.hidden = false;
      fill(overlay, h('h2', 'Paused'), h('p', { class: 'muted' }, 'Press P or Esc to carry on.'), h('button', { class: 'btn btn-primary btn-lg', type: 'button', onClick: () => setPaused(false) }, icon('play', 18), 'Resume'));
    } else overlay.hidden = true;
  }

  const onKey = (e) => {
    if (e.target.closest?.('input, textarea, select')) return;
    if (e.code === 'KeyP' || e.code === 'Escape') {
      if (playing) {
        e.preventDefault();
        setPaused(!paused);
      }
    } else if ((e.code === 'Enter' || e.code === 'Space') && !playing && !overlay.hidden) {
      const b = overlay.querySelector('.btn-primary');
      if (b && document.activeElement !== b) {
        e.preventDefault();
        b.click();
      }
    }
  };
  const onVisibility = () => document.visibilityState === 'hidden' && playing && !paused && setPaused(true);
  window.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', onVisibility);

  GAME_MODULES[id]().then((m) => {
    if (closed) return;
    mod = m;
    fill(controls, keysHelp(m.info));
    seed = Math.floor(Math.random() * 2147483647);
    renderScores();
    showIntro();
  });
  loadBoard();
  renderScores();

  return {
    unmount() {
      closed = true;
      game?.destroy();
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
