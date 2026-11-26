// Everything the player sees: sky, sun and clouds, layered ridges, the
// ground with its river and road, the rings and the runway, the chase-view
// aircraft, and the HUD (altitude, speed, heading, throttle, fuel, damage,
// mission and score). No rules in here: it paints a flight state.
import { MISSIONS, PALETTE, VIEW, WORLD } from './config.js';
import { missionFor } from './terrain.js';

export const SCREEN_TITLE = 0;
export const SCREEN_PLAY = 1;
export const SCREEN_PAUSED = 2;
export const SCREEN_OVER = 3;
export const SCREEN_LANDED = 4;

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
    const plane = state.plane;
    const grad = ctx.createLinearGradient(0, 0, 0, VIEW.height);
    grad.addColorStop(0, PALETTE.skyTop);
    grad.addColorStop(0.45, PALETTE.skyMid);
    grad.addColorStop(0.62, PALETTE.skyLow);
    grad.addColorStop(0.63, PALETTE.ground);
    grad.addColorStop(1, PALETTE.groundDark);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    // Sun: fixed in the world, so it drifts as the heading turns.
    const sunX = VIEW.width * 0.78 - wrapAngle(plane.heading - 40) * 4;
    const sunY = 120 - plane.pitch * 2;
    ctx.fillStyle = PALETTE.sun;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 217, 138, 0.25)';
    ctx.beginPath();
    ctx.arc(sunX, sunY, 52, 0, Math.PI * 2);
    ctx.fill();
    // Clouds: seeded puffs that slide with the heading.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
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
  }

  function drawRidges(state) {
    const plane = state.plane;
    const horizonY = HORIZON_REST - plane.pitch * 5;
    const layers = [
      { dist: 4200, colour: PALETTE.ridgeFar, amp: 90 },
      { dist: 2400, colour: PALETTE.ridgeMid, amp: 130 },
      { dist: 1200, colour: PALETTE.ridgeNear, amp: 170 },
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
    const plane = state.plane;
    const horizonY = HORIZON_REST - plane.pitch * 5;
    // River: a winding blue band down the valley, drawn as a strip.
    ctx.strokeStyle = PALETTE.river;
    ctx.lineWidth = 26;
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
    ctx.strokeStyle = PALETTE.road;
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
    const plane = state.plane;
    const target = state.course.rings[state.ringsResolved]
      ?? state.course.gates[state.gatesResolved] ?? null;
    const all = [...state.course.rings, ...state.course.gates];
    // Far ones first, so near ones paint over them.
    const visible = [];
    for (const ring of all) {
      if (ring.passed || ring.missed) continue;
      const p = project(state, ring.x, ring.y, ring.z);
      if (p && p.dz < 2600) visible.push({ ring, p });
    }
    visible.sort((a, b) => b.p.dz - a.p.dz);
    for (const { ring, p } of visible) {
      const isNext = ring === target;
      // A ring right on top of the camera would swallow the frame: cap its
      // drawn size and fade it as the plane flies through it.
      const shownR = Math.min(p.r, 300);
      const nearFade = p.dz < 80 ? 0.25 + 0.75 * (p.dz / 80) : 1;
      ctx.save();
      ctx.strokeStyle = isNext ? PALETTE.ringNext : PALETTE.ring;
      ctx.globalAlpha = (isNext ? 1 : 0.55) * nearFade;
      ctx.lineWidth = Math.max(2, shownR * 0.16);
      ctx.shadowColor = PALETTE.ring;
      ctx.shadowBlur = isNext ? 18 : 6;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, Math.max(3, shownR), Math.max(2, shownR * 0.92), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      if (isNext && p.r > 14 && p.y - p.r - 8 > 110) {
        ctx.fillStyle = PALETTE.hudText;
        ctx.font = `bold ${Math.max(11, Math.min(20, p.r * 0.4))}px ${'system-ui, sans-serif'}`;
        ctx.textAlign = 'center';
        ctx.fillText(ring.kind === 'ring' ? 'RING' : 'GATE', p.x, p.y - p.r - 8);
      }
    }
  }

  function drawPlane(state) {
    const plane = state.plane;
    const cx = VIEW.width / 2;
    const cy = VIEW.height - 150;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((plane.bank * Math.PI) / 180);
    // Wings.
    ctx.fillStyle = PALETTE.planeWing;
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
    ctx.fillStyle = PALETTE.planeWing;
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
    ctx.fillStyle = PALETTE.planeBody;
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
    // Propeller blur at the nose.
    ctx.strokeStyle = 'rgba(20, 20, 20, 0.35)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.ellipse(0, -92, 26, 7, 0, 0, Math.PI * 2);
    ctx.stroke();
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

  function drawHud(state, screen, best) {
    const plane = state.plane;
    const mission = missionFor(state.ringsResolved, state.gatesResolved);
    const playing = screen === SCREEN_PLAY;
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
    ctx.fillText(`${String(Math.round(plane.heading)).padStart(3, '0')}° ${compass(plane.heading)}`, 258, 46);
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText('HEADING', 258, 62);
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(`THR ${Math.round(plane.throttle * 100)}%   VS ${plane.verticalSpeed >= 0 ? '+' : ''}${plane.verticalSpeed.toFixed(1)} m/s`, 28, 92);
    // Top-right: fuel, damage, score and best.
    ctx.fillStyle = PALETTE.hudPanel;
    ctx.fillRect(VIEW.width - 346, 14, 330, 92);
    bar(VIEW.width - 330, 48, 140, 10, plane.fuel / 100,
      plane.fuel < 20 ? PALETTE.hudWarn : PALETTE.hudGood, 'FUEL');
    bar(VIEW.width - 170, 48, 140, 10, 1 - plane.damage / 100,
      plane.damage > 60 ? PALETTE.hudWarn : PALETTE.hudGood, 'HULL');
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`BEST ${best}`, VIEW.width - 330, 92);
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`SCORE ${state.score}`, VIEW.width - 28, 92);
    // Mission banner, top centre.
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.hudPanel;
    const done = mission.index === 0 ? state.ringsPassed : mission.index === 1 ? state.gatesPassed : 0;
    const total = mission.target;
    const banner = `${mission.name}  ·  ${done}/${total}`;
    ctx.fillRect(VIEW.width / 2 - 150, 14, 300, 34);
    ctx.fillStyle = PALETTE.ringNext;
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillText(banner, VIEW.width / 2, 37);
    // Message line and warnings: only while flying, so the title screen
    // stays clean and a parked plane never warns about a stall.
    if (playing && state.messageTimer > 0 && state.message) {
      ctx.font = 'bold 19px system-ui, sans-serif';
      ctx.fillStyle = PALETTE.hudText;
      ctx.fillText(state.message, VIEW.width / 2, 132);
    }
    // Warnings.
    ctx.textAlign = 'center';
    if (playing && plane.speed < 52 && !state.finished) {
      ctx.fillStyle = Math.floor(state.elapsed * 4) % 2 === 0 ? PALETTE.hudWarn : PALETTE.hudText;
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.fillText('⚠ STALL — ADD POWER', VIEW.width / 2, 168);
    } else if (playing && plane.fuel < 20 && plane.fuel > 0 && !state.finished) {
      ctx.fillStyle = PALETTE.hudWarn;
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.fillText('⚠ LOW FUEL', VIEW.width / 2, 168);
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

  function drawTitle(state, best) {
    ctx.fillStyle = 'rgba(8, 14, 22, 0.45)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = 'bold 84px system-ui, sans-serif';
    ctx.fillText('RING RUNNER', VIEW.width / 2, 210);
    ctx.font = '24px system-ui, sans-serif';
    ctx.fillStyle = PALETTE.ringNext;
    ctx.fillText('Alpine rescue flight — rings, canyon, runway', VIEW.width / 2, 252);
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = '18px system-ui, sans-serif';
    const lines = [
      '1 · RING RUN — fly through all 8 rings. Throttle discipline wins: too fast and the turns go wide.',
      '2 · CANYON SLALOM — thread 8 gates between the peaks. Slow down for the tight ones.',
      '3 · FINAL APPROACH — line up on the runway, slow below 70 m/s, set her down gently.',
      '',
      'Fuel burns with throttle. Hills hurt. A stall sinks you. Land it for +500.',
    ];
    lines.forEach((line, i) => ctx.fillText(line, VIEW.width / 2, 310 + i * 30));
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillStyle = PALETTE.ringNext;
    ctx.fillText('Press Space or click to fly', VIEW.width / 2, 520);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillText('← → bank · ↑ ↓ pitch · E / Q throttle · mouse steers · P pause', VIEW.width / 2, 552);
    if (best > 0) {
      ctx.fillStyle = PALETTE.hudText;
      ctx.font = '17px system-ui, sans-serif';
      ctx.fillText(`Best score: ${best}`, VIEW.width / 2, 586);
    }
  }

  function drawOverlay(title, lines, best) {
    ctx.fillStyle = 'rgba(8, 14, 22, 0.55)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = 'bold 56px system-ui, sans-serif';
    ctx.fillText(title, VIEW.width / 2, 300);
    ctx.font = '20px system-ui, sans-serif';
    lines.forEach((line, i) => ctx.fillText(line, VIEW.width / 2, 350 + i * 32));
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillStyle = PALETTE.ringNext;
    ctx.fillText('Press Space or click to fly again', VIEW.width / 2, 350 + lines.length * 32 + 30);
    if (best > 0) {
      ctx.fillStyle = PALETTE.muted;
      ctx.font = '16px system-ui, sans-serif';
      ctx.fillText(`Best score: ${best}`, VIEW.width / 2, 350 + lines.length * 32 + 62);
    }
  }

  function draw(state, screen, best) {
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
    ctx.restore();
    drawPlane(state);
    drawHud(state, screen, best);
    drawAttitude(state);
    if (screen === SCREEN_TITLE) drawTitle(state, best);
    else if (screen === SCREEN_PAUSED) {
      drawOverlay('PAUSED', ['Take a breath. The valley waits.'], best);
    } else if (screen === SCREEN_OVER) {
      drawOverlay('CRASHED', [
        state.message || 'The hillside wins this time.',
        `Score ${state.score} · rings ${state.ringsPassed}/${WORLD.ringCount} · gates ${state.gatesPassed}/${WORLD.gateCount}`,
      ], best);
    } else if (screen === SCREEN_LANDED) {
      drawOverlay('LANDED — SORTIE COMPLETE', [
        `Score ${state.score} · rings ${state.ringsPassed}/${WORLD.ringCount} · gates ${state.gatesPassed}/${WORLD.gateCount}`,
        `Fuel left ${Math.round(plane.fuel)}% · hull ${Math.round(100 - plane.damage)}%`,
      ], best);
    }
  }

  return { draw };
}
