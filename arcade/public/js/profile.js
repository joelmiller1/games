// The player's identity lives in localStorage so a refresh (or a phone waking up) keeps your seat.
import { PLAYER_COLORS } from '../shared/games/meta.js';

const KEY = 'arcade.profile.v1';
const ADJ = ['Swift', 'Lucky', 'Clever', 'Brave', 'Jolly', 'Mighty', 'Sneaky', 'Cosmic', 'Happy', 'Turbo', 'Witty', 'Bold'];
const ANIMALS = ['Otter', 'Falcon', 'Panda', 'Fox', 'Koala', 'Tiger', 'Walrus', 'Gecko', 'Lynx', 'Puffin', 'Badger', 'Yak'];

// crypto.getRandomValues works on plain-http LAN pages (randomUUID does not).
export function randomId(bytes = 16) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

function randomName() {
  const r = new Uint8Array(2);
  crypto.getRandomValues(r);
  return `${ADJ[r[0] % ADJ.length]} ${ANIMALS[r[1] % ANIMALS.length]}`;
}

let memory = null;

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && p.id && p.secret && p.name) return p;
    }
  } catch {
    /* storage blocked */
  }
  return null;
}

function write(p) {
  memory = p;
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage blocked: keep it in memory for this tab */
  }
}

export function getProfile() {
  if (memory) return memory;
  let p = read();
  if (!p) {
    const c = new Uint8Array(1);
    crypto.getRandomValues(c);
    p = { id: randomId(), secret: randomId(), name: randomName(), color: PLAYER_COLORS[c[0] % PLAYER_COLORS.length] };
    write(p);
  }
  memory = p;
  return p;
}

export function updateProfile(changes) {
  const p = { ...getProfile(), ...changes };
  write(p);
  return p;
}

export function resetIdentity() {
  return updateProfile({ id: randomId(), secret: randomId() });
}

export function pref(key, fallback) {
  try {
    const v = localStorage.getItem('arcade.pref.' + key);
    return v === null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}

export function setPref(key, value) {
  try {
    localStorage.setItem('arcade.pref.' + key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}
