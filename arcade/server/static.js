// Minimal static file server with ETags, gzip, SPA fallback and base-path templating.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.webmanifest', '.svg', '.txt']);

export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; " +
    "connect-src 'self' ws: wss:; media-src 'self' data: blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'self'",
};

export function createStatic({ mounts, basePath, spaIndex, log }) {
  // mounts: [{ prefix: 'shared/', dir }, { prefix: '', dir }] (prefix relative to basePath)
  const cache = new Map(); // abs path -> { mtimeMs, size, body, gzip, etag }

  function resolve(rel) {
    for (const m of mounts) {
      if (!rel.startsWith(m.prefix)) continue;
      const sub = rel.slice(m.prefix.length);
      const abs = path.join(m.dir, sub);
      if (abs !== m.dir && !abs.startsWith(m.dir + path.sep)) return null;
      return abs;
    }
    return null;
  }

  function load(abs) {
    let st;
    try {
      st = fs.statSync(abs);
    } catch {
      return null;
    }
    if (!st.isFile()) return null;
    const hit = cache.get(abs);
    if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return hit;
    let body = fs.readFileSync(abs);
    const ext = path.extname(abs).toLowerCase();
    if (abs === spaIndex) body = Buffer.from(body.toString('utf8').replaceAll('%BASE%', basePath));
    const entry = {
      mtimeMs: st.mtimeMs,
      size: st.size,
      body,
      gzip: COMPRESSIBLE.has(ext) && body.length > 512 ? zlib.gzipSync(body, { level: 6 }) : null,
      etag: `"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`,
      type: MIME[ext] || 'application/octet-stream',
    };
    cache.set(abs, entry);
    return entry;
  }

  function send(req, res, entry, status = 200) {
    const headers = {
      ...SECURITY_HEADERS,
      'Content-Type': entry.type,
      'Cache-Control': 'no-cache',
      ETag: entry.etag,
      Vary: 'Accept-Encoding',
    };
    if (req.headers['if-none-match'] === entry.etag) {
      res.writeHead(304, headers);
      res.end();
      return;
    }
    let body = entry.body;
    if (entry.gzip && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
      body = entry.gzip;
      headers['Content-Encoding'] = 'gzip';
    }
    headers['Content-Length'] = body.length;
    res.writeHead(status, headers);
    res.end(req.method === 'HEAD' ? undefined : body);
  }

  /** Handles a GET/HEAD for `rel` (path relative to basePath, no leading slash). Returns true if handled. */
  return function serve(req, res, rel) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;
    let decoded;
    try {
      decoded = decodeURIComponent(rel);
    } catch {
      return false;
    }
    if (decoded.includes('\0')) return false;
    const clean = path.posix.normalize('/' + decoded).slice(1);
    if (clean.split('/').includes('..')) return false;
    const abs = resolve(clean === '' ? 'index.html' : clean);
    let entry = abs ? load(abs) : null;
    if (!entry && path.posix.extname(clean) === '') {
      // Client-side route: serve the app shell.
      entry = load(spaIndex);
    }
    if (!entry) return false;
    try {
      send(req, res, entry);
    } catch (e) {
      log?.warn('static send failed', e.message);
    }
    return true;
  };
}
