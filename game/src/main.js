// Boot and the one loop: input is read every frame, the flight model
// advances in fixed 1/60 s steps (several in a slow frame, none in a fast
// one), and the renderer paints what is there. The game moves between five
// screens: title, play, paused, crashed and landed.
//
// ?seed=N fixes the valley and the course. ?shot=start|rings|slalom|landing
// (with &seed=N) stages that scene instead of running the loop, paints it
// twice and sets window.__shotReady for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createFlight, EVENT_CRASHED, EVENT_LANDED } from './flight.js';
import { ACTION_CONFIRM, ACTION_PAUSE, createInput } from './input.js';
import {
  createRenderer,
  SCREEN_LANDED,
  SCREEN_OVER,
  SCREEN_PAUSED,
  SCREEN_PLAY,
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
const flight = createFlight(createRandom(seed));
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
    renderer.draw(flight.state, scene.screen, readBest());
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

  // Screen readers (and anyone watching the page's text) hear the screen
  // changes and each scored ring.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    flight.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Flying. Ring Run: 8 rings ahead.');
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

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_CONFIRM
      && (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_LANDED)) {
      startGame();
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Flying.');
    }
  }

  function step() {
    const events = flight.step(
      STEP, input.bankStick(), input.pitchStick(), input.throttleDelta());
    if (events & (EVENT_CRASHED | EVENT_LANDED)) endGame();
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
    renderer.draw(flight.state, screen, best);
  }

  // Leaving the tab pauses a running game rather than letting the plane fly unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Ring Runner. Press Space or click to fly.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
