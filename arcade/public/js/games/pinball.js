// Online pinball "score attack": everyone plays their own table; scores stream to the room.
import { h, fill } from '../ui.js';
import { PinballGame } from '../pinball/game.js';
import { keysHelp, touchControls } from '../views/pinball.js';

export function create(ctx) {
  let room = null;
  let view = null;
  let seat = null;
  let game = null;
  let gameNo = null;
  let lastSent = 0;
  let pending = null;
  let finished = false;
  let countdown = null;

  const canvas = h('canvas', { class: 'pinball-canvas', 'aria-label': 'Pinball table' });
  const overlay = h('div', { class: 'pb-overlay' });
  const stage = h('div', { class: 'pb-room-stage' }, canvas, overlay, touchControls(() => game));
  const board = h('div', { class: 'pb-scores' });
  const el = h('div', { class: 'pb-room' }, stage);
  const side = h('div', h('div', { class: 'panel-title' }, 'Live scores'), board, h('div', { style: { marginTop: '12px' } }, keysHelp()));

  function send(type, score, ball) {
    const now = Date.now();
    if (type === 'progress' && now - lastSent < 700) {
      pending = { score, ball };
      return;
    }
    lastSent = now;
    pending = null;
    ctx.act({ type, score, ball }, seat).catch(() => {});
  }

  const flush = setInterval(() => {
    if (pending && !finished) send('progress', pending.score, pending.ball);
  }, 800);

  function startGame() {
    finished = false;
    lastSent = 0;
    overlay.hidden = false;
    let n = 3;
    const tick = () => {
      if (!room || room.phase !== 'playing') return;
      if (n === 0) {
        overlay.hidden = true;
        ctx.play('launch');
        const me = room.seats[seat];
        if (game) game.restart();
        else {
          game = new PinballGame({
            canvas,
            players: [me.name],
            balls: view.balls,
            onEvent: (ev) => {
              if (ev.type === 'score') send('progress', ev.score, game.rules.player.ball);
              if (ev.type === 'newBall') send('progress', game.rules.player.score, ev.ball);
            },
            onGameOver: (scores) => {
              finished = true;
              ctx.act({ type: 'finish', score: scores[0] }, seat).catch(() => {});
              overlay.hidden = false;
              fill(overlay, h('h2', 'Game over'), h('p', { class: 'big-code', style: { letterSpacing: '0.05em' } }, scores[0].toLocaleString()), h('p', { class: 'muted' }, 'Waiting for the others to finish…'));
            },
          });
        }
        return;
      }
      fill(overlay, h('h2', 'Get ready'), h('p', { class: 'big-code' }, String(n)), h('p', { class: 'muted' }, `${view.balls} balls. Highest score wins.`));
      ctx.play('click');
      n--;
      countdown = setTimeout(tick, 800);
    };
    tick();
  }

  function renderBoard() {
    const rows = view.players
      .map((p, i) => ({ ...p, i }))
      .sort((a, b) => b.score - a.score)
      .map((p, k) =>
        h(
          'div',
          { class: ['pb-score', p.i === seat && 'me'] },
          h('span', `${k + 1}. ${room.seats[p.i]?.name || 'Player'}`),
          h('span', { class: 'muted small' }, p.done ? 'finished' : `ball ${p.ball}/${view.balls}`),
          h('span', { class: 'v' }, p.score.toLocaleString()),
        ),
      );
    fill(board, ...rows);
  }

  return {
    el,
    side,
    update(r, v, s) {
      room = r;
      view = v;
      seat = s;
      renderBoard();
      if (seat === null) {
        overlay.hidden = false;
        fill(overlay, h('h2', 'Score attack'), h('p', { class: 'muted' }, 'Everyone is playing on their own device. Follow the live scores.'), board.cloneNode(true));
        return;
      }
      if (r.phase === 'playing' && gameNo !== r.gameNo) {
        gameNo = r.gameNo;
        clearTimeout(countdown);
        startGame();
      }
    },
    status(r, v, s) {
      if (r.phase !== 'playing' || !v) return null;
      if (s === null) return 'Score attack in progress';
      const me = v.players[s];
      if (me.done) {
        const left = v.players.filter((p) => !p.done).length;
        return `Finished! Waiting for ${left} more player${left === 1 ? '' : 's'}`;
      }
      return `Score attack: ball ${me.ball} of ${v.balls}`;
    },
    destroy() {
      clearInterval(flush);
      clearTimeout(countdown);
      game?.destroy();
    },
  };
}
