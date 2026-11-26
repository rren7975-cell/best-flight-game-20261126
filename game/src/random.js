// A small seeded random number generator (mulberry32): the same seed gives
// the same world, which is what makes the screenshot scenes repeatable.
export function createRandom(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A smooth 1-D noise value in [-1, 1] from a seeded lattice. */
export function makeNoise(random) {
  const lattice = [];
  for (let i = 0; i < 64; i += 1) lattice.push(random() * 2 - 1);
  const fade = (t) => t * t * (3 - 2 * t);
  return function noise(x) {
    const xi = Math.floor(x);
    const xf = x - xi;
    const a = lattice[((xi % 64) + 64) % 64];
    const b = lattice[(((xi + 1) % 64) + 64) % 64];
    return a + (b - a) * fade(xf);
  };
}
