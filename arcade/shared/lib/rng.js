// Small, fast, seedable PRNG helpers shared by the server, bots and tests.

/** mulberry32: returns a function producing floats in [0, 1). */
export function seeded(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A non-deterministic rng (Math.random), matching the seeded() signature. */
export const random = () => Math.random();

export function randInt(rng, n) {
  return Math.floor(rng() * n);
}

export function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

export function shuffle(rng, list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function randomSeed() {
  return (Math.random() * 4294967296) >>> 0;
}
