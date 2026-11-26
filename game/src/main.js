// Boot and the one loop: input is read every frame, the flight model
// advances in fixed 1/60 s steps (several in a slow frame, none in a fast
// one), and the renderer paints what is there. The game moves between six
// screens: title (pick one of three aircraft), play, shop (between stages),
// paused, crashed and landed.
//
// ?seed=N fixes the valley and the course. ?shot=start|rings|coastal|shop|landing
// (with &seed=N) stages that scene instead of running the loop, paints it
// twice and sets window.__shotReady for a screenshot.
import { AIRCRAFTS, AIRCRAFT_ORDER, BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createFlight, EVENT_CRASHED, EVENT_LANDED, EVENT_STAGE } from './flight.js';
import { ACTION_CONFIRM, ACTION_PAUSE, createInput } from './input.js';
import {
  createRenderer,
  SCREEN_LANDED,
  SCREEN_OVER,
  SCREEN_PAUSED,
  SCREEN_PLAY,
  SCREEN_SHOP,
  SCREEN_TITLE,
} from './render.js';
import { stageShot } from './autopilot.js';

/** The longest frame the loop catches up on; a longer stall is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
let flight = createFlight(createRandom(seed), 'bush');
const renderer = createRenderer(canvas);

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, flight);
  let painted = 0;
  function paint() {
    renderer.draw(flight.state, scene.screen, readBest(), { aircraft: 'bush' });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let aircraft = 'bush';

  // Digit keys (1/2/3) pick an aircraft on the title screen and buy
  // upgrades in the shop; R restarts from the pause menu. The input
  // module only queues confirm/pause, so digits get their own listener.
  let digitPressed = null;
  let restartPressed = false;
  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    if (event.code === 'Digit1') digitPressed = 1;
    else if (event.code === 'Digit2') digitPressed = 2;
    else if (event.code === 'Digit3') digitPressed = 3;
    else if (event.code === 'KeyR') restartPressed = true;
  });

  // Screen readers (and anyone watching the page's text) hear the screen
  // changes and each scored ring.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    flight = createFlight(createRandom(seed), aircraft);
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce(`Flying the ${flight.state.aircraft.name}. Stage 1: 8 rings ahead.`);
  }

  function endGame() {
    const outcome = flight.state.outcome;
    screen = outcome === 'landed' ? SCREEN_LANDED : SCREEN_OVER;
    if (flight.state.score > best) {
      best = flight.state.score;
      saveBest(best);
    }
    announce(outcome === 'landed'
      ? `Landed. Score ${flight.state.score}. Best ${best}.`
      : `Crashed. Score ${flight.state.score}. Best ${best}.`);
  }

  function openShop() {
    screen = SCREEN_SHOP;
    announce(`Stage ${flight.state.shopStage + 1} complete. Spend your ${flight.state.stars} stars, then fly on.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    const digit = digitPressed;
    digitPressed = null;
    if (screen === SCREEN_TITLE) {
      if (digit !== null) {
        aircraft = AIRCRAFT_ORDER[digit - 1];
        announce(`Selected ${AIRCRAFTS[aircraft].name}.`);
      } else if (actions & ACTION_CONFIRM) {
        startGame();
      }
    } else if (screen === SCREEN_SHOP) {
      if (digit !== null) {
        const id = ['engine', 'tank', 'armor'][digit - 1];
        const ok = flight.buyUpgrade(id);
        announce(ok ? `Bought ${id}. ${flight.state.stars} stars left.` : `Cannot buy ${id} — not enough stars or maxed out.`);
      } else if (actions & ACTION_CONFIRM) {
        flight.continueAfterShop();
        screen = SCREEN_PLAY;
        announce(`Stage ${flight.state.stage + 1}: fly!`);
      }
    } else if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Flying.');
      } else if (restartPressed) {
        restartPressed = false;
        screen = SCREEN_TITLE;
        announce('Ring Runner. Pick a plane, press Space to fly.');
      }
    } else if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
        announce('Paused. P resume, R restart.');
      }
    } else if (actions & ACTION_CONFIRM
      && (screen === SCREEN_OVER || screen === SCREEN_LANDED)) {
      screen = SCREEN_TITLE;
      announce('Ring Runner. Pick a plane, press Space to fly.');
    }
    if (screen !== SCREEN_PAUSED) restartPressed = false;
  }

  function step() {
    const events = flight.step(
      STEP, input.bankStick(), input.pitchStick(), input.throttleDelta());
    if (events & (EVENT_CRASHED | EVENT_LANDED)) endGame();
    else if (events & EVENT_STAGE) openShop();
    else if (flight.state.messageTimer > 0) announce(flight.state.message);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_PLAY) {
      while (accumulator >= STEP && screen === SCREEN_PLAY) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(flight.state, screen, best, { aircraft });
  }

  // Leaving the tab pauses a running game rather than letting the plane fly unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Ring Runner. Pick a plane with 1, 2 or 3, then press Space to fly.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
