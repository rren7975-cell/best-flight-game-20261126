// The autopilot behind the screenshot scenes (?shot=...) and the headless
// full-course test. It flies the real rules forward from a fresh world,
// steering toward the next ring or the runway, dodging gulls and drones,
// so each frame is what a short game really looks like and the same seed
// always gives the same frame. v2: it flies all three stages, buys an
// upgrade in each shop, and lands — flyFullCourse() reports the score.
import { PLANE, STEP, WORLD } from './config.js';
import { nextTarget } from './terrain.js';
import { obstaclePosition } from './flight.js';

function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}

/** Steer one step toward the next target; returns the stick deflections.
 * The pilot aims at a heading, not at a bank: it works out the heading to
 * the target, banks to close the heading error, and pitches to the
 * target's altitude. That keeps the course a smooth curve instead of a
 * weave: banking at a lateral offset alone overshoots and circles. */
export function autopilotStep(flight, horizon) {
  const plane = flight.state.plane;
  const target = nextTarget(
    flight.state.course, flight.state.ringsResolved, flight.state.gatesResolved);
  let bankStick = 0;
  let pitchStick = 0;
  let throttleDelta = 0;
  if (target) {
    // Intercept steering: work out the lateral and vertical speeds that
    // close the gap by the time the plane reaches the target, and aim the
    // velocity vector there. Aiming at a fixed look-ahead point weaves;
    // aiming straight at the ring swings the heading as it nears. The
    // intercept law turns early and progressively harder, so the plane
    // arrives through the centre instead of beside it.
    let aimX = target.x;
    let aimY = target.y;
    // Dodge: a gull or drone dead ahead gets a sideways sidestep. The
    // trigger zone is generous because the obstacle keeps drifting while
    // the plane closes the gap. But never dodge when the obstacle sits
    // close to the next ring: swerving there guarantees missing the ring,
    // and the ring line is where the plane has to be anyway.
    for (const ob of flight.state.course.obstacles) {
      if (ob.stage !== flight.state.stage) continue;
      if (Math.abs(ob.z - target.z) < 350) continue;
      const pos = obstaclePosition(ob, flight.state.elapsed);
      const dz = pos.z - plane.z;
      if (dz > 0 && dz < 500) {
        const dx = pos.x - plane.x;
        const dy = pos.y - plane.altitude;
        if (Math.abs(dx) < 65 && Math.abs(dy) < 35) {
          aimX += dx >= 0 ? -85 : 85;
          aimY += dy >= 0 ? -30 : 30;
        }
      }
    }
    const dx = aimX - plane.x;
    const dy = aimY - plane.altitude;
    const dz = Math.max(target.z - plane.z, 1);
    const timeTo = dz / Math.max(plane.speed, 1);
    const look = Math.max(timeTo, 2.0);
    const wantLatVel = dx / look;
    const wantHeading = (Math.asin(
      clamp(wantLatVel / Math.max(plane.speed, 1), -0.85, 0.85)) * 180) / Math.PI;
    const headingError = wrapAngle(wantHeading - plane.heading);
    const wantBank = clamp(headingError * 1.5, -40, 40);
    bankStick = clamp((wantBank - plane.bank) / 8, -1, 1);
    // Pitch the same way: the climb that closes the height gap in time.
    const wantClimb = dy / look;
    const climbPerPitch = (PLANE.climbRate / 14) * (plane.speed / 90);
    const wantPitch = clamp(wantClimb / Math.max(climbPerPitch, 0.2), -14, 14);
    pitchStick = clamp((wantPitch - plane.pitch) / 5, -1, 1);
    // Slow down when close, so the turn stays tight — tighter still in
    // the desert, where the rings are smaller and the gusts shove.
    // Throttle is chosen for a target speed, not a fixed number: the jet
    // cruises far faster than the scout at the same throttle, and a fixed
    // low throttle would stall the scout on approach.
    const sf = flight.state.aircraft.speed
      * (1 + 0.07 * flight.state.upgrades.engine);
    const close = flight.state.stage === 2 ? 650 : 500;
    // Fast enough to keep flying through a hard bank: in a turn the drag
    // cuts the effective speed by up to 1.44x, so a 70 m/s target stalls
    // the wing mid-turn and the plane sinks into the hills. A touch
    // slower in the desert, where the rings are tighter.
    const wantSpeed = dz < close ? (flight.state.stage === 2 ? 84 : 88) : 100;
    const wantThrottle = clamp(((wantSpeed / sf) - 40) / 90, 0.1, 0.85);
    throttleDelta = clamp((wantThrottle - plane.throttle) * 2, -1, 1);
  } else {
    // Final approach: intercept steering to a glide path — first an
    // approach fix 1,600 m out and 120 m above the valley floor, then a
    // FIXED touchdown point just past the threshold. The point must stay
    // fixed: aiming at a point that keeps moving ahead of the plane makes
    // the descent flatten out asymptotically and the plane floats past
    // the runway. Same intercept law as the rings, so the plane arrives
    // lined up, slow and descending, instead of circling.
    const runway = flight.state.course.runway;
    const fixZ = runway.z - 1600;
    const pastFix = plane.z >= fixZ;
    // Speed-aware throttle: aim for a safe approach speed that stays
    // above the stall (each aircraft stalls at a different speed) and
    // below the 70 m/s landing limit, allowing for the flight model's
    // 0.8x speed brake on final. A fixed throttle stalls the scout and
    // overspeeds the jet.
    const sf = flight.state.aircraft.speed
      * (1 + 0.07 * flight.state.upgrades.engine);
    const approachSpeed = Math.max(
      60, PLANE.stallSpeed * flight.state.aircraft.stall + 8);
    const wantThrottle = pastFix
      ? clamp(((approachSpeed / (sf * 0.8)) - 40) / 90, 0.05, 0.5)
      : clamp(((82 / sf) - 40) / 90, 0.1, 0.6);
    const tdZ = runway.z + 50;
    const aim = pastFix
      ? {
        x: runway.x,
        // Aim at the higher of the ground under the centre line and the
        // ground under the plane: the descent must clear the hills the
        // plane is actually over, not just the valley floor.
        y: Math.max(
          flight.terrainHeight(runway.x, tdZ),
          flight.terrainHeight(plane.x, tdZ),
        ) + 1,
        z: tdZ,
      }
      : { x: runway.x, y: flight.terrainHeight(runway.x, fixZ) + 120, z: fixZ };
    const dx = aim.x - plane.x;
    const dy = aim.y - plane.altitude;
    const dz = Math.max(aim.z - plane.z, 1);
    const timeTo = dz / Math.max(plane.speed, 1);
    const look = Math.max(timeTo, 2.0);
    const wantLatVel = dx / look;
    const wantHeading = (Math.asin(
      clamp(wantLatVel / Math.max(plane.speed, 1), -0.85, 0.85)) * 180) / Math.PI;
    const headingError = wrapAngle(wantHeading - plane.heading);
    const wantBank = clamp(headingError * 1.5, -30, 30);
    bankStick = clamp((wantBank - plane.bank) / 8, -1, 1);
    const wantClimb = dy / look;
    const climbPerPitch = (PLANE.climbRate / 14) * (plane.speed / 90);
    let wantPitch = clamp(wantClimb / Math.max(climbPerPitch, 0.2), -14, 14);
    // Flare: close to the ground and over the runway, cap the descent so
    // the touchdown is gentle enough to count (vertical speed under 9).
    // Only in the last few metres — flaring earlier bleeds the descent
    // and floats the plane past the runway.
    if (pastFix && plane.z > runway.z - runway.length / 2
      && plane.altitude - flight.terrainHeight(plane.x, plane.z) < 8) {
      wantPitch = Math.max(wantPitch, -5);
    }
    pitchStick = clamp((wantPitch - plane.pitch) / 5, -1, 1);
    throttleDelta = clamp((wantThrottle - plane.throttle) * 2, -1, 1);
  }
  // The look-ahead: a short horizon over-corrects and wanders, a long one
  // flies smooth. The play scenes use a long horizon; the end scene a short
  // one, so it is caught out by the hills the way a hurried pilot is.
  const jitter = horizon < 0.5 ? (Math.sin(flight.state.elapsed * 7) * 0.5) : 0;
  return {
    bankStick: clamp(bankStick + jitter, -1, 1),
    pitchStick,
    throttleDelta,
  };
}

function wrapAngle(deg) {
  return ((deg + 180) % 360 + 360) % 360 - 180;
}

/**
 * Fly the whole three-stage course headlessly: rings, shops, landing.
 * In each shop the pilot spends its stars on Engine first, then Armor,
 * then Tank. Returns the debrief: score, rings, combo, time, outcome.
 */
export function flyFullCourse(flight, horizon = 0.9, maxSeconds = 600) {
  flight.reset();
  let t = 0;
  let shops = 0;
  while (t < maxSeconds && !flight.state.finished) {
    if (flight.state.shopPending) {
      shops += 1;
      // Spend stars: engine first (speed wins rings), then armor, then tank.
      for (const id of ['engine', 'armor', 'tank']) {
        while (flight.buyUpgrade(id)) { /* keep buying while affordable */ }
      }
      flight.continueAfterShop();
    }
    const sticks = autopilotStep(flight, horizon);
    flight.step(STEP, sticks.bankStick, sticks.pitchStick, sticks.throttleDelta);
    t += STEP;
  }
  const s = flight.state;
  return {
    score: s.score,
    outcome: s.outcome || (s.finished ? s.outcome : 'unfinished'),
    finished: s.finished,
    rings: s.ringsPassed,
    ringsResolved: s.ringsResolved,
    nearMisses: s.nearMisses,
    centrePasses: s.centrePasses,
    bestCombo: s.bestCombo,
    stars: s.stars,
    upgrades: { ...s.upgrades },
    obstaclesHit: s.obstaclesHit,
    damage: Math.round(s.plane.damage),
    fuel: Math.round(s.plane.fuel),
    time: Math.round(s.elapsed),
    stageTimes: s.stageTimes.map((v) => Math.round(v)),
    shops,
  };
}

/** Seconds each shot flies forward before the frame is taken. */
export const SHOT_SECONDS = {
  start: 5,
  rings: 24,
  coastal: 105,
  shop: 0, // fly until the first shop opens
  landing: 0, // fly the whole course until it lands
};

/** The autopilot horizon each shot flies with. */
export const SHOT_HORIZON = {
  start: 0.9,
  rings: 0.9,
  coastal: 0.9,
  shop: 0.9,
  landing: 0.9,
};

/**
 * Stage one shot: reset the world, fly it forward with the autopilot, and
 * say which screen the frame shows. The title shot idles over the runway
 * so the title screen has the valley behind it.
 */
export function stageShot(name, flight) {
  const horizon = SHOT_HORIZON[name] ?? 0.9;
  flight.reset();
  if (name === 'start') {
    // Park the plane on the runway threshold for the title card. The world
    // is not stepped: the title screen paints the valley behind it.
    const plane = flight.state.plane;
    plane.z = flight.state.course.runway.z - 400;
    plane.altitude = flight.terrainHeight(plane.x, plane.z) + 2;
    plane.speed = 0;
    plane.throttle = 0;
    return { screen: 0, best: 0 };
  }
  if (name === 'shop') {
    // Fly stage 1 until the shop opens, then show the shop screen.
    for (let t = 0; t < 400 && !flight.state.shopPending; t += STEP) {
      const sticks = autopilotStep(flight, horizon);
      flight.step(STEP, sticks.bankStick, sticks.pitchStick, sticks.throttleDelta);
      if (flight.state.finished) break;
    }
    return { screen: 5, best: 0 };
  }
  if (name === 'landing') {
    // Fly the whole course; the frame shows the landing screen if it made it.
    const result = flyFullCourse(flight, horizon);
    return { screen: result.outcome === 'landed' ? 4 : 1, best: 0 };
  }
  const seconds = SHOT_SECONDS[name] ?? 10;
  for (let t = 0; t < seconds; t += STEP) {
    const sticks = autopilotStep(flight, horizon);
    flight.step(STEP, sticks.bankStick, sticks.pitchStick, sticks.throttleDelta);
    if (flight.state.finished || flight.state.shopPending) break;
  }
  return { screen: flight.state.finished && flight.state.outcome === 'landed' ? 4 : 1, best: 0 };
}
