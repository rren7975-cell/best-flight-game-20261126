// The autopilot behind the screenshot scenes (?shot=...). It flies the real
// rules forward from a fresh world for a fixed number of seconds, steering
// toward the next ring, gate or runway, so each frame is what a short game
// really looks like and the same seed always gives the same frame.
import { PLANE, STEP, WORLD } from './config.js';
import { nextTarget } from './terrain.js';

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
    const dx = target.x - plane.x;
    const dy = target.y - plane.altitude;
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
    // Slow down when close, so the turn stays tight.
    const wantThrottle = dz < 500 ? 0.45 : 0.68;
    throttleDelta = clamp((wantThrottle - plane.throttle) * 2, -1, 1);
  } else {
    // Final approach: intercept steering to a glide path — first an
    // approach fix 1,200 m out and 130 m above the valley floor, then the
    // runway threshold itself. Same intercept law as the rings, so the
    // plane arrives lined up, slow and descending, instead of circling.
    const runway = flight.state.course.runway;
    const fixZ = runway.z - 1200;
    const pastFix = plane.z >= fixZ;
    const aim = pastFix
      ? { x: runway.x, y: flight.terrainHeight(runway.x, runway.z) + 2, z: runway.z + 100 }
      : { x: runway.x, y: flight.terrainHeight(runway.x, fixZ) + 130, z: fixZ };
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
    const wantPitch = clamp(wantClimb / Math.max(climbPerPitch, 0.2), -14, 14);
    pitchStick = clamp((wantPitch - plane.pitch) / 5, -1, 1);
    const wantThrottle = pastFix ? 0.22 : 0.35;
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

/** Seconds each shot flies forward before the frame is taken. */
export const SHOT_SECONDS = {
  start: 5,
  rings: 24,
  slalom: 110,
  landing: 200,
};

/** The autopilot horizon each shot flies with. */
export const SHOT_HORIZON = {
  start: 0.9,
  rings: 0.9,
  slalom: 0.8,
  landing: 0.9,
};

/**
 * Stage one shot: reset the world, fly it forward with the autopilot, and
 * say which screen the frame shows. The title shot idles over the runway
 * so the title screen has the valley behind it.
 */
export function stageShot(name, flight) {
  const seconds = SHOT_SECONDS[name] ?? 10;
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
  for (let t = 0; t < seconds; t += STEP) {
    const sticks = autopilotStep(flight, horizon);
    flight.step(STEP, sticks.bankStick, sticks.pitchStick, sticks.throttleDelta);
    if (flight.state.finished) break;
  }
  return { screen: flight.state.finished && flight.state.outcome === 'landed' ? 4 : 1, best: 0 };
}
