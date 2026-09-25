// Synthesised sound effects (Web Audio). No audio files needed.
import { pref, setPref } from './profile.js';

let ctx = null;
let master = null;
let noiseBuf = null;
let enabled = pref('sound', true);
const last = new Map();

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

// Browsers only allow audio after a user gesture.
for (const ev of ['pointerdown', 'keydown']) {
  document.addEventListener(ev, () => enabled && audio(), { capture: true, passive: true });
}

function tone({ freq, type = 'sine', dur = 0.12, vol = 0.3, attack = 0.004, slide = 0, delay = 0 }) {
  const c = audio();
  if (!c) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.03);
}

function noise({ dur = 0.2, vol = 0.3, freq = 1000, type = 'lowpass', q = 1, delay = 0 }) {
  const c = audio();
  if (!c) return;
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = c.currentTime + delay;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.03);
}

const arp = (notes, { type = 'triangle', step = 0.11, dur = 0.25, vol = 0.18 } = {}) =>
  notes.forEach((f, i) => tone({ freq: f, type, dur, vol, delay: i * step }));

const SFX = {
  click: () => tone({ freq: 660, type: 'triangle', dur: 0.05, vol: 0.12 }),
  place: () => {
    tone({ freq: 330, type: 'triangle', dur: 0.1, vol: 0.22 });
    noise({ dur: 0.05, vol: 0.08, freq: 2500 });
  },
  move: () => {
    noise({ dur: 0.07, vol: 0.4, freq: 1700, type: 'bandpass', q: 2 });
    tone({ freq: 190, dur: 0.08, vol: 0.2 });
  },
  capture: () => {
    noise({ dur: 0.12, vol: 0.5, freq: 1300, type: 'bandpass', q: 1.4 });
    tone({ freq: 140, dur: 0.14, vol: 0.25 });
  },
  check: () => {
    tone({ freq: 880, type: 'square', dur: 0.08, vol: 0.07 });
    tone({ freq: 660, type: 'square', dur: 0.1, vol: 0.07, delay: 0.09 });
  },
  drop: () => {
    tone({ freq: 900, slide: 280, dur: 0.18, vol: 0.1 });
    noise({ dur: 0.06, vol: 0.3, freq: 3000, delay: 0.17 });
  },
  dice: () => {
    for (let i = 0; i < 7; i++) noise({ dur: 0.04, vol: 0.25, freq: 2500 + Math.random() * 2500, type: 'bandpass', q: 3, delay: i * 0.055 + Math.random() * 0.02 });
  },
  hold: () => tone({ freq: 520, type: 'triangle', dur: 0.05, vol: 0.12 }),
  score: () => arp([660, 880], { step: 0.07, dur: 0.12, vol: 0.12 }),
  splash: () => {
    noise({ dur: 0.45, vol: 0.35, freq: 900 });
    tone({ freq: 420, slide: 120, dur: 0.3, vol: 0.06 });
  },
  boom: () => {
    noise({ dur: 0.7, vol: 0.6, freq: 520 });
    tone({ freq: 90, slide: 40, dur: 0.5, vol: 0.35, type: 'sawtooth' });
  },
  sink: () => {
    SFX.boom();
    tone({ freq: 300, slide: 60, dur: 1.2, vol: 0.14, type: 'triangle', delay: 0.25 });
  },
  win: () => arp([523, 659, 784, 1047]),
  lose: () => arp([392, 330, 262], { step: 0.16, dur: 0.3 }),
  draw: () => arp([440, 440], { step: 0.18, dur: 0.2, vol: 0.14 }),
  turn: () => tone({ freq: 740, dur: 0.12, vol: 0.1 }),
  chat: () => tone({ freq: 1200, dur: 0.06, vol: 0.07 }),
  join: () => arp([587, 880], { step: 0.08, dur: 0.12, vol: 0.1 }),
  bumper: () => {
    tone({ freq: 1040, type: 'square', dur: 0.07, vol: 0.09 });
    tone({ freq: 1560, dur: 0.1, vol: 0.09 });
  },
  flipper: () => noise({ dur: 0.05, vol: 0.18, freq: 1100, type: 'bandpass', q: 1 }),
  sling: () => tone({ freq: 480, slide: 920, type: 'square', dur: 0.06, vol: 0.08 }),
  target: () => tone({ freq: 880, slide: 1320, type: 'triangle', dur: 0.12, vol: 0.14 }),
  lane: () => tone({ freq: 1320, type: 'triangle', dur: 0.08, vol: 0.1 }),
  launch: () => noise({ dur: 0.3, vol: 0.3, freq: 650 }),
  drain: () => tone({ freq: 400, slide: 70, type: 'sawtooth', dur: 0.7, vol: 0.13 }),
  tilt: () => tone({ freq: 110, type: 'square', dur: 0.7, vol: 0.14 }),
  bonus: () => arp([784, 988, 1175, 1568], { type: 'square', step: 0.07, dur: 0.1, vol: 0.07 }),
  spinner: () => tone({ freq: 1500, type: 'square', dur: 0.02, vol: 0.04 }),
  kicker: () => tone({ freq: 240, slide: 760, type: 'sawtooth', dur: 0.12, vol: 0.1 }),
};

export function play(name, minGapMs = 25) {
  if (!enabled || !SFX[name]) return;
  const now = performance.now();
  if (now - (last.get(name) || 0) < minGapMs) return;
  last.set(name, now);
  try {
    SFX[name]();
  } catch {
    /* audio unavailable */
  }
}

export function soundEnabled() {
  return enabled;
}

export function setSound(on) {
  enabled = !!on;
  setPref('sound', enabled);
  if (enabled) audio();
}
