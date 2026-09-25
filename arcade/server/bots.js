// A small worker-thread pool for computer players. With size 0 bots run inline (used by tests).
import { Worker } from 'node:worker_threads';
import { ENGINES } from '../shared/games/index.js';
import { seeded } from '../shared/lib/rng.js';

const WORKER_URL = new URL('./bot-worker.js', import.meta.url);

// Thinking time per game and level (milliseconds). Only the searching games use it.
const BUDGETS = {
  chess: { easy: 300, medium: 800, hard: 1600 },
  checkers: { easy: 300, medium: 600, hard: 1400 },
  connect4: { easy: 200, medium: 400, hard: 1000 },
};

export function budgetFor(game, level) {
  return BUDGETS[game]?.[level] ?? 500;
}

export class BotPool {
  constructor({ size = 1, log }) {
    this.size = size;
    this.log = log;
    this.workers = [];
    this.queue = [];
    this.nextId = 1;
    this.closed = false;
  }

  run({ game, state, player, level }) {
    const job = {
      id: this.nextId++,
      game,
      state,
      player,
      level,
      seed: (Math.random() * 4294967296) >>> 0,
      budgetMs: budgetFor(game, level),
    };
    if (this.size === 0) return this.runInline(job);
    return new Promise((resolve, reject) => {
      this.queue.push({ job, resolve, reject });
      this.pump();
    });
  }

  runInline(job) {
    return new Promise((resolve, reject) => {
      setImmediate(() => {
        try {
          const now = Date.now();
          resolve(
            ENGINES[job.game].bot(job.state, job.player, job.level, {
              rng: seeded(job.seed),
              now,
              deadline: now + job.budgetMs,
            }),
          );
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  spawn() {
    const worker = new Worker(WORKER_URL);
    const w = { worker, busy: null, timer: null };
    worker.on('message', (msg) => {
      const task = w.busy;
      if (!task || task.job.id !== msg.id) return;
      clearTimeout(w.timer);
      w.busy = null;
      if (msg.error) task.reject(new Error(msg.error));
      else task.resolve(msg.action);
      this.pump();
    });
    worker.on('error', (err) => {
      this.log?.error('bot worker crashed', err);
      this.retire(w, err);
    });
    worker.on('exit', (code) => {
      if (code !== 0 && !this.closed) this.retire(w, new Error(`bot worker exited with ${code}`));
    });
    worker.unref();
    this.workers.push(w);
    return w;
  }

  retire(w, err) {
    const i = this.workers.indexOf(w);
    if (i >= 0) this.workers.splice(i, 1);
    clearTimeout(w.timer);
    if (w.busy) {
      w.busy.reject(err);
      w.busy = null;
    }
    w.worker.terminate().catch(() => {});
    if (!this.closed) this.pump();
  }

  pump() {
    if (this.closed) return;
    while (this.queue.length) {
      let w = this.workers.find((x) => !x.busy);
      if (!w && this.workers.length < this.size) w = this.spawn();
      if (!w) return;
      const task = this.queue.shift();
      w.busy = task;
      w.timer = setTimeout(() => this.retire(w, new Error('bot timed out')), task.job.budgetMs + 15000);
      w.worker.postMessage(task.job);
    }
  }

  async close() {
    this.closed = true;
    for (const t of this.queue) t.reject(new Error('shutting down'));
    this.queue = [];
    await Promise.all(this.workers.map((w) => w.worker.terminate().catch(() => {})));
    this.workers = [];
  }
}
