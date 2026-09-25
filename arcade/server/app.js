// Wires the HTTP server, static files, JSON API and WebSocket hub together.
import http from 'node:http';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { createStatic, SECURITY_HEADERS } from './static.js';
import { Hub } from './hub.js';
import { Store } from './store.js';
import { BotPool } from './bots.js';
import { createLogger } from './log.js';
import { GAMES } from '../shared/games/meta.js';

export async function createApp(config) {
  const log = config.log || createLogger(config.logLevel);
  const store = new Store({ dir: config.dataDir, log });
  await store.load();
  const bots = new BotPool({ size: config.botThreads, log });
  const hub = new Hub({ config, store, bots, log });
  const base = config.basePath;
  let ready = true;

  const serveStatic = createStatic({
    mounts: [
      { prefix: 'shared/', dir: config.sharedDir },
      { prefix: '', dir: config.publicDir },
    ],
    basePath: base,
    spaIndex: path.join(config.publicDir, 'index.html'),
    log,
  });

  function json(res, status, body) {
    const data = JSON.stringify(body);
    res.writeHead(status, {
      ...SECURITY_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Length': Buffer.byteLength(data),
    });
    res.end(data);
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://local');
    const pathname = url.pathname;
    // Probes answer at the root regardless of BASE_PATH so Kubernetes config stays simple.
    if (pathname === '/healthz') return json(res, 200, { ok: true });
    if (pathname === '/readyz') return json(res, ready ? 200 : 503, { ready });
    if (base !== '/' && pathname === base.slice(0, -1)) {
      res.writeHead(301, { Location: base });
      return res.end();
    }
    if (!pathname.startsWith(base)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    const rel = pathname.slice(base.length);
    if (rel === 'api/info') return json(res, 200, { version: config.version, games: GAMES, ...hub.info() });
    if (rel === 'api/leaderboards') return json(res, 200, hub.leaderboards());
    if (rel.startsWith('api/')) return json(res, 404, { error: 'not found' });
    if (serveStatic(req, res, rel)) return;
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  });
  server.keepAliveTimeout = 65000;

  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  server.on('upgrade', (req, socket, head) => {
    const { pathname } = new URL(req.url, 'http://local');
    if (pathname !== `${base}ws`) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => hub.onConnection(ws, req));
  });
  const heartbeat = setInterval(() => hub.heartbeat(), 25000);
  heartbeat.unref();

  return {
    server,
    hub,
    store,
    log,
    listen(port = config.port, host = config.host) {
      return new Promise((resolve) => server.listen(port, host, () => resolve(server.address())));
    },
    async close() {
      ready = false;
      clearInterval(heartbeat);
      hub.shutdown();
      await store.flush();
      await bots.close();
      for (const ws of wss.clients) ws.terminate();
      wss.close();
      await new Promise((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections?.();
      });
    },
  };
}
