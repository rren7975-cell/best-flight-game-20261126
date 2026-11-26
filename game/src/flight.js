// The plane itself: position, speed, throttle, fuel and damage, and the
// rules that move it. No drawing and no browser in here: step() advances
// one fixed step and returns what happened as bit flags, so the caller can
// react without the flight model knowing about screens or sound.
import { MISSIONS, PLANE, WORLD } from './config.js';
import { makeCourse, makeTerrain, missionFor, nextTarget } from './terrain.js';

export const EVENT_RING = 1;
export const EVENT_GATE = 2;
export const EVENT_SCRAPE = 4;
export const EVENT_FUEL_EMPTY = 8;
export const EVENT_LANDED = 16;
export const EVENT_CRASHED = 32;
export const EVENT_MISSION = 64;

function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}

/** Degrees, wrapped to (-180, 180]. */
function wrapAngle(deg) {
  let d = ((deg + 180) % 360 + 360) % 360 - 180;
  return d === -180 ? 180 : d;
}

export function createFlight(random) {
  const terrainHeight = makeTerrain(random);
  const course = makeCourse(random);
  const plane = {
    x: 0, z: 0, altitude: 160,
    speed: 70, heading: 0, pitch: 0, bank: 0,
    throttle: 0.65, fuel: WORLD.startFuel, damage: 0,
    verticalSpeed: 0, onGround: false,
  };
  const state = {
    plane, course, terrainHeight,
    score: 0, ringsPassed: 0, gatesPassed: 0,
    ringsResolved: 0, gatesResolved: 0,
    elapsed: 0, message: '', messageTimer: 0,
    finished: false, outcome: '',
  };

  function reset() {
    plane.x = 0;
    plane.z = 0;
    plane.altitude = 160;
    plane.speed = 70;
    plane.heading = 0;
    plane.pitch = 0;
    plane.bank = 0;
    plane.throttle = 0.65;
    plane.fuel = WORLD.startFuel;
    plane.damage = 0;
    plane.verticalSpeed = 0;
    plane.onGround = false;
    for (const ring of course.rings) { ring.passed = false; ring.missed = false; }
    for (const gate of course.gates) { gate.passed = false; gate.missed = false; }
    state.score = 0;
    state.ringsPassed = 0;
    state.gatesPassed = 0;
    state.ringsResolved = 0;
    state.gatesResolved = 0;
    state.elapsed = 0;
    state.finished = false;
    state.outcome = '';
    state.message = MISSIONS[0].brief;
    state.messageTimer = 6;
  }

  /** Distance from the plane to a target, in the plane's own frame. */
  function targetError(target) {
    return { dx: target.x - plane.x, dy: target.y - plane.altitude, dz: target.z - plane.z };
  }

  function announce(text, seconds = 4) {
    state.message = text;
    state.messageTimer = seconds;
  }

  /**
   * One fixed step. Controls: bankStick -1..1 (left/right), pitchStick
   * -1..1 (down/up), throttleDelta -1..1 (less/more power). Returns events.
   */
  function step(dt, bankStick, pitchStick, throttleDelta) {
    let events = 0;
    if (state.finished) return events;
    state.elapsed += dt;
    if (state.messageTimer > 0) state.messageTimer -= dt;

    // Throttle and fuel: full power burns faster; empty tanks mean gliding.
    plane.throttle = clamp(plane.throttle + throttleDelta * dt * 0.7, 0, 1);
    const burn = PLANE.fuelBurnIdle
      + (PLANE.fuelBurnFull - PLANE.fuelBurnIdle) * plane.throttle;
    if (plane.fuel > 0) {
      plane.fuel = Math.max(0, plane.fuel - burn * dt);
      if (plane.fuel === 0) {
        plane.throttle = 0;
        events |= EVENT_FUEL_EMPTY;
        announce('Fuel empty — glide her in!', 5);
      }
    }

    // Speed chases the throttle's target; drag grows in a turn.
    const targetSpeed = PLANE.baseSpeed + plane.throttle * PLANE.throttleSpeed;
    const drag = 1 + Math.abs(plane.bank) / 90;
    plane.speed += (targetSpeed / drag - plane.speed)
      * PLANE.speedResponse * dt;

    // Bank turns the plane; the faster you go, the wider the turn.
    const turnAuthority = clamp(plane.speed / 90, 0.4, 1.15);
    plane.bank = clamp(plane.bank + bankStick * PLANE.turnRate * dt, -55, 55);
    plane.bank *= Math.max(0, 1 - PLANE.bankSettle * dt); // the stick recentres the bank
    plane.heading = (plane.heading
      + plane.bank * turnAuthority * 0.55 * dt + 360) % 360;

    // Pitch climbs and dives; a stalled wing sinks instead.
    plane.pitch = clamp(plane.pitch + pitchStick * PLANE.pitchRate * dt, -22, 22);
    plane.pitch *= Math.max(0, 1 - 1.2 * dt);
    const stalled = plane.speed < PLANE.stallSpeed;
    const climb = stalled
      ? -PLANE.stallSink
      : plane.pitch * PLANE.climbRate / 14 * (plane.speed / 90);
    plane.verticalSpeed = climb;
    plane.altitude += climb * dt;

    // Move forward along the heading.
    const headingRad = (plane.heading * Math.PI) / 180;
    const forward = plane.speed * dt;
    plane.z += forward * Math.cos(headingRad);
    plane.x += forward * Math.sin(headingRad);

    // The ground: scraping terrain damages the plane and bounces it up.
    const ground = terrainHeight(plane.x, plane.z);
    if (plane.altitude <= ground + 2) {
      plane.altitude = ground + 2;
      plane.damage = Math.min(100, plane.damage + PLANE.scrapeDamage * dt);
      events |= EVENT_SCRAPE;
      if (plane.damage >= 100) {
        state.finished = true;
        state.outcome = 'crashed';
        events |= EVENT_CRASHED;
        announce('Crashed into the hillside.', 6);
        return events;
      }
    }

    // Rings and gates: crossing the target's plane near its centre scores.
    // Flying 150 m past one without passing it misses it: the sortie goes on.
    const target = nextTarget(course, state.ringsResolved, state.gatesResolved);
    if (target) {
      const err = targetError(target);
      if (err.dz < -150) {
        target.missed = true;
        if (target.kind === 'ring') {
          state.ringsResolved += 1;
          announce(`Ring ${state.ringsResolved} missed — press on.`);
        } else {
          state.gatesResolved += 1;
          announce(`Gate ${state.gatesResolved} missed — press on.`);
        }
      } else if (err.dz <= 0 && err.dz > -plane.speed * dt * 2 - 30) {
        const off = Math.hypot(err.dx, err.dy);
        if (off < WORLD.ringRadius) {
          target.passed = true;
          const centred = off < WORLD.ringRadius * 0.45;
          const points = (target.kind === 'ring' ? WORLD.ringPoints : WORLD.gatePoints)
            + (centred ? WORLD.centreBonus : 0);
          state.score += points;
          if (target.kind === 'ring') {
            state.ringsPassed += 1;
            state.ringsResolved += 1;
            events |= EVENT_RING;
            announce(centred ? `Ring ${state.ringsPassed} — dead centre! +${points}` : `Ring ${state.ringsPassed}! +${points}`);
          } else {
            state.gatesPassed += 1;
            state.gatesResolved += 1;
            events |= EVENT_GATE;
            announce(centred ? `Gate ${state.gatesPassed} — dead centre! +${points}` : `Gate ${state.gatesPassed}! +${points}`);
          }
          const mission = missionFor(state.ringsResolved, state.gatesResolved);
          if (mission.index === 1 && state.ringsResolved === WORLD.ringCount) {
            events |= EVENT_MISSION;
            announce('Ring Run complete — now the Canyon Slalom!', 5);
          } else if (mission.index === 2 && state.gatesResolved === WORLD.gateCount) {
            events |= EVENT_MISSION;
            announce('Slalom complete — line up for Final Approach!', 5);
          }
        }
      }
    }

    // Landing: over the runway, slow, level and gentle. The plane counts as
    // down once it is within 6 m of the ground: the flare floats it the
    // last few metres, and the terrain clamp settles it the rest of the way.
    const runway = course.runway;
    const overRunway = Math.abs(plane.x - runway.x) < runway.width / 2
      && plane.z >= runway.z - runway.length / 2
      && plane.z <= runway.z + runway.length / 2;
    if (overRunway && plane.altitude <= ground + 6 && !plane.onGround) {
      plane.onGround = true;
      if (plane.speed < 70 && Math.abs(plane.verticalSpeed) < PLANE.hardLandingVs
          && Math.abs(wrapAngle(plane.heading)) < 12) {
        state.finished = true;
        state.outcome = 'landed';
        state.score += WORLD.landingPoints;
        events |= EVENT_LANDED;
        announce(`Landed! +${WORLD.landingPoints} — sortie complete.`, 6);
      } else {
        plane.damage = Math.min(100, plane.damage + 30);
        events |= EVENT_SCRAPE;
        announce('Hard landing! Ease off and try again.', 4);
        plane.onGround = false;
      }
    }
    if (plane.onGround && plane.z > runway.z + runway.length / 2) {
      plane.onGround = false; // ran off the far end: back in the air is not an option
      plane.altitude = ground + 2;
    }

    return events;
  }

  reset();
  return { state, reset, step, terrainHeight, course, missionFor, nextTarget, wrapAngle };
}
