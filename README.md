# Ring Runner — Alpine Rescue Flight

[![make.fun bounty](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![Rank](https://make.fun/badge/best-flight-game-20261126-0057/rren7975-cell/best-flight-game-20261126/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![Reward](https://make.fun/badge/best-flight-game-20261126-0057/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)

A complete pseudo-3D flight game in the browser: fly a rescue plane down a
seeded alpine valley, thread 8 rings, slalom 8 canyon gates, then set her
down on the runway — with fuel to watch and hills that bite.

![Ring Runner](screenshots/1-start.jpg)

## How to play

Open `game/index.html` in a browser (or serve the `game/` folder with any
static server), then press **Space** or click to fly.

| Control | Action |
| --- | --- |
| ← → (or A / D) | Bank and turn |
| ↑ ↓ (or W / S) | Pitch up / down |
| E / Q (or PgUp / PgDn) | Throttle up / down |
| Mouse | Steer toward the pointer |
| Space / click | Start, restart |
| P | Pause |

## The three missions

1. **Ring Run** — fly through all 8 rings. Throttle discipline wins: too
   fast and the turns go wide (+100 per ring, +50 centre bonus).
2. **Canyon Slalom** — thread 8 gates between the peaks. Slow down for the
   tight ones (+120 per gate; a missed gate costs the points, not the game).
3. **Final Approach** — line up on the runway, slow below 70 m/s, set her
   down gently (+500 for a clean landing).

Fuel burns with throttle; hills hurt; a stall sinks you. The best score is
kept in your browser (localStorage).

## Running the tests

The flight model and the autopilot are plain ES modules with no browser
dependency, so they can be driven headlessly:

```bash
node /tmp/flight-test.mjs   # full sortie: rings, gates, landing
```

The autopilot flies the whole course on seed 1: 8/8 rings, 8/8 gates,
a clean landing, 3010 points, 42% fuel left, no damage.

Screenshots are staged from the same code with `?shot=<name>&seed=1`
(see `shots.json`): the autopilot flies the game in a real browser and the
page sets `window.__shotReady` when the scene is framed.

## Structure

```
game/
  index.html        page shell (1280×720 canvas, HUD)
  main.js           game loop, screens, shot staging, persistence
  src/
    config.js       all tuning in one place
    random.js       seeded RNG + 1-D value noise (deterministic world)
    terrain.js      heightfield, valley, course builder (rings, gates, runway)
    flight.js       flight model: lift, stall, fuel, damage, scoring, landing
    input.js        keyboard + mouse + pause
    render.js       sky, ridges, river, road, runway, rings, plane, HUD
    autopilot.js    intercept-steering demo pilot (also drives screenshots)
  screenshots/      4 staged shots (cover, rings, slalom, landing)
main.ts             hand-in: copies game/ + screenshots/ to /output, writes dossier.json
serve.ts            tiny dev server (bun/node) for local play
```

The world is fully deterministic for a given seed: the same seed always
builds the same valley, the same rings and the same gates.

## Licence

MIT — see [LICENSE](LICENSE).
