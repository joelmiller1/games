// Helpers shared by the browser arcade games: canvas sizing, a fixed-step game loop,
// press-and-hold touch buttons and keyboard handling that ignores text fields.

/** Size a canvas for crisp drawing on high-DPI screens. Returns the device pixel ratio used. */
export function fitCanvas(canvas, cssW, cssH) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  const w = Math.max(1, Math.round(cssW * dpr));
  const h = Math.max(1, Math.round(cssH * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  return dpr;
}

/** requestAnimationFrame loop with a fixed update step, so games play the same on any screen. */
export class Loop {
  constructor({ step = 1 / 120, update, render }) {
    this.step = step;
    this.update = update;
    this.render = render;
    this.paused = false;
    this.running = false;
    this.acc = 0;
    this.frame = this.frame.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this.frame);
  }

  frame(now) {
    if (!this.running) return;
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (!this.paused) {
      this.acc += dt;
      let n = 0;
      while (this.acc >= this.step && n++ < 40) {
        this.update(this.step);
        this.acc -= this.step;
      }
    }
    this.render(dt);
    requestAnimationFrame(this.frame);
  }

  stop() {
    this.running = false;
  }
}

/**
 * Press-and-hold button (multi-touch safe). repeat = { delay, every } in ms repeats `down`.
 */
export function holdButton(el, { down, up, repeat } = {}) {
  let id = null;
  let timer = null;
  const start = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    if (id !== null) return;
    id = e.pointerId;
    try {
      el.setPointerCapture(id);
    } catch {
      /* pointer already gone */
    }
    el.classList.add('pressed');
    down?.();
    if (repeat) {
      const again = () => {
        down?.();
        timer = setTimeout(again, repeat.every);
      };
      timer = setTimeout(again, repeat.delay);
    }
  };
  const end = (e) => {
    if (e.pointerId !== id) return;
    id = null;
    clearTimeout(timer);
    el.classList.remove('pressed');
    up?.();
  };
  el.addEventListener('pointerdown', start);
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('lostpointercapture', end);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  return el;
}

/** Keyboard listener that leaves text fields (like the table chat) alone. Returns a remover. */
export function listenKeys(onDown, onUp) {
  const typing = (e) => e.target.closest?.('input, textarea, select, [contenteditable]');
  const down = (e) => {
    if (typing(e)) return;
    if (onDown(e) === true) e.preventDefault();
  };
  const up = (e) => {
    if (typing(e)) return;
    if (onUp?.(e) === true) e.preventDefault();
  };
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  return () => {
    window.removeEventListener('keydown', down);
    window.removeEventListener('keyup', up);
  };
}

/** Watch an element's size. Returns a disconnect function. */
export function onResize(el, fn) {
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => fn()) : null;
  ro?.observe(el);
  window.addEventListener('resize', fn);
  return () => {
    ro?.disconnect();
    window.removeEventListener('resize', fn);
  };
}

export const coarsePointer = () => window.matchMedia?.('(pointer: coarse)').matches;
