// Playable pinball: ties the rules, renderer, sounds and keyboard/touch input together.
import { PinballRules, onPlunger } from './rules.js';
import { Renderer } from './render.js';
import { play } from '../sound.js';

const SOUND = {
  bumper: 'bumper',
  sling: 'sling',
  flipper: 'flipper',
  target: 'target',
  lane: 'lane',
  launch: 'launch',
  drain: 'drain',
  tilt: 'tilt',
  bonus: 'bonus',
  saucer: 'kicker',
  kicker: 'kicker',
  multiball: 'bonus',
  saved: 'bonus',
  tick: 'spinner',
  nudge: 'place',
};

const LEFT_KEYS = new Set(['KeyZ', 'ArrowLeft', 'ShiftLeft', 'KeyA']);
const RIGHT_KEYS = new Set(['KeyM', 'Slash', 'ArrowRight', 'ShiftRight', 'KeyL']);
const PLUNGER_KEYS = new Set(['Space', 'ArrowDown', 'Enter', 'KeyS']);
const NUDGE_KEYS = new Set(['KeyN', 'ArrowUp']);

export class PinballGame {
  /**
   * canvas: <canvas>; players: names; balls: per player
   * onEvent(ev): every rules event; onGameOver(scores)
   */
  constructor({ canvas, players, balls, onEvent, onGameOver }) {
    this.canvas = canvas;
    this.onEvent = onEvent || (() => {});
    this.onGameOver = onGameOver || (() => {});
    this.players = players;
    this.balls = balls;
    this.paused = false;
    this.touches = new Map(); // pointerId -> 'left' | 'right' | 'plunger'
    this.keys = new Set();
    this.rules = this.makeRules();
    this.renderer = new Renderer(canvas, this.rules);
    this.last = performance.now();
    this.running = true;

    this.onKeyDown = (e) => this.key(e, true);
    this.onKeyUp = (e) => this.key(e, false);
    this.onBlur = () => this.releaseAll();
    this.onResize = () => this.renderer.resize();
    this.onVisibility = () => document.visibilityState === 'hidden' && this.setPaused(true);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => this.renderer.resize()) : null;
    this.ro?.observe(canvas);
    canvas.addEventListener('pointerdown', (e) => this.pointer(e, true));
    canvas.addEventListener('pointerup', (e) => this.pointer(e, false));
    canvas.addEventListener('pointercancel', (e) => this.pointer(e, false));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.frame = this.frame.bind(this);
    requestAnimationFrame(this.frame);
  }

  makeRules() {
    return new PinballRules({
      players: this.players,
      balls: this.balls,
      onEvent: (ev) => {
        if (SOUND[ev.type]) play(SOUND[ev.type], ev.type === 'tick' ? 30 : 25);
        if (ev.type === 'gameOver') this.onGameOver(ev.scores);
        this.onEvent(ev);
      },
    });
  }

  restart() {
    this.rules = this.makeRules();
    this.renderer.setRules(this.rules);
    this.setPaused(false);
  }

  setPaused(p) {
    this.paused = p;
    if (p) this.releaseAll();
    this.onEvent({ type: p ? 'paused' : 'resumed' });
  }

  releaseAll() {
    this.rules.setFlipper('left', false);
    this.rules.setFlipper('right', false);
    if (this.rules.plunger.charging) this.rules.setPlunger(false);
    this.touches.clear();
    this.keys.clear();
  }

  key(e, down) {
    if (e.target.closest?.('input, textarea, select')) return;
    const code = e.code;
    const handled = LEFT_KEYS.has(code) || RIGHT_KEYS.has(code) || PLUNGER_KEYS.has(code) || NUDGE_KEYS.has(code) || code === 'KeyP' || code === 'Escape';
    if (!handled) return;
    e.preventDefault();
    if (down && e.repeat) return;
    if (code === 'KeyP' || code === 'Escape') {
      if (down && this.rules.phase !== 'over') this.setPaused(!this.paused);
      return;
    }
    if (this.paused) {
      if (down) this.setPaused(false);
      return;
    }
    if (LEFT_KEYS.has(code)) this.rules.setFlipper('left', down);
    else if (RIGHT_KEYS.has(code)) this.rules.setFlipper('right', down);
    else if (PLUNGER_KEYS.has(code)) this.rules.setPlunger(down);
    else if (NUDGE_KEYS.has(code) && down) this.rules.nudge();
  }

  pointer(e, down) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    if (down) {
      if (this.paused) return this.setPaused(false);
      this.canvas.setPointerCapture?.(e.pointerId);
      const rect = this.canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const ballWaiting = this.rules.world.balls.some((b) => !b.lost && onPlunger(b));
      let action = x < 0.5 ? 'left' : 'right';
      if (action === 'right' && ballWaiting && this.rules.phase === 'plunger') action = 'plunger';
      this.touches.set(e.pointerId, action);
      if (action === 'plunger') this.rules.setPlunger(true);
      else this.rules.setFlipper(action, true);
    } else {
      const action = this.touches.get(e.pointerId);
      if (!action) return;
      this.touches.delete(e.pointerId);
      if (action === 'plunger') this.rules.setPlunger(false);
      else if (![...this.touches.values()].includes(action)) this.rules.setFlipper(action, false);
    }
  }

  // Buttons for touch screens.
  plungerButton(down) {
    this.rules.setPlunger(down);
  }

  nudgeButton() {
    this.rules.nudge();
  }

  frame(now) {
    if (!this.running) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (!this.paused) this.rules.update(dt);
    this.renderer.draw(now);
    requestAnimationFrame(this.frame);
  }

  destroy() {
    this.running = false;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.ro?.disconnect();
  }
}
