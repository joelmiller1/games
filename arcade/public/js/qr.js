// QR code generator: byte mode, error-correction level M, versions 1-10 (up to 213 bytes).
// Enough for "scan to join" links on a local network.

// Per version: [EC codewords per block, [[block count, data codewords per block], ...]]
const BLOCKS_M = {
  1: [10, [[1, 16]]],
  2: [16, [[1, 28]]],
  3: [26, [[1, 44]]],
  4: [18, [[2, 32]]],
  5: [24, [[2, 43]]],
  6: [16, [[4, 27]]],
  7: [18, [[4, 31]]],
  8: [22, [[2, 38], [2, 39]]],
  9: [22, [[3, 36], [2, 37]]],
  10: [26, [[4, 43], [1, 44]]],
};
const ALIGN = { 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50] };
const EC_FORMAT_M = 0; // format bits for level M

// GF(256) arithmetic with the QR polynomial x^8 + x^4 + x^3 + x^2 + 1.
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();
const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

function rsGenerator(n) {
  let g = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      next[j] ^= g[j];
      next[j + 1] ^= mul(g[j], EXP[i]);
    }
    g = next;
  }
  return g;
}

function rsRemainder(data, gen) {
  const n = gen.length - 1;
  const res = new Array(n).fill(0);
  for (const b of data) {
    const factor = b ^ res[0];
    res.shift();
    res.push(0);
    for (let i = 0; i < n; i++) res[i] ^= mul(gen[i + 1], factor);
  }
  return res;
}

function utf8(text) {
  return Array.from(new TextEncoder().encode(text));
}

function dataCapacity(v) {
  return BLOCKS_M[v][1].reduce((a, [count, len]) => a + count * len, 0);
}

function buildCodewords(bytes, v) {
  const capBytes = dataCapacity(v);
  const bits = [];
  const push = (val, len) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };
  push(0b0100, 4);
  push(bytes.length, v < 10 ? 8 : 16);
  for (const b of bytes) push(b, 8);
  const capBits = capBytes * 8;
  push(0, Math.min(4, capBits - bits.length));
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let pad = 0xec; data.length < capBytes; pad ^= 0xec ^ 0x11) data.push(pad);

  // Split into blocks, add error correction, interleave.
  const [ecLen, groups] = BLOCKS_M[v];
  const gen = rsGenerator(ecLen);
  const blocks = [];
  let k = 0;
  for (const [count, len] of groups) {
    for (let i = 0; i < count; i++) {
      const d = data.slice(k, k + len);
      k += len;
      blocks.push({ d, ec: rsRemainder(d, gen) });
    }
  }
  const out = [];
  const maxLen = Math.max(...blocks.map((b) => b.d.length));
  for (let i = 0; i < maxLen; i++) for (const b of blocks) if (i < b.d.length) out.push(b.d[i]);
  for (let i = 0; i < ecLen; i++) for (const b of blocks) out.push(b.ec[i]);
  return out;
}

const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x, y) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

export function qrMatrix(text) {
  const bytes = utf8(text);
  let v = 1;
  while (v <= 10 && 4 + (v < 10 ? 8 : 16) + bytes.length * 8 > dataCapacity(v) * 8) v++;
  if (v > 10) return null;
  const size = 17 + 4 * v;
  const mod = new Uint8Array(size * size);
  const fn = new Uint8Array(size * size);
  const set = (x, y, dark) => {
    mod[y * size + x] = dark ? 1 : 0;
    fn[y * size + x] = 1;
  };

  // Timing patterns, finders (with separators), alignment patterns.
  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        set(x, y, d !== 2 && d !== 4);
      }
    }
  }
  const al = ALIGN[v] || [];
  const lastA = al[al.length - 1];
  for (const cx of al) {
    for (const cy of al) {
      if ((cx === 6 && cy === 6) || (cx === 6 && cy === lastA) || (cx === lastA && cy === 6)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }

  const drawFormat = (mask) => {
    const data = (EC_FORMAT_M << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;
    const bit = (i) => (bits >>> i) & 1;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6));
    set(8, 8, bit(7));
    set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, 1); // the dark module
  };
  drawFormat(0); // reserve the area

  if (v >= 7) {
    let rem = v;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (v << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const b = (bits >>> i) & 1;
      const a = size - 11 + (i % 3);
      const c = Math.floor(i / 3);
      set(a, c, b);
      set(c, a, b);
    }
  }

  // Place data bits in the zig-zag order.
  const cw = buildCodewords(bytes, v);
  let bitIndex = 0;
  const totalBits = cw.length * 8;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        const idx = y * size + x;
        if (fn[idx]) continue;
        if (bitIndex < totalBits) {
          mod[idx] = (cw[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1;
          bitIndex++;
        }
      }
    }
  }

  const applyMask = (m) => {
    const f = MASKS[m];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y * size + x] && f(x, y)) mod[y * size + x] ^= 1;
  };

  let best = 0;
  let bestPenalty = Infinity;
  for (let m = 0; m < 8; m++) {
    applyMask(m);
    drawFormat(m);
    const p = penalty(mod, size);
    if (p < bestPenalty) {
      bestPenalty = p;
      best = m;
    }
    applyMask(m);
  }
  applyMask(best);
  drawFormat(best);
  return { size, version: v, dark: (x, y) => mod[y * size + x] === 1 };
}

function penalty(mod, size) {
  let p = 0;
  const at = (x, y) => mod[y * size + x];
  const F1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const F2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
  for (let pass = 0; pass < 2; pass++) {
    for (let a = 0; a < size; a++) {
      let run = 1;
      const line = [];
      for (let b = 0; b < size; b++) line.push(pass ? at(a, b) : at(b, a));
      for (let b = 1; b <= size; b++) {
        if (b < size && line[b] === line[b - 1]) run++;
        else {
          if (run >= 5) p += 3 + (run - 5);
          run = 1;
        }
      }
      for (let b = 0; b + 11 <= size; b++) {
        let m1 = true;
        let m2 = true;
        for (let k = 0; k < 11; k++) {
          if (line[b + k] !== F1[k]) m1 = false;
          if (line[b + k] !== F2[k]) m2 = false;
        }
        if (m1) p += 40;
        if (m2) p += 40;
      }
    }
  }
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const c = at(x, y);
      if (c === at(x + 1, y) && c === at(x, y + 1) && c === at(x + 1, y + 1)) p += 3;
    }
  }
  let dark = 0;
  for (let i = 0; i < mod.length; i++) dark += mod[i];
  p += Math.floor(Math.abs((dark * 100) / mod.length - 50) / 5) * 10;
  return p;
}

/** Returns an <svg> element for the text, or null if it is too long. */
export function qrSvg(text, { margin = 3, dark = '#0b1020', light = '#ffffff', size = 200 } = {}) {
  const q = qrMatrix(text);
  if (!q) return null;
  const n = q.size + margin * 2;
  let d = '';
  for (let y = 0; y < q.size; y++) {
    for (let x = 0; x < q.size; x++) if (q.dark(x, y)) d += `M${x + margin} ${y + margin}h1v1h-1z`;
  }
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${n} ${n}`);
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'QR code');
  const bg = document.createElementNS(NS, 'rect');
  bg.setAttribute('width', n);
  bg.setAttribute('height', n);
  bg.setAttribute('fill', light);
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', d);
  path.setAttribute('fill', dark);
  svg.append(bg, path);
  return svg;
}
