// History-API router. Paths are relative to <base href>, so the app also works under a sub-path.
import { fill } from './ui.js';

const routes = [];
let current = null;
let mountEl = null;
let onChange = null;

export const basePath = new URL(document.baseURI).pathname;

export function route(pattern, load) {
  const keys = [];
  const re = new RegExp(
    '^' +
      pattern.replace(/:([a-z]+)/g, (_, k) => {
        keys.push(k);
        return '([^/]+)';
      }) +
      '/?$',
  );
  routes.push({ re, keys, load });
}

export function relPath(pathname = location.pathname) {
  return pathname.startsWith(basePath) ? pathname.slice(basePath.length) : pathname.replace(/^\//, '');
}

export function href(rel) {
  return new URL(rel, document.baseURI).pathname;
}

export function absoluteUrl(rel) {
  return new URL(rel, document.baseURI).toString();
}

export async function render() {
  const rel = decodeURIComponent(relPath());
  const query = new URLSearchParams(location.search);
  let match = null;
  for (const r of routes) {
    const m = r.re.exec(rel);
    if (m) {
      const params = {};
      r.keys.forEach((k, i) => (params[k] = m[i + 1]));
      match = { r, params };
      break;
    }
  }
  if (current?.unmount) {
    try {
      current.unmount();
    } catch (e) {
      console.error(e);
    }
  }
  current = null;
  fill(mountEl);
  window.scrollTo(0, 0);
  if (!match) {
    navigate('', { replace: true });
    return;
  }
  const mod = await match.r.load();
  current = mod.mount(mountEl, { ...match.params }, query) || null;
  onChange?.(rel);
}

export function navigate(rel, { replace = false } = {}) {
  const u = new URL(rel, document.baseURI);
  const url = u.pathname + u.search;
  if (replace) history.replaceState({}, '', url);
  else history.pushState({}, '', url);
  render();
}

export function startRouter(el, changed) {
  mountEl = el;
  onChange = changed;
  window.addEventListener('popstate', () => render());
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-link]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const url = new URL(a.href);
    if (url.origin !== location.origin) return;
    e.preventDefault();
    navigate(relPath(url.pathname) + url.search);
  });
  render();
}
