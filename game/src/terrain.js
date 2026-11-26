// The world the plane flies over: rolling terrain, a river and a road, the
// 24-ring three-stage course, moving obstacles and the runway. Pure
// functions of the seed: the same seed builds the same valley, so a
// screenshot scene replays.
import { MISSIONS, STAGES, WORLD } from './config.js';
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
    let height = Math.max(0, base * (0.25 + 0.75 * valley));
    // Flatten the final-approach corridor (z past 19000, near the centre
    // line) so the descent to the runway never meets a surprise hill.
    if (z > 19000 && Math.abs(x) < 220) {
      const edge = Math.min(1, Math.abs(x) / 220);
      height *= 0.15 + 0.85 * edge;
    }
    return height;
  };
}

/** Which stage a resolved-ring count belongs to: 0, 1, 2, or 3 (landing). */
export function stageFor(ringsResolved) {
  if (ringsResolved < WORLD.ringsPerStage) return 0;
  if (ringsResolved < WORLD.ringsPerStage * 2) return 1;
  if (ringsResolved < WORLD.totalRings) return 2;
  return 3;
}

/** Build the course: 24 rings in three stages, obstacles, and runway. */
export function makeCourse(random) {
  const rings = [];
  // Stage 1 Alpine Valley: wide valley rings, z 900..6360.
  for (let i = 0; i < WORLD.ringsPerStage; i += 1) {
    rings.push({
      kind: 'ring', stage: 0,
      z: 900 + i * 780,
      x: (random() * 2 - 1) * 260,
      y: 150 + random() * 130,
      radius: STAGES[0].radius,
      passed: false, missed: false,
    });
  }
  // Stage 2 Coastal Cliffs: sea-cliff rings, z 7400..12860.
  for (let i = 0; i < WORLD.ringsPerStage; i += 1) {
    rings.push({
      kind: 'ring', stage: 1,
      z: 7400 + i * 780,
      x: (random() * 2 - 1) * 300,
      y: 140 + random() * 140,
      radius: STAGES[1].radius,
      passed: false, missed: false,
    });
  }
  // Stage 3 Desert Canyon: tighter slalom rings, z 13900..18800.
  for (let i = 0; i < WORLD.ringsPerStage; i += 1) {
    rings.push({
      kind: 'ring', stage: 2,
      z: 13900 + i * 700,
      x: (i % 2 === 0 ? -1 : 1) * (150 + random() * 110),
      y: 120 + random() * 120,
      radius: STAGES[2].radius,
      passed: false, missed: false,
    });
  }
  // Moving obstacles: gulls over the coast, drones over the desert. Each
  // drifts sideways and bobs as the clock runs; their motion is a pure
  // function of elapsed time, so it replays deterministically.
  const obstacles = [];
  for (let i = 0; i < STAGES[1].obstacles; i += 1) {
    obstacles.push({
      kind: 'gull', stage: 1,
      z: 7800 + i * 820,
      baseX: (random() * 2 - 1) * 240,
      baseY: 150 + random() * 110,
      amp: 46 + random() * 20, speed: 0.55 + random() * 0.3,
      phase: random() * Math.PI * 2, bob: 10 + random() * 8,
      x: 0, y: 0, hit: false,
    });
  }
  for (let i = 0; i < STAGES[2].obstacles; i += 1) {
    obstacles.push({
      kind: 'drone', stage: 2,
      z: 14200 + i * 760,
      baseX: (random() * 2 - 1) * 220,
      baseY: 130 + random() * 110,
      amp: 55 + random() * 25, speed: 0.8 + random() * 0.4,
      phase: random() * Math.PI * 2, bob: 8 + random() * 6,
      x: 0, y: 0, hit: false,
    });
  }
  return {
    rings,
    gates: [], // v1 slalom gates are gone: stage 3 is tighter rings now.
    obstacles,
    runway: {
      z: WORLD.runwayAt,
      x: 0,
      length: WORLD.runwayLength,
      width: WORLD.runwayWidth,
    },
  };
}

/** The mission the plane is flying, from how many rings are resolved. */
export function missionFor(ringsResolved, gatesResolved) {
  const stage = stageFor(ringsResolved);
  return { index: stage, ...MISSIONS[stage] };
}

/** The next ring the plane should aim at, or null on final approach. */
export function nextTarget(course, ringsResolved, gatesResolved) {
  if (ringsResolved < WORLD.totalRings) return course.rings[ringsResolved];
  return null;
}
