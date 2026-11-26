// The plane itself: position, speed, throttle, fuel and damage, and the
// rules that move it. No drawing and no browser in here: step() advances
// one fixed step and returns what happened as bit flags, so the caller can
// react without the flight model knowing about screens or sound.
//
// v2: three aircraft with different handling, a 24-ring three-stage course,
// combo multiplier, near-miss bonus, stage time bonus, stars, an upgrade
// shop between stages, wind gusts and moving obstacles (gulls, drones).
import { AIRCRAFTS, MISSIONS, PLANE, STAGES, UPGRADES, WORLD } from './config.js';
import { makeCourse, makeTerrain, missionFor, nextTarget, stageFor } from './terrain.js';
import { makeNoise } from './random.js';

export const EVENT_RING = 1;
export const EVENT_GATE = 2;
export const EVENT_SCRAPE = 4;
export const EVENT_FUEL_EMPTY = 8;
export const EVENT_LANDED = 16;
export const EVENT_CRASHED = 32;
export const EVENT_MISSION = 64;
export const EVENT_STAGE = 128;
export const EVENT_HIT = 256;
export const EVENT_NEAR_MISS = 512;

function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}

/** Degrees, wrapped to (-180, 180]. */
function wrapAngle(deg) {
  let d = ((deg + 180) % 360 + 360) % 360 - 180;
  return d === -180 ? 180 : d;
}

/** Where a moving obstacle is right now: a pure function of elapsed time. */
export function obstaclePosition(ob, elapsed) {
  return {
    x: ob.baseX + Math.sin(elapsed * ob.speed + ob.phase) * ob.amp,
    y: ob.baseY + Math.sin(elapsed * ob.speed * 1.3 + ob.phase) * ob.bob,
    z: ob.z,
  };
}

export function createFlight(random, aircraftId = 'bush') {
  const terrainHeight = makeTerrain(random);
  const course = makeCourse(random);
  const windNoise = makeNoise(random);
  const aircraft = AIRCRAFTS[aircraftId] ?? AIRCRAFTS.bush;
  const plane = {
    x: 0, z: 0, altitude: 160,
    speed: 70, heading: 0, pitch: 0, bank: 0,
    throttle: 0.65, fuel: WORLD.startFuel, damage: 0,
    verticalSpeed: 0, onGround: false,
  };
  const state = {
    plane, course, terrainHeight, aircraft,
    score: 0, ringsPassed: 0, gatesPassed: 0,
    ringsResolved: 0, gatesResolved: 0,
    elapsed: 0, message: '', messageTimer: 0,
    finished: false, outcome: '',
    // v2 state
    stage: 0, combo: 0, bestCombo: 0, stars: 0,
    upgrades: { engine: 0, tank: 0, armor: 0 },
    nearMisses: 0, centrePasses: 0, obstaclesHit: 0,
    stageTimes: [0, 0, 0], stageStart: 0,
    shopPending: false, shopStage: -1,
    wind: 0, fuelCapacity: WORLD.startFuel, fuelBonus: 0,
  };

  function fuelCapacity() {
    return WORLD.startFuel + UPGRADES.tank.effect * state.upgrades.tank;
  }

  function armorFactor() {
    return Math.pow(UPGRADES.armor.effect, state.upgrades.armor);
  }

  function speedFactor() {
    return aircraft.speed * (1 + UPGRADES.engine.effect * state.upgrades.engine);
  }

  function reset() {
    plane.x = 0;
    plane.z = 0;
    plane.altitude = 160;
    plane.speed = 70;
    plane.heading = 0;
    plane.pitch = 0;
    plane.bank = 0;
    plane.throttle = 0.65;
    plane.fuel = fuelCapacity();
    plane.damage = 0;
    plane.verticalSpeed = 0;
    plane.onGround = false;
    for (const ring of course.rings) { ring.passed = false; ring.missed = false; ring.nearMissed = false; }
    for (const ob of course.obstacles) { ob.hit = false; }
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
    state.stage = 0;
    state.combo = 0;
    state.bestCombo = 0;
    state.stars = 0;
    state.upgrades = { engine: 0, tank: 0, armor: 0 };
    state.nearMisses = 0;
    state.centrePasses = 0;
    state.obstaclesHit = 0;
    state.stageTimes = [0, 0, 0];
    state.stageStart = 0;
    state.shopPending = false;
    state.shopStage = -1;
    state.wind = 0;
    state.fuelCapacity = fuelCapacity();
    state.fuelBonus = 0;
  }

  /** Distance from the plane to a target, in the plane's own frame. */
  function targetError(target) {
    return { dx: target.x - plane.x, dy: target.y - plane.altitude, dz: target.z - plane.z };
  }

  function announce(text, seconds = 4) {
    state.message = text;
    state.messageTimer = seconds;
  }

  /** Combo multiplier from the current streak (before this ring counts). */
  function comboMultiplier() {
    return 1 + Math.min(state.combo, 10) * WORLD.comboStep;
  }

  function breakCombo() {
    state.combo = 0;
  }

  /** Buy one upgrade level with stars. Returns true when it worked. */
  function buyUpgrade(id) {
    const def = UPGRADES[id];
    if (!def) return false;
    if (state.upgrades[id] >= def.max) return false;
    if (state.stars < def.cost) return false;
    state.stars -= def.cost;
    state.upgrades[id] += 1;
    if (id === 'tank') {
      state.fuelCapacity = fuelCapacity();
      plane.fuel = state.fuelCapacity; // bigger tank, filled up
    }
    return true;
  }

  /** Leave the shop: refuel, clear the flag, start the next stage clock. */
  function continueAfterShop() {
    if (!state.shopPending) return;
    state.shopPending = false;
    state.fuelCapacity = fuelCapacity();
    plane.fuel = state.fuelCapacity;
    state.stageStart = state.elapsed;
  }

  /** Called whenever a ring is resolved: stage boundaries open the shop. */
  function afterResolve(events) {
    state.stage = stageFor(state.ringsResolved);
    if (state.ringsResolved === WORLD.ringsPerStage
      || state.ringsResolved === WORLD.ringsPerStage * 2) {
      const done = state.ringsResolved === WORLD.ringsPerStage ? 0 : 1;
      state.stageTimes[done] = state.elapsed - state.stageStart;
      const under = Math.max(0, WORLD.stagePar - state.stageTimes[done]);
      const bonus = Math.round(under * WORLD.timeBonusPerSec);
      state.score += bonus;
      state.stars += 2;
      state.shopPending = true;
      state.shopStage = done;
      events |= EVENT_STAGE;
      announce(`${STAGES[done].name} complete! Time bonus +${bonus} · +2 stars — spend them in the shop.`, 6);
    }
    return events;
  }

  /**
   * One fixed step. Controls: bankStick -1..1 (left/right), pitchStick
   * -1..1 (down/up), throttleDelta -1..1 (less/more power). Returns events.
   */
  function step(dt, bankStick, pitchStick, throttleDelta) {
    let events = 0;
    if (state.finished || state.shopPending) return events;
    state.elapsed += dt;
    if (state.messageTimer > 0) state.messageTimer -= dt;

    // Wind: gusts grow by stage — calm in the valley, a shove on the coast,
    // a real fight in the desert. The gust is a smooth function of the
    // clock, so it replays identically for a given seed.
    const stageDef = STAGES[state.stage] ?? STAGES[0];
    const gust = stageDef.wind * (0.55 + 0.45 * windNoise(state.elapsed / 5));
    state.wind = gust * Math.sin(state.elapsed / 7 + state.stage * 2.1);
    plane.x += state.wind * dt * 0.55;

    // Throttle and fuel: full power burns faster; empty tanks mean gliding.
    plane.throttle = clamp(plane.throttle + throttleDelta * dt * 0.7, 0, 1);
    const burn = (PLANE.fuelBurnIdle
      + (PLANE.fuelBurnFull - PLANE.fuelBurnIdle) * plane.throttle)
      * aircraft.burn;
    if (plane.fuel > 0) {
      plane.fuel = Math.max(0, plane.fuel - burn * dt);
      if (plane.fuel === 0) {
        plane.throttle = 0;
        events |= EVENT_FUEL_EMPTY;
        announce('Fuel empty — glide her in!', 5);
      }
    }

    // Speed chases the throttle's target; drag grows in a turn. On final
    // approach (low, near the runway) the speed brakes come out, so even
    // an engine-upgraded plane can slow below the 70 m/s landing limit.
    // The brake zone runs past the far end, so the plane never powers
    // back up while it is still trying to touch down on the overrun.
    const runway = course.runway;
    const onApproach = plane.z > runway.z - 1500
      && plane.z < runway.z + runway.length / 2 + 200
      && plane.altitude < 150;
    const targetSpeed = (PLANE.baseSpeed + plane.throttle * PLANE.throttleSpeed)
      * speedFactor() * (onApproach ? 0.8 : 1);
    const drag = 1 + Math.abs(plane.bank) / 90;
    plane.speed += (targetSpeed / drag - plane.speed)
      * PLANE.speedResponse * dt;

    // Bank turns the plane; the faster you go, the wider the turn.
    const turnAuthority = clamp(plane.speed / 90, 0.4, 1.15);
    plane.bank = clamp(
      plane.bank + bankStick * PLANE.turnRate * aircraft.turn * dt, -55, 55);
    plane.bank *= Math.max(0, 1 - PLANE.bankSettle * dt); // the stick recentres the bank
    plane.heading = (plane.heading
      + plane.bank * turnAuthority * 0.55 * dt + 360) % 360;

    // Pitch climbs and dives; a stalled wing sinks instead.
    plane.pitch = clamp(
      plane.pitch + pitchStick * PLANE.pitchRate * aircraft.pitch * dt, -22, 22);
    plane.pitch *= Math.max(0, 1 - 1.2 * dt);
    const stalled = plane.speed < PLANE.stallSpeed * aircraft.stall;
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
      plane.damage = Math.min(100, plane.damage + PLANE.scrapeDamage * armorFactor() * dt);
      events |= EVENT_SCRAPE;
      breakCombo();
      if (plane.damage >= 100) {
        state.finished = true;
        state.outcome = 'crashed';
        events |= EVENT_CRASHED;
        announce('Crashed into the hillside.', 6);
        return events;
      }
    }

    // Moving obstacles: a gull or drone in the way hurts and breaks combo.
    for (const ob of course.obstacles) {
      if (ob.hit || ob.stage !== state.stage) continue;
      const pos = obstaclePosition(ob, state.elapsed);
      ob.x = pos.x;
      ob.y = pos.y;
      const d = Math.hypot(pos.x - plane.x, pos.y - plane.altitude, pos.z - plane.z);
      if (d < 14) {
        ob.hit = true;
        state.obstaclesHit += 1;
        plane.damage = Math.min(100, plane.damage + 12 * armorFactor());
        events |= EVENT_HIT;
        breakCombo();
        announce(ob.kind === 'gull' ? 'Gull strike! Hull damaged.' : 'Drone strike! Hull damaged.', 4);
        if (plane.damage >= 100) {
          state.finished = true;
          state.outcome = 'crashed';
          events |= EVENT_CRASHED;
          return events;
        }
      }
    }

    // Rings: crossing the target's plane near its centre scores, with a
    // combo multiplier for consecutive clean rings. Clipping the rim is a
    // near miss (+25, stage goes on). Flying 150 m past one without passing
    // it misses it: the sortie goes on, and the combo breaks.
    const target = nextTarget(course, state.ringsResolved, state.gatesResolved);
    if (target) {
      const err = targetError(target);
      if (err.dz < -150) {
        target.missed = true;
        state.ringsResolved += 1;
        breakCombo();
        announce(`Ring ${state.ringsResolved} missed — press on.`);
        events = afterResolve(events);
      } else if (err.dz <= 0 && err.dz > -plane.speed * dt * 2 - 30) {
        const off = Math.hypot(err.dx, err.dy);
        const radius = target.radius ?? WORLD.ringRadius;
        if (off < radius) {
          target.passed = true;
          const centred = off < radius * 0.45;
          const mult = comboMultiplier();
          const points = Math.round((WORLD.ringPoints + (centred ? WORLD.centreBonus : 0)) * mult);
          state.score += points;
          state.ringsPassed += 1;
          state.ringsResolved += 1;
          state.combo += 1;
          state.bestCombo = Math.max(state.bestCombo, state.combo);
          if (centred) {
            state.centrePasses += 1;
            state.stars += 1;
          }
          events |= EVENT_RING;
          const inStage = ((state.ringsResolved - 1) % WORLD.ringsPerStage) + 1;
          announce(centred
            ? `Ring ${inStage}/8 — dead centre! +${points} · combo x${mult.toFixed(1)}`
            : `Ring ${inStage}/8! +${points} · combo x${mult.toFixed(1)}`);
          events = afterResolve(events);
        } else if (off < radius * WORLD.nearMissRadius) {
          // Rim clip: not a pass, but close enough for a near-miss bonus.
          target.nearMissed = true;
          state.nearMisses += 1;
          state.ringsResolved += 1;
          state.combo += 1;
          state.bestCombo = Math.max(state.bestCombo, state.combo);
          state.score += WORLD.nearMissPoints;
          events |= EVENT_NEAR_MISS;
          announce(`Near miss! +${WORLD.nearMissPoints} — that was close.`);
          events = afterResolve(events);
        }
      }
    }

    // Landing: over the runway, slow, level and gentle. The plane counts as
    // down once it is within 6 m of the ground: the flare floats it the
    // last few metres, and the terrain clamp settles it the rest of the way.
    // The touchdown zone runs 200 m past the far end: a plane that flares
    // a touch long still lands on the flat overrun instead of sliding
    // off into the hills.
    const overRunway = Math.abs(plane.x - runway.x) < runway.width / 2
      && plane.z >= runway.z - runway.length / 2
      && plane.z <= runway.z + runway.length / 2 + 200;
    if (overRunway && plane.altitude <= ground + 6 && !plane.onGround) {
      plane.onGround = true;
      if (plane.speed < 70 && Math.abs(plane.verticalSpeed) < PLANE.hardLandingVs
          && Math.abs(wrapAngle(plane.heading)) < 12) {
        state.finished = true;
        state.outcome = 'landed';
        state.stageTimes[2] = state.elapsed - state.stageStart;
        state.fuelBonus = Math.round(plane.fuel);
        state.score += WORLD.landingPoints + state.fuelBonus;
        events |= EVENT_LANDED;
        announce(`Landed! +${WORLD.landingPoints} + ${state.fuelBonus} fuel bonus — sortie complete.`, 6);
      } else {
        plane.damage = Math.min(100, plane.damage + 30 * armorFactor());
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
  return {
    state, reset, step, terrainHeight, course, missionFor, nextTarget,
    wrapAngle, buyUpgrade, continueAfterShop, obstaclePosition,
  };
}
