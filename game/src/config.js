// Every tuning number and colour in one place. The game renders to a fixed
// 1280x720 logical frame; the renderer scales it to the window, so no rule
// below depends on the screen size. Distances are metres, speeds metres per
// second, altitudes metres, headings degrees.

export const VIEW = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second. */
export const STEP = 1 / 60;

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
  /** The runway sits this far along the course (metres): past the last gate,
   * with room for a proper final approach. */
  runwayAt: 14500,
  runwayLength: 700,
  runwayWidth: 60,
  /** Rings of stage 1, then slalom gates of stage 2. */
  ringRadius: 26,
  ringCount: 8,
  gateCount: 8,
  /** Points. */
  ringPoints: 100,
  gatePoints: 120,
  landingPoints: 500,
  /** A perfect pass (near the ring centre) earns this bonus. */
  centreBonus: 50,
  /** Fuel at the start of a sortie, percent. */
  startFuel: 100,
};

/** Missions, in order: name, what the banner says, how to win it. */
export const MISSIONS = [
  {
    id: 'rings',
    name: 'RING RUN',
    brief: 'Fly through all 8 rings. Mind your throttle: too fast and the turns go wide.',
    target: WORLD.ringCount,
  },
  {
    id: 'slalom',
    name: 'CANYON SLALOM',
    brief: 'Thread the gates between the peaks. Slow down for the tight ones.',
    target: WORLD.gateCount,
  },
  {
    id: 'landing',
    name: 'FINAL APPROACH',
    brief: 'Line up on the runway, slow below 70 m/s and set her down gently.',
    target: 1,
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
