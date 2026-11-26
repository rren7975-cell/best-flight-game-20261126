// Every tuning number and colour in one place. The game renders to a fixed
// 1280x720 logical frame; the renderer scales it to the window, so no rule
// below depends on the screen size. Distances are metres, speeds metres per
// second, altitudes metres, headings degrees.

export const VIEW = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second. */
export const STEP = 1 / 60;

/** Three flyable aircraft, genuinely different handling. Multipliers apply
 * to the base plane numbers below. */
export const AIRCRAFTS = {
  scout: {
    id: 'scout', name: 'SCOUT', tag: 'Nimble spotter',
    desc: 'Tight turns, sips fuel, gentler top speed.',
    speed: 0.88, turn: 1.3, pitch: 1.2, burn: 0.78, stall: 0.92,
    colour: '#3a9e5f', wing: '#eef5e9',
    stats: { speed: 2, agility: 5, fuel: 5 },
  },
  bush: {
    id: 'bush', name: 'BUSH PLANE', tag: 'Balanced workhorse',
    desc: 'The all-rounder: steady, forgiving, honest.',
    speed: 1.0, turn: 1.0, pitch: 1.0, burn: 1.0, stall: 1.0,
    colour: '#d8443a', wing: '#f2ede2',
    stats: { speed: 3, agility: 3, fuel: 3 },
  },
  jet: {
    id: 'jet', name: 'RESCUE JET', tag: 'Fast interceptor',
    desc: 'Blistering speed, thirsty tanks, wide turns.',
    speed: 1.28, turn: 0.78, pitch: 0.9, burn: 1.45, stall: 1.08,
    colour: '#2f6fd0', wing: '#dfe9f7',
    stats: { speed: 5, agility: 2, fuel: 2 },
  },
};
export const AIRCRAFT_ORDER = ['scout', 'bush', 'jet'];

/** The plane: how it flies, burns fuel and takes damage. */
export const PLANE = {
  /** Speed the plane settles at for a given throttle: 40 + throttle * 90. */
  baseSpeed: 40,
  throttleSpeed: 90,
  /** How fast speed chases its target (per second). */
  speedResponse: 0.55,
  /** Degrees of bank per second at full stick, scaled by speed. */
  turnRate: 40,
  /** The stick recentres the bank: how fast bank decays (per second). */
  bankSettle: 0.9,
  /** Degrees of pitch per second at full stick. */
  pitchRate: 14,
  /** Below this speed the wing stops flying and the plane sinks. */
  stallSpeed: 52,
  /** Metres per second of sink when stalled, and climb at full power. */
  stallSink: 26,
  climbRate: 16,
  /** Fuel: percent burned per second at full throttle, less at idle. */
  fuelBurnFull: 0.45,
  fuelBurnIdle: 0.10,
  /** Damage taken per terrain scrape, per second of contact. */
  scrapeDamage: 34,
  /** A hard landing above this vertical speed damages the plane. */
  hardLandingVs: 9,
};

/** The world: terrain, rings, runway and weather. */
export const WORLD = {
  /** Terrain height: rolling hills up to this many metres. */
  hillHeight: 90,
  /** Metres of forward travel per hill wave. */
  hillWavelength: 520,
  /** The runway sits this far along the course (metres): past the last ring,
   * with room for a proper final approach. */
  runwayAt: 20500,
  runwayLength: 700,
  runwayWidth: 60,
  /** Rings per stage; three stages make 24 rings in all. */
  ringsPerStage: 8,
  totalRings: 24,
  ringRadius: 26,
  /** Stage 3 gates are tighter. */
  stage3Radius: 22,
  /** Points. */
  ringPoints: 100,
  gatePoints: 120,
  landingPoints: 500,
  /** A perfect pass (near the ring centre) earns this bonus. */
  centreBonus: 50,
  /** A pass that clips the rim (outside the ring, inside 1.4x radius). */
  nearMissPoints: 25,
  nearMissRadius: 1.4,
  /** Combo: each consecutive clean ring adds 10% to ring points, to 2x. */
  comboStep: 0.1,
  comboMax: 2.0,
  /** Stage time bonus: par seconds per stage, points per second under par. */
  stagePar: 85,
  timeBonusPerSec: 4,
  /** Fuel at the start of a sortie, percent. */
  startFuel: 100,
};

/** Upgrade shop: costs are stars, max 3 levels each. */
export const UPGRADES = {
  engine: { name: 'ENGINE', desc: '+7% top speed per level', cost: 3, max: 3, effect: 0.07 },
  tank: { name: 'FUEL TANK', desc: '+25 fuel capacity, free refill', cost: 2, max: 3, effect: 25 },
  armor: { name: 'ARMOR', desc: 'Damage taken x0.65 per level', cost: 2, max: 3, effect: 0.65 },
};
export const UPGRADE_ORDER = ['engine', 'tank', 'armor'];

/** The three stages, in order. */
export const STAGES = [
  {
    id: 'alpine', name: 'STAGE 1 · ALPINE VALLEY',
    brief: 'Fly through 8 rings over the valley. Throttle discipline wins.',
    wind: 0, obstacles: 0, radius: 26,
  },
  {
    id: 'coastal', name: 'STAGE 2 · COASTAL CLIFFS',
    brief: 'Sea cliffs now — watch the gulls, they drift across the course.',
    wind: 3, obstacles: 6, radius: 26,
  },
  {
    id: 'desert', name: 'STAGE 3 · DESERT CANYON',
    brief: 'Desert canyon: gusts shove you sideways, drones patrol, rings are tighter.',
    wind: 9, obstacles: 6, radius: 22,
  },
];

/** Missions, in order: three stages, then the landing. */
export const MISSIONS = [
  { id: 'alpine', name: 'STAGE 1 · ALPINE VALLEY', brief: STAGES[0].brief, target: WORLD.ringsPerStage },
  { id: 'coastal', name: 'STAGE 2 · COASTAL CLIFFS', brief: STAGES[1].brief, target: WORLD.ringsPerStage },
  { id: 'desert', name: 'STAGE 3 · DESERT CANYON', brief: STAGES[2].brief, target: WORLD.ringsPerStage },
  { id: 'landing', name: 'FINAL APPROACH', brief: 'Line up on the runway, slow below 70 m/s and set her down gently.', target: 1 },
];

/** One palette per stage: alpine green, coastal teal, desert amber. */
export const PALETTES = [
  {
    skyTop: '#2e6da8', skyMid: '#7fb2d9', skyLow: '#f6c98a',
    sun: '#ffd98a', cloud: '#ffffff',
    ridgeFar: '#8fa8c8', ridgeMid: '#5f7fa8', ridgeNear: '#3e5a44',
    ground: '#6d8f5a', groundDark: '#54703f',
    river: '#4f8fc4', road: '#8a7a5a',
    ring: '#ffcf3f', ringNext: '#ffe98a',
  },
  {
    skyTop: '#1f6f8e', skyMid: '#6fb3c9', skyLow: '#f2d8a0',
    sun: '#ffe6a3', cloud: '#ffffff',
    ridgeFar: '#7fa8b8', ridgeMid: '#4f7d92', ridgeNear: '#33565f',
    ground: '#c2a878', groundDark: '#8f7d55',
    river: '#2f7fb0', road: '#b09a6a',
    ring: '#ffcf3f', ringNext: '#ffe98a',
  },
  {
    skyTop: '#a85a2e', skyMid: '#d99a5b', skyLow: '#f6cf8a',
    sun: '#fff0b0', cloud: '#fff4e0',
    ridgeFar: '#c08a5e', ridgeMid: '#9a6a42', ridgeNear: '#6e4a2e',
    ground: '#c99a5e', groundDark: '#a37a42',
    river: '#d8b078', road: '#8a6a42',
    ring: '#ffcf3f', ringNext: '#ffe98a',
  },
];

export const PALETTE = {
  skyTop: '#2e6da8',
  skyMid: '#7fb2d9',
  skyLow: '#f6c98a',
  sun: '#ffd98a',
  cloud: '#ffffff',
  ridgeFar: '#8fa8c8',
  ridgeMid: '#5f7fa8',
  ridgeNear: '#3e5a44',
  ground: '#6d8f5a',
  groundDark: '#54703f',
  river: '#4f8fc4',
  road: '#8a7a5a',
  ring: '#ffcf3f',
  ringNext: '#ffe98a',
  runway: '#3a3f46',
  runwayLine: '#f5f2e8',
  planeBody: '#d8443a',
  planeWing: '#f2ede2',
  planeGlass: '#bfe0ea',
  hudPanel: 'rgba(12, 20, 30, 0.72)',
  hudText: '#eef3f6',
  hudWarn: '#ff5a4e',
  hudGood: '#7fe08a',
  panel: '#101820',
  text: '#eef1f5',
  muted: '#9fb2c0',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'ring-runner.best';
