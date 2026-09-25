import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function int(value, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function normalizeBasePath(p) {
  let base = String(p || '/').trim();
  if (!base.startsWith('/')) base = '/' + base;
  if (!base.endsWith('/')) base += '/';
  return base.replace(/\/{2,}/g, '/');
}

export function loadConfig(env = process.env) {
  const cpus = typeof os.availableParallelism === 'function' ? os.availableParallelism() : os.cpus().length;
  return {
    port: int(env.PORT, 8080, 0, 65535),
    host: env.HOST || '0.0.0.0',
    basePath: normalizeBasePath(env.BASE_PATH),
    dataDir: env.DATA_DIR ? path.resolve(env.DATA_DIR) : path.join(ROOT, 'data'),
    publicDir: path.join(ROOT, 'public'),
    sharedDir: path.join(ROOT, 'shared'),
    botThreads: int(env.BOT_THREADS, Math.max(1, Math.min(2, cpus - 1)), 0, 16),
    roomIdleMinutes: int(env.ROOM_IDLE_MINUTES, 30, 1),
    maxRooms: int(env.MAX_ROOMS, 300, 1),
    logLevel: env.LOG_LEVEL || 'info',
    version: env.APP_VERSION || process.env.npm_package_version || '1.0.0',
  };
}
