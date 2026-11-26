// Keyboard and pointer input. Held keys give stick deflections; one-shot
// presses (start, restart, pause) are queued as bit flags and taken once by
// the loop, so a press between two frames is never lost or counted twice.
// The mouse steers too: hold the pointer over the canvas and the plane
// banks toward it, climbs when the pointer is high, dives when it is low.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;

const BANK_LEFT = new Set(['ArrowLeft', 'KeyA']);
const BANK_RIGHT = new Set(['ArrowRight', 'KeyD']);
const PITCH_UP = new Set(['ArrowUp', 'KeyW']);
const PITCH_DOWN = new Set(['ArrowDown', 'KeyS']);
const THROTTLE_UP = new Set(['KeyE', 'PageUp']);
const THROTTLE_DOWN = new Set(['KeyQ', 'PageDown']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);

export function createInput(target) {
  const keys = new Set();
  let actions = 0;
  let pointerX = null;
  let pointerY = null;
  let pointerDown = false;

  window.addEventListener('keydown', (event) => {
    if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (
      BANK_LEFT.has(event.code) || BANK_RIGHT.has(event.code)
      || PITCH_UP.has(event.code) || PITCH_DOWN.has(event.code)
      || THROTTLE_UP.has(event.code) || THROTTLE_DOWN.has(event.code)
    ) {
      keys.add(event.code);
    } else {
      return;
    }
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    keys.delete(event.code);
  });
  window.addEventListener('blur', () => {
    keys.clear();
    pointerDown = false;
  });
  target.addEventListener('pointerdown', (event) => {
    pointerDown = true;
    pointerX = event.clientX;
    pointerY = event.clientY;
    actions |= ACTION_CONFIRM;
  });
  target.addEventListener('pointermove', (event) => {
    pointerX = event.clientX;
    pointerY = event.clientY;
  });
  target.addEventListener('pointerup', () => {
    pointerDown = false;
  });

  function held(set) {
    for (const code of set) if (keys.has(code)) return true;
    return false;
  }

  return {
    /** -1 (left) .. 1 (right): keys win, else the pointer steers. */
    bankStick() {
      const key = (held(BANK_RIGHT) ? 1 : 0) - (held(BANK_LEFT) ? 1 : 0);
      if (key !== 0 || !pointerDown || pointerX === null) return key;
      const rect = target.getBoundingClientRect();
      return Math.max(-1, Math.min(1, (pointerX - (rect.left + rect.width / 2)) / (rect.width / 4)));
    },
    /** -1 (dive) .. 1 (climb): keys win, else the pointer steers. */
    pitchStick() {
      const key = (held(PITCH_UP) ? 1 : 0) - (held(PITCH_DOWN) ? 1 : 0);
      if (key !== 0 || !pointerDown || pointerY === null) return key;
      const rect = target.getBoundingClientRect();
      return Math.max(-1, Math.min(1, ((rect.top + rect.height / 2) - pointerY) / (rect.height / 4)));
    },
    /** -1 (less power) .. 1 (more power). */
    throttleDelta() {
      return (held(THROTTLE_UP) ? 1 : 0) - (held(THROTTLE_DOWN) ? 1 : 0);
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
