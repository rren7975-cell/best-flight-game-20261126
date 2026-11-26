// The world the plane flies over: rolling terrain, a river and a road, the
// ring course, the slalom gates and the runway. Pure functions of the seed:
// the same seed builds the same valley, so a screenshot scene replays.
import { MISSIONS, WORLD } from './config.js';
import { makeNoise } from './random.js';

/** Terrain height (metres) at forward distance z and lateral offset x. */
export function makeTerrain(random) {
  const n1 = makeNoise(random);
  const n2 = makeNoise(random);
  const n3 = makeNoise(random);
  return function terrainHeight(x, z) {
    const along = z / WORLD.hillWavelength;
    const across = x / 420;
    // A valley along the course centre (x = 0) so the runway sits flat.
    const valley = Math.min(1, Math.abs(x) / 900);
    const hills = n1(along * 1.7) * 0.6 + n2(along * 0.6 + 9) * 0.35
      + n3(across * 2.2 + along) * 0.3;
    const base = 12 + hills * WORLD.hillHeight;
    return Math.max(0, base * (0.25 + 0.75 * valley));
  };
}

/** Build the course: rings, gates and runway, from the seed. */
export function makeCourse(random) {
  const rings = [];
  const spacing = 780;
  for (let i = 0; i < WORLD.ringCount; i += 1) {
    rings.push({
      kind: 'ring',
      z: 900 + i * spacing,
      x: (random() * 2 - 1) * 260,
      y: 150 + random() * 130,
      passed: false,
      missed: false,
    });
  }
  const gates = [];
  for (let i = 0; i < WORLD.gateCount; i += 1) {
    gates.push({
      kind: 'gate',
      z: 900 + WORLD.ringCount * spacing + 500 + i * 700,
      x: (i % 2 === 0 ? -1 : 1) * (150 + random() * 110),
      y: 120 + random() * 120,
      passed: false,
      missed: false,
    });
  }
  return {
    rings,
    gates,
    runway: {
      z: WORLD.runwayAt,
      x: 0,
      length: WORLD.runwayLength,
      width: WORLD.runwayWidth,
    },
  };
}

/** The mission the plane is flying, from how many targets are resolved. */
export function missionFor(ringsResolved, gatesResolved) {
  if (ringsResolved < WORLD.ringCount) return { index: 0, ...MISSIONS[0] };
  if (gatesResolved < WORLD.gateCount) return { index: 1, ...MISSIONS[1] };
  return { index: 2, ...MISSIONS[2] };
}

/** The next target the plane should aim at, or null on final approach. */
export function nextTarget(course, ringsResolved, gatesResolved) {
  if (ringsResolved < WORLD.ringCount) return course.rings[ringsResolved];
  if (gatesResolved < WORLD.gateCount) return course.gates[gatesResolved];
  return null;
}
