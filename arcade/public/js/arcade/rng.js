// Seedable PRNG (mulberry32, the same algorithm as shared/lib/rng.js). A copy lives here so the
// browser games' rules also load in Node tests, where the server's /shared mount does not exist.
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
