// WebSocket client with automatic reconnect, request/response and server clock sync.
import { getProfile, resetIdentity } from './profile.js';

export class Net {
  constructor() {
    this.ws = null;
    this.status = 'connecting';
    this.handlers = new Map();
    this.pending = new Map();
    this.rid = 0;
    this.queue = [];
    this.ready = false;
    this.backoff = 500;
    this.clockOffset = 0; // serverTime - localTime
    this.lastPong = Date.now();
    this.welcome = null;
    this.pingTimer = null;
  }

  url() {
    const u = new URL('ws', document.baseURI);
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
    return u.toString();
  }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(fn);
    return () => this.handlers.get(type)?.delete(fn);
  }

  emit(type, data) {
    for (const fn of this.handlers.get(type) || []) {
      try {
        fn(data);
      } catch (e) {
        console.error(e);
      }
    }
  }

  setStatus(status) {
    if (this.status === status) return;
    this.status = status;
    this.emit('status', status);
  }

  connect() {
    if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) return;
    this.setStatus('connecting');
    let ws;
    try {
      ws = new WebSocket(this.url());
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.backoff = 500;
      this.hello();
    };
    ws.onmessage = (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      this.lastPong = Date.now();
      this.handle(msg);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ready = false;
      this.ws = null;
      for (const [, p] of this.pending) p.reject(new Error('Connection lost'));
      this.pending.clear();
      this.setStatus('offline');
      this.scheduleReconnect();
    };
    ws.onerror = () => {};
    if (!this.pingTimer) {
      this.pingTimer = setInterval(() => this.keepAlive(), 15000);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') this.keepAlive(true);
      });
      window.addEventListener('online', () => this.connect());
    }
  }

  scheduleReconnect() {
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.connect(), this.backoff);
    this.backoff = Math.min(5000, this.backoff * 1.6);
  }

  keepAlive(force = false) {
    if (!this.ws || this.ws.readyState !== 1) {
      if (force) this.connect();
      return;
    }
    // A socket that went quiet (e.g. a phone that slept) is replaced rather than trusted.
    if (Date.now() - this.lastPong > 40000) {
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
      return;
    }
    this.pingSent = Date.now();
    this.raw({ t: 'ping' });
  }

  hello() {
    const p = getProfile();
    this.helloSent = Date.now();
    this.raw({ t: 'hello', id: p.id, secret: p.secret, name: p.name, color: p.color });
  }

  raw(msg) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(msg));
  }

  handle(msg) {
    switch (msg.t) {
      case 'welcome': {
        const rtt = Date.now() - this.helloSent;
        this.clockOffset = msg.time + rtt / 2 - Date.now();
        this.welcome = msg;
        this.ready = true;
        this.setStatus('online');
        const q = this.queue;
        this.queue = [];
        for (const m of q) this.raw(m);
        this.emit('ready', msg);
        return;
      }
      case 'identity.reset':
        resetIdentity();
        setTimeout(() => this.hello(), 50);
        return;
      case 'pong':
        if (this.pingSent) {
          const rtt = Date.now() - this.pingSent;
          const offset = msg.time + rtt / 2 - Date.now();
          this.clockOffset = this.clockOffset * 0.7 + offset * 0.3;
        }
        return;
      case 'res': {
        const p = this.pending.get(msg.rid);
        if (!p) return;
        this.pending.delete(msg.rid);
        if (msg.ok) p.resolve(msg.data);
        else p.reject(new Error(msg.error || 'Request failed'));
        return;
      }
      default:
        this.emit(msg.t, msg);
    }
  }

  /** Fire-and-forget; queued until the connection is ready. */
  send(msg) {
    if (this.ready) this.raw(msg);
    else this.queue.push(msg);
  }

  /** Request with a response. Rejects with the server's error message. */
  request(msg, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const rid = ++this.rid;
      const timer = setTimeout(() => {
        if (this.pending.delete(rid)) reject(new Error('The server did not answer'));
      }, timeout);
      this.pending.set(rid, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      this.send({ ...msg, rid });
    });
  }

  serverNow() {
    return Date.now() + this.clockOffset;
  }
}

export const net = new Net();
