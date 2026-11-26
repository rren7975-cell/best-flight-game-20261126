// Everything the player sees: sky, sun and clouds, layered ridges, the
// ground with its river and road, the rings and the runway, the chase-view
// aircraft, and the HUD (altitude, speed, heading, throttle, fuel, damage,
// mission and score). No rules in here: it paints a flight state.
//
// v2: one palette per stage (alpine / coastal / desert), moving gulls and
// drones, wind streaks, aircraft-select title screen, upgrade shop screen,
// stage progress bar, course strip, speed + altitude tapes, combo meter,
// stars and owned upgrades in the HUD, pause menu and a full debrief.
import { AIRCRAFTS, AIRCRAFT_ORDER, MISSIONS, PALETTE, PALETTES, STAGES, UPGRADE_ORDER, UPGRADES, VIEW, WORLD } from './config.js';
import { missionFor, stageFor } from './terrain.js';
import { obstaclePosition } from './flight.js';

export const SCREEN_TITLE = 0;
export const SCREEN_PLAY = 1;
export const SCREEN_PAUSED = 2;
export const SCREEN_OVER = 3;
export const SCREEN_LANDED = 4;
export const SCREEN_SHOP = 5;

const FOCAL = 900; // projection focal length, pixels
const HORIZON_REST = 330; // horizon height (px) in level flight

function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}

function wrapAngle(deg) {
  return ((deg + 180) % 360 + 360) % 360 - 180;
}

function compass(heading) {
  const points = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return points[Math.round(((heading % 360) + 360) % 360 / 45) % 8];
}

/** The palette of the stage the plane is flying right now. */
function stagePalette(state) {
  return PALETTES[clamp(stageFor(state.ringsResolved), 0, 2)];
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  canvas.width = VIEW.width;
  canvas.height = VIEW.height;

  function project(state, x, y, z) {
    const plane = state.plane;
    const dz = z - plane.z;
    if (dz < 20) return null;
    const dx = x - plane.x;
    const dy = y - plane.altitude;
    const scale = FOCAL / dz;
    const horizonY = HORIZON_REST - plane.pitch * 5;
    return {
      x: VIEW.width / 2 + dx * scale - wrapAngle(plane.heading) * 6,
      y: horizonY - dy * scale,
      r: WORLD.ringRadius * scale,
      dz,
    };
  }

  function drawSky(state) {
    const pal = stagePalette(state);
    const plane = state.plane;
    const grad = ctx.createLinearGradient(0, 0, 0, VIEW.height);
    grad.addColorStop(0, pal.skyTop);
    grad.addColorStop(0.45, pal.skyMid);
    grad.addColorStop(0.62, pal.skyLow);
    grad.addColorStop(0.63, pal.ground);
    grad.addColorStop(1, pal.groundDark);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    // Sun: fixed in the world, so it drifts as the heading turns.
    const sunX = VIEW.width * 0.78 - wrapAngle(plane.heading - 40) * 4;
    const sunY = 120 - plane.pitch * 2;
    ctx.fillStyle = pal.sun;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 217, 138, 0.25)';
    ctx.beginPath();
    ctx.arc(sunX, sunY, 52, 0, Math.PI * 2);
    ctx.fill();
    // Clouds: seeded puffs that slide with the heading.
    ctx.fillStyle = pal.cloud;
    ctx.globalAlpha = 0.9;
    for (let i = 0; i < 9; i += 1) {
      const seedX = ((i * 397) % 1280 + 1280) % 1280;
      const cx = ((seedX - wrapAngle(plane.heading) * 9 - state.elapsed * 2) % 1400 + 1400) % 1400 - 60;
      const cy = 60 + ((i * 83) % 180) - plane.pitch * 2;
      const s = 26 + ((i * 37) % 30);
      ctx.beginPath();
      ctx.ellipse(cx, cy, s * 1.6, s * 0.55, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + s, cy + 6, s, s * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawRidges(state) {
    const pal = stagePalette(state);
    const plane = state.plane;
    const horizonY = HORIZON_REST - plane.pitch * 5;
    const layers = [
      { dist: 4200, colour: pal.ridgeFar, amp: 90 },
      { dist: 2400, colour: pal.ridgeMid, amp: 130 },
      { dist: 1200, colour: pal.ridgeNear, amp: 170 },
    ];
    for (const layer of layers) {
      ctx.fillStyle = layer.colour;
      ctx.beginPath();
      ctx.moveTo(0, VIEW.height);
      for (let sx = 0; sx <= VIEW.width; sx += 16) {
        const wx = plane.x + (sx - VIEW.width / 2) * (layer.dist / FOCAL);
        const wz = plane.z + layer.dist;
        const h = state.terrainHeight(wx, wz);
        const y = horizonY - (h - plane.altitude) * (FOCAL / layer.dist) * 0.9
          - layer.amp * 0.4;
        ctx.lineTo(sx, y);
      }
      ctx.lineTo(VIEW.width, VIEW.height);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawGround(state) {
    const pal = stagePalette(state);
    const plane = state.plane;
    const horizonY = HORIZON_REST - plane.pitch * 5;
    // River (coast: the sea; desert: a dry wash), a winding band down the valley.
    ctx.strokeStyle = pal.river;
    ctx.lineWidth = state.stage === 1 ? 60 : 26;
    ctx.beginPath();
    for (let sy = horizonY; sy <= VIEW.height; sy += 12) {
      const depth = (sy - horizonY) / (VIEW.height - horizonY);
      const z = plane.z + 60 + depth * depth * 2600;
      const riverX = 260 * Math.sin(z / 900) - plane.x * 0.35
        - wrapAngle(plane.heading) * 6;
      const sx = VIEW.width / 2 + riverX * (0.4 + depth);
      if (sy === horizonY) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.stroke();
    // Road: a pale band beside the river.
    ctx.strokeStyle = pal.road;
    ctx.lineWidth = 10;
    ctx.beginPath();
    for (let sy = horizonY; sy <= VIEW.height; sy += 12) {
      const depth = (sy - horizonY) / (VIEW.height - horizonY);
      const z = plane.z + 60 + depth * depth * 2600;
      const roadX = 260 * Math.sin(z / 900) + 90 - plane.x * 0.35
        - wrapAngle(plane.heading) * 6;
      const sx = VIEW.width / 2 + roadX * (0.4 + depth);
      if (sy === horizonY) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.stroke();
  }

  function drawWind(state) {
    // Gust streaks: diagonal lines that drift with the wind, only where
    // the wind matters (coast, and strongly in the desert).
    if (state.stage === 0 || Math.abs(state.wind) < 1.5) return;
    const strength = clamp(Math.abs(state.wind) / 12, 0.2, 1);
    ctx.save();
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.28 * strength})`;
    ctx.lineWidth = 2;
    for (let i = 0; i < 14; i += 1) {
      const seed = i * 173 + 41;
      const x = ((seed * 7 + state.elapsed * (60 + state.wind * 22)) % 1400 + 1400) % 1400 - 60;
      const y = 90 + ((seed * 13) % 420);
      const len = 26 + strength * 40;
      const dir = state.wind >= 0 ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + dir * len, y + len * 0.28);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawRunway(state) {
    const plane = state.plane;
    const runway = state.course.runway;
    const corners = [
      project(state, -runway.width / 2, 0, runway.z - runway.length / 2),
      project(state, runway.width / 2, 0, runway.z - runway.length / 2),
      project(state, runway.width / 2, 0, runway.z + runway.length / 2),
      project(state, -runway.width / 2, 0, runway.z + runway.length / 2),
    ];
    if (corners.some((c) => c === null)) return;
    if (corners[0].dz > 6000) return;
    ctx.fillStyle = PALETTE.runway;
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (const c of corners.slice(1)) ctx.lineTo(c.x, c.y);
    ctx.closePath();
    ctx.fill();
    // Centreline dashes.
    ctx.strokeStyle = PALETTE.runwayLine;
    ctx.lineWidth = Math.max(1, 4 * (FOCAL / corners[0].dz));
    ctx.beginPath();
    const near = project(state, 0, 0, runway.z + runway.length / 2 - 60);
    const far = project(state, 0, 0, runway.z - runway.length / 2 + 60);
    if (near && far) {
      ctx.moveTo(near.x, near.y);
      ctx.lineTo(far.x, far.y);
    }
    ctx.stroke();
    // Threshold bars at the near end.
    if (near) {
      ctx.fillStyle = PALETTE.runwayLine;
      const w = runway.width * (FOCAL / corners[3].dz) * 0.32;
      ctx.fillRect(near.x - w - 8, near.y - 4, w, 5);
      ctx.fillRect(near.x + 8, near.y - 4, w, 5);
    }
  }

  function drawRings(state) {
    const pal = stagePalette(state);
    const plane = state.plane;
    const target = state.course.rings[state.ringsResolved] ?? null;
    const all = state.course.rings;
    // Far ones first, so near ones paint over them.
    const visible = [];
    for (const ring of all) {
      if (ring.passed || ring.missed || ring.nearMissed) continue;
      const p = project(state, ring.x, ring.y, ring.z);
      if (p && p.dz < 2600) visible.push({ ring, p });
    }
    visible.sort((a, b) => b.p.dz - a.p.dz);
    for (const { ring, p } of visible) {
      const isNext = ring === target;
      // A ring right on top of the camera would swallow the frame: cap its
      // drawn size and fade it as the plane flies through it.
      const shownR = Math.min(p.r * (ring.radius / WORLD.ringRadius), 300);
      const nearFade = p.dz < 80 ? 0.25 + 0.75 * (p.dz / 80) : 1;
      ctx.save();
      ctx.strokeStyle = isNext ? pal.ringNext : pal.ring;
      ctx.globalAlpha = (isNext ? 1 : 0.55) * nearFade;
      ctx.lineWidth = Math.max(2, shownR * 0.16);
      ctx.shadowColor = pal.ring;
      ctx.shadowBlur = isNext ? 18 : 6;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, Math.max(3, shownR), Math.max(2, shownR * 0.92), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      if (isNext && p.r > 14 && p.y - p.r - 8 > 110) {
        const inStage = (state.ringsResolved % WORLD.ringsPerStage) + 1;
        const label = `S${ring.stage + 1} RING ${inStage}/8`;
        ctx.font = `bold ${Math.max(11, Math.min(20, p.r * 0.4))}px ${'system-ui, sans-serif'}`;
        const lw = ctx.measureText(label).width;
        ctx.fillStyle = 'rgba(12, 20, 30, 0.72)';
        ctx.fillRect(p.x - lw / 2 - 8, p.y - p.r - 8 - 16, lw + 16, 22);
        ctx.fillStyle = PALETTE.hudText;
        ctx.textAlign = 'center';
        ctx.fillText(label, p.x, p.y - p.r - 8);
      }
    }
  }

  function drawObstacles(state) {
    for (const ob of state.course.obstacles) {
      if (ob.stage !== state.stage || ob.hit) continue;
      const pos = obstaclePosition(ob, state.elapsed);
      const p = project(state, pos.x, pos.y, pos.z);
      if (!p || p.dz > 2600 || p.dz < 20) continue;
      const s = clamp(900 / p.dz, 2, 26);
      ctx.save();
      ctx.translate(p.x, p.y);
      if (ob.kind === 'gull') {
        // A gull: two flapping arcs, white.
        const flap = Math.sin(state.elapsed * 6 + ob.phase) * 0.5;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(1.5, s * 0.14);
        ctx.beginPath();
        ctx.moveTo(-s, flap * s * 0.4);
        ctx.quadraticCurveTo(-s * 0.4, -s * (0.7 + flap * 0.3), 0, 0);
        ctx.quadraticCurveTo(s * 0.4, -s * (0.7 + flap * 0.3), s, flap * s * 0.4);
        ctx.stroke();
      } else {
        // A drone: dark body, spinning rotor blur, red blink.
        ctx.fillStyle = '#22282e';
        ctx.fillRect(-s * 0.7, -s * 0.35, s * 1.4, s * 0.7);
        ctx.strokeStyle = 'rgba(200, 200, 200, 0.7)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(0, -s * 0.4, s, s * 0.22, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = Math.floor(state.elapsed * 3) % 2 === 0 ? '#ff4d4d' : '#881111';
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(2, s * 0.18), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawPlane(state) {
    const plane = state.plane;
    const body = state.aircraft?.colour ?? PALETTE.planeBody;
    const wing = state.aircraft?.wing ?? PALETTE.planeWing;
    const cx = VIEW.width / 2;
    const cy = VIEW.height - 150;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((plane.bank * Math.PI) / 180);
    // Wings.
    ctx.fillStyle = wing;
    ctx.beginPath();
    ctx.moveTo(-150, 6);
    ctx.lineTo(-30, -6);
    ctx.lineTo(30, -6);
    ctx.lineTo(150, 6);
    ctx.lineTo(138, 16);
    ctx.lineTo(-138, 16);
    ctx.closePath();
    ctx.fill();
    // Tailplane.
    ctx.fillStyle = wing;
    ctx.beginPath();
    ctx.moveTo(-52, -52);
    ctx.lineTo(-14, -58);
    ctx.lineTo(14, -58);
    ctx.lineTo(52, -52);
    ctx.lineTo(44, -44);
    ctx.lineTo(-44, -44);
    ctx.closePath();
    ctx.fill();
    // Fuselage, nose up the screen.
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(0, -96);
    ctx.quadraticCurveTo(20, -60, 18, -10);
    ctx.quadraticCurveTo(16, 34, 0, 44);
    ctx.quadraticCurveTo(-16, 34, -18, -10);
    ctx.quadraticCurveTo(-20, -60, 0, -96);
    ctx.fill();
    // Canopy.
    ctx.fillStyle = PALETTE.planeGlass;
    ctx.beginPath();
    ctx.ellipse(0, -52, 11, 20, 0, 0, Math.PI * 2);
    ctx.fill();
    // Propeller blur at the nose (the jet gets a glow instead).
    if (state.aircraft?.id === 'jet') {
      ctx.fillStyle = 'rgba(255, 180, 80, 0.85)';
      ctx.beginPath();
      ctx.ellipse(0, 46, 8, 16, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = 'rgba(20, 20, 20, 0.35)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.ellipse(0, -92, 26, 7, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Navigation lights.
    ctx.fillStyle = '#ff4d4d';
    ctx.beginPath();
    ctx.arc(-148, 10, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4dff6a';
    ctx.beginPath();
    ctx.arc(148, 10, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Altitude shadow: a soft ellipse on the ground below the plane.
    const ground = state.terrainHeight(plane.x, plane.z);
    const heightAbove = Math.max(0, plane.altitude - ground);
    if (heightAbove < 400) {
      const alpha = 0.28 * (1 - heightAbove / 400);
      ctx.fillStyle = `rgba(10, 14, 10, ${alpha})`;
      ctx.beginPath();
      ctx.ellipse(cx, VIEW.height - 60, 70, 12, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function bar(x, y, w, h, frac, colour, label) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = colour;
    ctx.fillRect(x, y, w * clamp(frac, 0, 1), h);
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(label, x, y - 4);
  }

  /** Vertical tape (speed left, altitude right) with tick labels. */
  function drawTape(x, value, unit, label, range, step) {
    const top = 150;
    const bottom = 560;
    const mid = (top + bottom) / 2;
    ctx.fillStyle = 'rgba(12, 20, 30, 0.55)';
    ctx.fillRect(x - 34, top - 24, 68, bottom - top + 48);
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, x, top - 8);
    ctx.strokeStyle = 'rgba(238, 243, 246, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 26, top);
    ctx.lineTo(x + 26, bottom);
    ctx.stroke();
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = PALETTE.muted;
    const lo = Math.floor((value - range) / step) * step;
    for (let v = lo; v <= value + range; v += step) {
      const y = mid - ((v - value) / range) * ((bottom - top) / 2);
      if (y < top || y > bottom) continue;
      ctx.fillText(String(v), x - 2, y + 4);
      ctx.strokeStyle = 'rgba(238, 243, 246, 0.4)';
      ctx.beginPath();
      ctx.moveTo(x + 22, y);
      ctx.lineTo(x + 30, y);
      ctx.stroke();
    }
    // Centre marker: the current value.
    ctx.fillStyle = PALETTE.ringNext;
    ctx.beginPath();
    ctx.moveTo(x + 30, mid - 6);
    ctx.lineTo(x + 40, mid);
    ctx.lineTo(x + 30, mid + 6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.fillText(`${Math.round(value)} ${unit}`, x, bottom + 20);
  }

  /** Stage progress bar with 24 ring markers, top centre under the banner. */
  function drawProgress(state) {
    const x0 = VIEW.width / 2 - 260;
    const y = 56;
    const w = 520;
    ctx.fillStyle = 'rgba(12, 20, 30, 0.55)';
    ctx.fillRect(x0 - 10, y - 14, w + 20, 30);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.fillRect(x0, y, w, 6);
    ctx.fillStyle = PALETTE.ringNext;
    ctx.fillRect(x0, y, (w * state.ringsResolved) / WORLD.totalRings, 6);
    for (let i = 0; i < WORLD.totalRings; i += 1) {
      const mx = x0 + ((i + 0.5) / WORLD.totalRings) * w;
      const ring = state.course.rings[i];
      ctx.fillStyle = ring?.passed ? PALETTE.hudGood
        : ring?.nearMissed ? '#ff9f3f'
        : ring?.missed ? PALETTE.hudWarn : 'rgba(238, 243, 246, 0.55)';
      ctx.beginPath();
      ctx.arc(mx, y + 3, i === state.ringsResolved ? 5 : 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Stage dividers + runway tick.
    ctx.fillStyle = PALETTE.muted;
    for (const s of [1, 2]) {
      const dx = x0 + (s * WORLD.ringsPerStage / WORLD.totalRings) * w;
      ctx.fillRect(dx - 1, y - 4, 2, 14);
    }
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('S1', x0 + (w / 6), y + 24);
    ctx.fillText('S2', x0 + (w / 2), y + 24);
    ctx.fillText('S3', x0 + (w * 5 / 6), y + 24);
    ctx.fillText('▮ RWY', x0 + w + 4, y + 24);
  }

  /** Course strip: the whole route with rings, plane and runway. */
  function drawCourseStrip(state) {
    const x0 = 150;
    const y = VIEW.height - 52;
    const w = VIEW.width - 300;
    const total = WORLD.runwayAt + 400;
    ctx.fillStyle = 'rgba(12, 20, 30, 0.55)';
    ctx.fillRect(x0 - 10, y - 12, w + 20, 26);
    ctx.strokeStyle = 'rgba(238, 243, 246, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x0 + w, y);
    ctx.stroke();
    for (let i = 0; i < WORLD.totalRings; i += 1) {
      const ring = state.course.rings[i];
      const rx = x0 + (ring.z / total) * w;
      ctx.fillStyle = ring.passed ? PALETTE.hudGood
        : ring.nearMissed ? '#ff9f3f'
        : ring.missed ? PALETTE.hudWarn
        : i === state.ringsResolved ? PALETTE.ringNext : 'rgba(238, 243, 246, 0.5)';
      ctx.beginPath();
      ctx.arc(rx, y, i === state.ringsResolved ? 5 : 3, 0, Math.PI * 2);
      ctx.fill();
    }
    const rwx = x0 + (WORLD.runwayAt / total) * w;
    ctx.fillStyle = PALETTE.hudText;
    ctx.fillRect(rwx - 2, y - 8, 4, 16);
    const px = x0 + clamp(state.plane.z / total, 0, 1) * w;
    ctx.fillStyle = PALETTE.ringNext;
    ctx.beginPath();
    ctx.moveTo(px, y - 10);
    ctx.lineTo(px - 6, y - 18);
    ctx.lineTo(px + 6, y - 18);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('COURSE', x0 - 10, y - 18);
  }

  function drawHud(state, screen, best) {
    const plane = state.plane;
    const mission = missionFor(state.ringsResolved, state.gatesResolved);
    const playing = screen === SCREEN_PLAY;
    const cap = state.fuelCapacity || 100;
    ctx.textAlign = 'left';
    // Top-left instrument panel.
    ctx.fillStyle = PALETTE.hudPanel;
    ctx.fillRect(16, 14, 330, 92);
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.fillText(`${Math.round(plane.altitude)} m`, 28, 46);
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText('ALTITUDE', 28, 62);
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.fillText(`${Math.round(plane.speed * 1.944)} kt`, 150, 46);
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText('SPEED', 150, 62);
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.fillText(`${String(Math.round(plane.heading)).padStart(3, '0')}°`, 258, 46);
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText(`HEADING ${compass(plane.heading)}`, 258, 62);
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(`THR ${Math.round(plane.throttle * 100)}%   VS ${plane.verticalSpeed >= 0 ? '+' : ''}${plane.verticalSpeed.toFixed(1)} m/s`, 28, 92);
    // Top-right: fuel, hull, stars, upgrades, score and best.
    ctx.fillStyle = PALETTE.hudPanel;
    ctx.fillRect(VIEW.width - 346, 14, 330, 110);
    bar(VIEW.width - 330, 48, 140, 10, plane.fuel / cap,
      plane.fuel < 20 ? PALETTE.hudWarn : PALETTE.hudGood, 'FUEL');
    bar(VIEW.width - 170, 48, 140, 10, 1 - plane.damage / 100,
      plane.damage > 60 ? PALETTE.hudWarn : PALETTE.hudGood, 'HULL');
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`★ ${state.stars}   ${state.aircraft?.name ?? ''}`, VIEW.width - 330, 82);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '12px system-ui, sans-serif';
    const ups = UPGRADE_ORDER.map((id) => `${UPGRADES[id].name.slice(0, 3)} ${state.upgrades[id]}`).join(' · ');
    ctx.fillText(ups, VIEW.width - 170, 82);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(`BEST ${best}`, VIEW.width - 330, 106);
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`SCORE ${state.score}`, VIEW.width - 28, 106);
    if (screen === SCREEN_SHOP) {
      // The shop card covers the centre of the screen: only the corner
      // panels show, so the banner, progress bar and messages never
      // bleed through the card.
      ctx.fillStyle = 'rgba(12, 20, 30, 0.55)';
      ctx.fillRect(VIEW.width / 2 - 330, VIEW.height - 30, 660, 20);
      ctx.fillStyle = PALETTE.muted;
      ctx.font = '12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('← → bank   ↑ ↓ pitch   E / Q throttle   mouse steers   P pause', VIEW.width / 2, VIEW.height - 16);
      return;
    }
    // Mission banner, top centre, with stage progress bar below it. The
    // combo rides in the banner itself: a separate box would cover the
    // progress bar's stage labels.
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.hudPanel;
    const inStage = state.ringsResolved < WORLD.totalRings
      ? (state.ringsResolved % WORLD.ringsPerStage) : WORLD.ringsPerStage;
    let banner = mission.index < 3
      ? `${mission.name}  ·  ${inStage}/${WORLD.ringsPerStage}  ·  ${state.ringsPassed}/24 rings`
      : `${mission.name}  ·  ${state.ringsPassed}/24 rings`;
    if (state.combo >= 2) {
      const mult = (1 + Math.min(state.combo, 10) * WORLD.comboStep).toFixed(1);
      banner += `  ·  COMBO x${mult}`;
    }
    ctx.fillRect(VIEW.width / 2 - 280, 14, 560, 34);
    ctx.fillStyle = PALETTE.ringNext;
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillText(banner, VIEW.width / 2, 37);
    drawProgress(state);
    // Distance to the next ring (or to the runway on final approach),
    // at the right end of the course strip row: the centre column is
    // already full with the banner, progress bar and message pill.
    // Only while flying: on the title screen the plane is parked past
    // the rings and the distance would read 0 m.
    if (playing || screen === SCREEN_PAUSED) {
      const nextRing = state.course.rings[state.ringsResolved];
      const distText = nextRing
        ? `NEXT RING ${Math.max(0, Math.round(nextRing.z - plane.z))} m`
        : `RUNWAY ${Math.max(0, Math.round(WORLD.runwayAt - plane.z))} m`;
      ctx.fillStyle = PALETTE.hudText;
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(distText, VIEW.width - 150, VIEW.height - 70);
    }
    // Wind readout.
    if (state.stage > 0 && Math.abs(state.wind) >= 1) {
      ctx.fillStyle = 'rgba(12, 20, 30, 0.72)';
      ctx.fillRect(VIEW.width / 2 - 110, 110, 220, 24);
      ctx.fillStyle = PALETTE.hudText;
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.fillText(`WIND ${state.wind >= 0 ? '→' : '←'} ${Math.abs(state.wind).toFixed(1)} m/s`, VIEW.width / 2, 127);
    }
    // (The stage-complete message pill is drawn after the tapes, below,
    // so the speed tape never covers its left end.)
    // Warnings.
    ctx.textAlign = 'center';
    if (playing && plane.speed < 52 && !state.finished) {
      ctx.fillStyle = Math.floor(state.elapsed * 4) % 2 === 0 ? PALETTE.hudWarn : PALETTE.hudText;
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.fillText('⚠ STALL — ADD POWER', VIEW.width / 2, 200);
    } else if (playing && plane.fuel < 20 && plane.fuel > 0 && !state.finished) {
      ctx.fillStyle = PALETTE.hudWarn;
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.fillText('⚠ LOW FUEL', VIEW.width / 2, 200);
    }
    // Speed + altitude tapes on the flanks, and the course strip.
    if (playing || screen === SCREEN_PAUSED) {
      drawTape(44, plane.speed * 1.944, 'kt', 'SPD', 60, 20);
      drawTape(VIEW.width - 44, plane.altitude, 'm', 'ALT', 120, 40);
      drawCourseStrip(state);
    }
    // Message line: only while flying, so the title screen stays clean
    // and a parked plane never warns about a stall. The message sits on
    // a dark pill: white text vanishes against clouds. Drawn after the
    // tapes so the speed tape never covers its left end.
    if (playing && state.messageTimer > 0 && state.message) {
      ctx.font = 'bold 19px system-ui, sans-serif';
      const mw = ctx.measureText(state.message).width;
      ctx.fillStyle = 'rgba(12, 20, 30, 0.72)';
      ctx.fillRect(VIEW.width / 2 - mw / 2 - 14, 146, mw + 28, 30);
      ctx.fillStyle = PALETTE.hudText;
      ctx.textAlign = 'center';
      ctx.fillText(state.message, VIEW.width / 2, 168);
    }
    // Controls hint, bottom centre.
    ctx.fillStyle = 'rgba(12, 20, 30, 0.55)';
    ctx.fillRect(VIEW.width / 2 - 330, VIEW.height - 30, 660, 20);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText('← → bank   ↑ ↓ pitch   E / Q throttle   mouse steers   P pause', VIEW.width / 2, VIEW.height - 16);
  }

  function drawAttitude(state) {
    const plane = state.plane;
    const cx = 72;
    const cy = VIEW.height - 78;
    const r = 44;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#7fb2d9';
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((-plane.bank * Math.PI) / 180);
    ctx.translate(0, plane.pitch * 1.6);
    ctx.fillStyle = '#6d8f5a';
    ctx.fillRect(-r, 0, r * 2, r);
    ctx.fillStyle = '#eef3f6';
    ctx.fillRect(-r, -2, r * 2, 4);
    ctx.restore();
    ctx.restore();
    ctx.strokeStyle = PALETTE.hudText;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = PALETTE.ringNext;
    ctx.beginPath();
    ctx.moveTo(cx - 16, cy);
    ctx.lineTo(cx + 16, cy);
    ctx.lineTo(cx, cy + 6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ATTITUDE', cx, cy + r + 14);
  }

  function statBar(x, y, w, label, value, max) {
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(label, x, y - 4);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.fillRect(x, y, w, 7);
    ctx.fillStyle = PALETTE.ringNext;
    ctx.fillRect(x, y, (w * value) / max, 7);
  }

  function drawTitle(state, best, ui) {
    const selected = ui?.aircraft ?? 'bush';
    ctx.fillStyle = 'rgba(8, 14, 22, 0.45)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = 'bold 76px system-ui, sans-serif';
    ctx.fillText('RING RUNNER', VIEW.width / 2, 150);
    ctx.font = '22px system-ui, sans-serif';
    ctx.fillStyle = PALETTE.ringNext;
    ctx.fillText('Rescue flight across 3 stages — 24 rings, gulls, gusts, then the runway', VIEW.width / 2, 188);
    // Aircraft cards.
    const cardW = 300;
    const gap = 24;
    const totalW = cardW * 3 + gap * 2;
    const x0 = (VIEW.width - totalW) / 2;
    AIRCRAFT_ORDER.forEach((id, i) => {
      const ac = AIRCRAFTS[id];
      const x = x0 + i * (cardW + gap);
      const y = 220;
      const isSel = id === selected;
      ctx.fillStyle = isSel ? 'rgba(255, 207, 63, 0.22)' : 'rgba(12, 20, 30, 0.72)';
      ctx.fillRect(x, y, cardW, 190);
      ctx.strokeStyle = isSel ? PALETTE.ringNext : 'rgba(238, 243, 246, 0.35)';
      ctx.lineWidth = isSel ? 3 : 1;
      ctx.strokeRect(x, y, cardW, 190);
      ctx.fillStyle = ac.colour;
      ctx.beginPath();
      ctx.arc(x + 34, y + 34, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PALETTE.hudText;
      ctx.font = 'bold 22px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${i + 1} · ${ac.name}`, x + 60, y + 42);
      ctx.fillStyle = PALETTE.muted;
      ctx.font = '14px system-ui, sans-serif';
      ctx.fillText(ac.tag, x + 16, y + 72);
      ctx.fillStyle = PALETTE.hudText;
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillText(ac.desc, x + 16, y + 94);
      statBar(x + 16, y + 122, cardW - 32, 'SPEED', ac.stats.speed, 5);
      statBar(x + 16, y + 148, cardW - 32, 'AGILITY', ac.stats.agility, 5);
      statBar(x + 16, y + 174, cardW - 32, 'FUEL', ac.stats.fuel, 5);
      if (isSel) {
        ctx.fillStyle = PALETTE.ringNext;
        ctx.font = 'bold 14px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('★ SELECTED', x + cardW / 2, y + 208 - 8);
      }
    });
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = '17px system-ui, sans-serif';
    const lines = [
      'STAGE 1 Alpine Valley — 8 rings · STAGE 2 Coastal Cliffs — 8 rings, watch the gulls',
      'STAGE 3 Desert Canyon — 8 tight rings, gusts and drones · then land for +500',
      'Clean rings build a combo (up to x2). Rim clips pay +25. Beat the stage par for a time bonus.',
    ];
    lines.forEach((line, i) => ctx.fillText(line, VIEW.width / 2, 452 + i * 26));
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillStyle = PALETTE.ringNext;
    ctx.fillText('Press 1 / 2 / 3 to pick a plane, Space to fly', VIEW.width / 2, 556);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillText('← → bank · ↑ ↓ pitch · E / Q throttle · mouse steers · P pause', VIEW.width / 2, 588);
    if (best > 0) {
      ctx.fillStyle = PALETTE.hudText;
      ctx.font = '17px system-ui, sans-serif';
      ctx.fillText(`Best score: ${best}`, VIEW.width / 2, 622);
    }
  }

  function drawShop(state, best) {
    ctx.fillStyle = 'rgba(8, 14, 22, 0.78)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.textAlign = 'center';
    const done = state.shopStage;
    const stageName = done >= 0 ? STAGES[done].name : 'STAGE COMPLETE';
    const time = done >= 0 ? state.stageTimes[done] : 0;
    ctx.fillStyle = PALETTE.ringNext;
    ctx.font = 'bold 44px system-ui, sans-serif';
    ctx.fillText(`${stageName} — COMPLETE`, VIEW.width / 2, 120);
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = '19px system-ui, sans-serif';
    ctx.fillText(`Rings ${state.ringsPassed}/24  ·  stage time ${time.toFixed(1)}s (par ${WORLD.stagePar}s)  ·  score ${state.score}`, VIEW.width / 2, 158);
    ctx.fillStyle = '#ffd98a';
    ctx.font = 'bold 24px system-ui, sans-serif';
    ctx.fillText(`★ You have ${state.stars} stars — spend them in the upgrade shop`, VIEW.width / 2, 200);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillText('Fuel refilled to full. Upgrades stay with you for the rest of the run.', VIEW.width / 2, 228);
    const cardW = 300;
    const gap = 24;
    const totalW = cardW * 3 + gap * 2;
    const x0 = (VIEW.width - totalW) / 2;
    UPGRADE_ORDER.forEach((id, i) => {
      const def = UPGRADES[id];
      const level = state.upgrades[id];
      const maxed = level >= def.max;
      const afford = state.stars >= def.cost;
      const x = x0 + i * (cardW + gap);
      const y = 260;
      ctx.fillStyle = maxed ? 'rgba(127, 224, 138, 0.16)' : 'rgba(12, 20, 30, 0.78)';
      ctx.fillRect(x, y, cardW, 180);
      ctx.strokeStyle = afford && !maxed ? PALETTE.ringNext : 'rgba(238, 243, 246, 0.35)';
      ctx.lineWidth = afford && !maxed ? 3 : 1;
      ctx.strokeRect(x, y, cardW, 180);
      ctx.fillStyle = PALETTE.hudText;
      ctx.font = 'bold 22px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${i + 1} · ${def.name}`, x + 16, y + 40);
      ctx.fillStyle = PALETTE.muted;
      ctx.font = '14px system-ui, sans-serif';
      ctx.fillText(def.desc, x + 16, y + 68);
      ctx.fillStyle = PALETTE.ringNext;
      ctx.font = 'bold 18px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('●'.repeat(level) + '○'.repeat(def.max - level), x + cardW / 2, y + 104);
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.fillStyle = maxed ? PALETTE.hudGood : afford ? PALETTE.ringNext : PALETTE.hudWarn;
      ctx.fillText(maxed ? 'MAXED OUT' : `★ ${def.cost} stars`, x + cardW / 2, y + 142);
    });
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.ringNext;
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillText('Press 1 / 2 / 3 to buy, Space to fly the next stage', VIEW.width / 2, 500);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillText(`Engine ${state.upgrades.engine} · Fuel Tank ${state.upgrades.tank} · Armor ${state.upgrades.armor}`, VIEW.width / 2, 534);
    if (best > 0) {
      ctx.fillStyle = PALETTE.hudText;
      ctx.font = '16px system-ui, sans-serif';
      ctx.fillText(`Best score: ${best}`, VIEW.width / 2, 566);
    }
  }

  function debriefLines(state) {
    const mins = Math.floor(state.elapsed / 60);
    const secs = Math.round(state.elapsed % 60);
    return [
      `Score ${state.score} · rings ${state.ringsPassed}/24 (centre ${state.centrePasses}, near miss ${state.nearMisses})`,
      `Best combo x${(1 + Math.min(state.bestCombo, 10) * WORLD.comboStep).toFixed(1)} (${state.bestCombo} clean) · time ${mins}:${String(secs).padStart(2, '0')}`,
      `Stars ${state.stars} · upgrades ENG ${state.upgrades.engine} / TNK ${state.upgrades.tank} / ARM ${state.upgrades.armor} · obstacles hit ${state.obstaclesHit}`,
      `Fuel left ${Math.round(state.plane.fuel)}% · hull ${Math.round(100 - state.plane.damage)}% · ${state.aircraft?.name ?? ''}`,
    ];
  }

  function drawOverlay(title, lines, best) {
    ctx.fillStyle = 'rgba(8, 14, 22, 0.55)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = 'bold 52px system-ui, sans-serif';
    ctx.fillText(title, VIEW.width / 2, 270);
    ctx.font = '20px system-ui, sans-serif';
    lines.forEach((line, i) => ctx.fillText(line, VIEW.width / 2, 320 + i * 32));
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillStyle = PALETTE.ringNext;
    ctx.fillText('Press Space or click to fly again', VIEW.width / 2, 320 + lines.length * 32 + 30);
    if (best > 0) {
      ctx.fillStyle = PALETTE.muted;
      ctx.font = '16px system-ui, sans-serif';
      ctx.fillText(`Best score: ${best}`, VIEW.width / 2, 320 + lines.length * 32 + 62);
    }
  }

  function draw(state, screen, best, ui) {
    ctx.clearRect(0, 0, VIEW.width, VIEW.height);
    // Paint the sky first, unrotated, so a banked world never shows the
    // page background in the corners.
    ctx.fillStyle = PALETTE.skyTop;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    const plane = state.plane;
    ctx.save();
    // The world banks with the plane, a little, for the feel of a turn.
    // A slight zoom keeps the rotated world covering the corners.
    ctx.translate(VIEW.width / 2, HORIZON_REST);
    ctx.rotate((-plane.bank * 0.15 * Math.PI) / 180);
    ctx.scale(1.08, 1.08);
    ctx.translate(-VIEW.width / 2, -HORIZON_REST);
    drawSky(state);
    drawRidges(state);
    drawGround(state);
    drawRunway(state);
    drawRings(state);
    drawObstacles(state);
    drawWind(state);
    ctx.restore();
    drawPlane(state);
    drawHud(state, screen, best);
    drawAttitude(state);
    if (screen === SCREEN_TITLE) drawTitle(state, best, ui);
    else if (screen === SCREEN_PAUSED) {
      drawOverlay('PAUSED', ['Take a breath. The valley waits.', 'P resume · R restart · Space fly again'], best);
    } else if (screen === SCREEN_OVER) {
      drawOverlay('CRASHED', [state.message || 'The hillside wins this time.', ...debriefLines(state)], best);
    } else if (screen === SCREEN_LANDED) {
      drawOverlay('LANDED — SORTIE COMPLETE', [`Landing +${WORLD.landingPoints} + ${state.fuelBonus} fuel bonus.`, ...debriefLines(state)], best);
    } else if (screen === SCREEN_SHOP) {
      drawShop(state, best);
    }
  }

  return { draw };
}
