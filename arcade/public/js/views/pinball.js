// Pinball page for solo and pass-and-play games (runs entirely in the browser).
import { h, fill } from '../ui.js';
import { icon } from '../icons.js';
import { net } from '../net.js';
import { getProfile } from '../profile.js';
import { PinballGame } from '../pinball/game.js';
import { play } from '../sound.js';
import { fetchBoards } from './home.js';

function cleanName(n, i) {
  const s = String(n || '').replace(/\s+/g, ' ').trim().slice(0, 20);
  return s || `Player ${i + 1}`;
}

export function keysHelp() {
  return h(
    'div',
    { class: 'keys' },
    h('span', h('kbd', 'Z'), ' ', h('kbd', '←')),
    h('span', 'Left flipper'),
    h('span', h('kbd', 'M'), ' ', h('kbd', '→')),
    h('span', 'Right flipper'),
    h('span', h('kbd', 'Space'), ' ', h('kbd', '↓')),
    h('span', 'Hold & release to launch'),
    h('span', h('kbd', 'N'), ' ', h('kbd', '↑')),
    h('span', 'Nudge (careful!)'),
    h('span', h('kbd', 'P')),
    h('span', 'Pause'),
  );
}

export function touchControls(getGame) {
  const launch = h('button', { class: 'btn btn-primary', type: 'button' }, 'Launch');
  const down = (e) => {
    e.preventDefault();
    getGame()?.plungerButton(true);
  };
  const up = (e) => {
    e.preventDefault();
    getGame()?.plungerButton(false);
  };
  launch.addEventListener('pointerdown', down);
  launch.addEventListener('pointerup', up);
  launch.addEventListener('pointercancel', up);
  const nudge = h('button', { class: 'btn', type: 'button', onClick: () => getGame()?.nudgeButton() }, 'Nudge');
  return h('div', { class: 'pinball-controls' }, launch, nudge);
}

export function mount(el, _params, query) {
  const balls = query.get('balls') === '5' ? 5 : 3;
  const raw = query.get('players');
  const names = (raw ? raw.split('|') : [getProfile().name]).slice(0, 4).map(cleanName);
  let game = null;
  let submitted = false;

  const canvas = h('canvas', { class: 'pinball-canvas', 'aria-label': 'Pinball table' });
  const overlay = h('div', { class: 'pb-overlay' });
  const scoreList = h('div', { class: 'pb-scores' });
  const boardList = h('div', { class: 'fame' });
  const stage = h('div', { class: 'pinball-stage' }, canvas, overlay, touchControls(() => game));

  el.append(
    h(
      'div',
      { class: 'pinball-page' },
      h(
        'aside',
        { class: 'pinball-side left' },
        h('a', { class: 'btn btn-sm btn-ghost', href: 'play/pinball', 'data-link': true }, icon('back', 16), 'Pinball menu'),
        h('section', { class: 'panel' }, h('div', { class: 'panel-title' }, 'Players'), scoreList),
        h('section', { class: 'panel' }, h('div', { class: 'panel-title' }, 'Controls'), keysHelp()),
      ),
      stage,
      h('aside', { class: 'pinball-side right' }, h('section', { class: 'panel' }, h('div', { class: 'panel-title' }, icon('trophy', 18), 'High scores'), boardList)),
    ),
  );

  function renderScores() {
    const r = game?.rules;
    fill(
      scoreList,
      ...names.map((n, i) =>
        h(
          'div',
          { class: ['pb-score', r && r.current === i && r.phase !== 'over' && 'me'] },
          h('span', n),
          h('span', { class: 'muted small' }, r ? (r.players[i].done ? 'done' : `ball ${r.players[i].ball}`) : ''),
          h('span', { class: 'v' }, (r ? r.players[i].score : 0).toLocaleString()),
        ),
      ),
    );
  }

  function loadBoard() {
    fetchBoards()
      .then((b) => {
        const list = b.pinball?.boards?.[0]?.scores || [];
        fill(
          boardList,
          list.length
            ? h(
                'ol',
                { class: 'rank-list' },
                list.map((s, i) => h('li', h('span', { class: 'pos' }, i + 1), h('span', { class: 'who' }, s.name), h('span', { class: 'val' }, s.score.toLocaleString()))),
              )
            : h('div', { class: 'empty' }, 'No high scores yet. Be the first!'),
        );
      })
      .catch(() => {});
  }

  function showStart() {
    overlay.hidden = false;
    fill(
      overlay,
      h('h2', names.length > 1 ? `${names.length} players` : 'Pinball'),
      h('p', { class: 'muted' }, names.length > 1 ? `${names.join(', ')} take turns, ${balls} balls each.` : `${balls} balls. Light the lanes, drop the targets and hit the saucer three times for multiball.`),
      keysHelp(),
      h('p', { class: 'muted small' }, 'On a touch screen: tap the left or right half of the table for the flippers, and hold Launch to shoot.'),
      h('button', { class: 'btn btn-primary btn-lg', type: 'button', onClick: start }, icon('play', 18), 'Start'),
    );
  }

  async function gameOver(scores) {
    renderScores();
    const order = scores.map((s, i) => ({ s, i })).sort((a, b) => b.s - a.s);
    const rows = order.map(({ s, i }, k) => h('div', { class: 'pb-score' }, h('span', `${k + 1}. ${names[i]}`), h('span', { class: 'v' }, s.toLocaleString())));
    const rankBox = h('p', { class: 'muted' }, 'Saving scores…');
    overlay.hidden = false;
    fill(
      overlay,
      h('h2', 'Game over'),
      names.length > 1 ? h('p', `${names[order[0].i]} wins!`) : h('p', { class: 'big-code', style: { letterSpacing: '0.05em' } }, scores[0].toLocaleString()),
      h('div', { class: 'pb-scores' }, rows),
      rankBox,
      h(
        'div',
        { class: 'row', style: { justifyContent: 'center' } },
        h('button', { class: 'btn btn-primary', type: 'button', onClick: start }, icon('refresh', 16), 'Play again'),
        h('a', { class: 'btn', href: 'play/pinball', 'data-link': true }, 'Menu'),
      ),
    );
    play(scores.length > 1 ? 'win' : 'bonus');
    if (submitted) return;
    submitted = true;
    try {
      const res = await net.request({ t: 'score.submit', game: 'pinball', scores: names.map((name, i) => ({ name, score: scores[i] })) });
      const ranked = (res.ranks || []).map((r, i) => (r ? `${names[i]} is #${r} on the high score table!` : null)).filter(Boolean);
      fill(rankBox, ranked.length ? ranked.join(' ') : 'Not quite a high score this time.');
      if (ranked.length) play('win');
      loadBoard();
    } catch (e) {
      fill(rankBox, `Could not save scores: ${e.message}`);
    }
  }

  function start() {
    overlay.hidden = true;
    submitted = false;
    play('click');
    if (game) game.restart();
    else {
      game = new PinballGame({
        canvas,
        players: names,
        balls,
        onGameOver: gameOver,
        onEvent: (ev) => {
          if (ev.type === 'score' || ev.type === 'newBall') renderScores();
          if (ev.type === 'paused') {
            overlay.hidden = false;
            fill(overlay, h('h2', 'Paused'), h('p', { class: 'muted' }, 'Press P, or tap the table, to carry on.'), h('button', { class: 'btn btn-primary', type: 'button', onClick: () => game.setPaused(false) }, 'Resume'));
          } else if (ev.type === 'resumed' && game?.rules.phase !== 'over') overlay.hidden = true;
        },
      });
    }
    renderScores();
    canvas.focus?.();
  }

  showStart();
  renderScores();
  loadBoard();
  const onKey = (e) => {
    if (!overlay.hidden && (e.code === 'Space' || e.code === 'Enter') && !game) {
      e.preventDefault();
      start();
    }
  };
  window.addEventListener('keydown', onKey);
  return {
    unmount() {
      game?.destroy();
      window.removeEventListener('keydown', onKey);
    },
  };
}
