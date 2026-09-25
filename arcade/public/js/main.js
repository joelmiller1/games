// App bootstrap: header controls, profile, connection status and routes.
import { h, modal, toast, initials, fill } from './ui.js';
import { icon } from './icons.js';
import { net } from './net.js';
import { getProfile, updateProfile, pref, setPref } from './profile.js';
import { route, startRouter } from './router.js';
import { soundEnabled, setSound, play } from './sound.js';
import { PLAYER_COLORS } from '../shared/games/meta.js';

// ---- theme ----
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f3f5fb' : '#0b1020');
  const btn = document.getElementById('theme-toggle');
  fill(btn, icon(theme === 'light' ? 'moon' : 'sun', 18));
  btn.title = theme === 'light' ? 'Dark theme' : 'Light theme';
}
let theme = pref('theme', window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
applyTheme(theme);
document.getElementById('theme-toggle').addEventListener('click', () => {
  theme = theme === 'light' ? 'dark' : 'light';
  setPref('theme', theme);
  applyTheme(theme);
});

// ---- sound ----
function renderSoundBtn() {
  const btn = document.getElementById('sound-toggle');
  fill(btn, icon(soundEnabled() ? 'soundOn' : 'soundOff', 18));
  btn.title = soundEnabled() ? 'Mute sounds' : 'Unmute sounds';
  btn.setAttribute('aria-pressed', String(soundEnabled()));
}
renderSoundBtn();
document.getElementById('sound-toggle').addEventListener('click', () => {
  setSound(!soundEnabled());
  renderSoundBtn();
  play('click');
});

// ---- profile ----
function renderProfile() {
  const p = getProfile();
  const chip = document.getElementById('profile-chip');
  const av = chip.querySelector('.avatar');
  av.textContent = initials(p.name);
  av.style.background = p.color;
  chip.querySelector('.name').textContent = p.name;
}
renderProfile();

export async function editProfile() {
  const p = getProfile();
  let color = p.color;
  const input = h('input', { class: 'input', maxlength: 20, value: p.name, 'aria-label': 'Your name', autocomplete: 'nickname' });
  const swatches = h(
    'div',
    { class: 'swatches', role: 'group', 'aria-label': 'Colour' },
    PLAYER_COLORS.map((c) =>
      h('button', {
        type: 'button',
        class: 'swatch',
        style: { background: c },
        'aria-label': c,
        'aria-pressed': String(c === color),
        onClick: (e) => {
          color = c;
          swatches.querySelectorAll('.swatch').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget)));
        },
      }),
    ),
  );
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') input.closest('.modal').querySelector('.btn-primary').click();
  });
  const ok = await modal({
    title: 'Your player',
    body: [h('label', { class: 'field' }, 'Name', input), h('div', { class: 'field' }, h('span', 'Colour'), swatches)],
    actions: [
      { label: 'Cancel', value: false },
      { label: 'Save', value: true, primary: true },
    ],
  });
  if (!ok) return;
  const name = input.value.replace(/\s+/g, ' ').trim().slice(0, 20);
  if (!name) return;
  updateProfile({ name, color });
  renderProfile();
  net.send({ t: 'profile', name, color });
  toast(`You are now ${name}`, 'good');
}
document.getElementById('profile-chip').addEventListener('click', editProfile);

// ---- connection status ----
const statusEl = document.getElementById('net-status');
const LABELS = { online: 'Online', connecting: 'Connecting', offline: 'Reconnecting' };
function renderStatus(s) {
  statusEl.className = `net-status ${s}`;
  statusEl.querySelector('.label').textContent = LABELS[s] || s;
  statusEl.title = s === 'online' ? 'Connected to the game server' : 'Trying to reach the game server…';
}
renderStatus(net.status);
net.on('status', renderStatus);
net.on('welcome', () => {});
net.on('server.restart', () => toast('The server is restarting…', 'info', 5000));
net.connect();

// ---- routes ----
route('', () => import('./views/home.js'));
route('play/:game', () => import('./views/setup.js'));
route('room/:code', () => import('./views/room.js'));
route('pinball', () => import('./views/pinball.js'));
route('arcade/:game', () => import('./views/arcade.js'));

startRouter(document.getElementById('view'), () => {
  document.getElementById('view').focus({ preventScroll: true });
});
