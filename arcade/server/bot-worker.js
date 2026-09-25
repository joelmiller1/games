// Worker thread that computes computer-player moves so searches never block the event loop.
import { parentPort } from 'node:worker_threads';
import { ENGINES } from '../shared/games/index.js';
import { seeded } from '../shared/lib/rng.js';

parentPort.on('message', (job) => {
  try {
    const engine = ENGINES[job.game];
    const now = Date.now();
    const action = engine.bot(job.state, job.player, job.level, {
      rng: seeded(job.seed),
      now,
      deadline: now + job.budgetMs,
    });
    parentPort.postMessage({ id: job.id, action });
  } catch (e) {
    parentPort.postMessage({ id: job.id, error: String((e && e.stack) || e) });
  }
});
