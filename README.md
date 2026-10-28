# Smash Hit — Race to Gamescom

[Play the public demo](https://fmormah.github.io/smash-hit/).

Pushes to `main` build and deploy automatically to GitHub Pages. Use Node.js 24, `npm ci`, and `npm run build` to reproduce the static build in `dist/`. Relative asset paths allow hosting under the repository URL.

## Original project documentation

# Race-to GAMESCOM 🔮

An endless, third-person **glass-weaving racer** built with [Three.js](https://threejs.org) and
[Vite](https://vitejs.dev) (vanilla TypeScript, no framework). You pilot a crystal craft that flies
forever down a surreal corridor of glass — **weave** through the hazards, **fly through boost rings
and level gates** to overdrive, and fire **scatter missiles** to blast a path clear.

The look & feel were reverse-engineered frame-by-frame from real Smash Hit footage, then grown into
its own racer:

- **Distinct chapter worlds** that morph as you travel — each with its **own architecture and obstacle mix**, not just a recolour:
  - **Azure** — bright enclosed corridors with suspended slabs
  - **Ember** — hanging glass spikes + beam waterfalls + tilted slabs
  - **Verdant** — the whole room **banks/cants**; angled glass everywhere
  - **Dusk** — DNA helices + tall translucent glass-grid megastructures
  - **Dawn** — open stepped terrain + pendulum chains + glowing floor markers
  - **Orchid** — pillared gateways + beam waterfalls + portals
  - **Sunset** — orange switch-gate rooms with floating approach pads
- **Crystal wormhole gates between levels** — each new chapter opens with a grand gate you fly through for a long overdrive boost.
- **Banking turns & slopes** — the rail curves left/right and climbs/dips; the camera banks into turns and the whole room follows the curving centreline.
- **Boost rings** that retune your craft's colour, surge your speed, and trigger barrel rolls / spins.
- **Gradient skies** with a blooming horizon band, **HDR bloom** post-processing, ACES tone mapping, glossy floors, monumental pillared architecture, and drifting particles.
- **Background music**, distance-attenuated **SFX**, an on-screen mute/pause, and a guided **how-to-play** tutorial.

Gameplay:

- **Weave, don't shoot the glass** — steering the craft through gaps is the core loop.
- **Speed is your health** — clean flying climbs your speed toward the cap; a crash craters it.
- **Scatter missiles** — an on-cooldown ability that fans out bolts to shatter glass ahead.
- **A finite race** — reach the finish across several levels (or flip on infinite levels in the dev panel).

## Play

```bash
npm install
npm run dev        # http://localhost:5173
```

For a production build:

```bash
npm run build
npm run preview    # http://localhost:4173
```

## Project structure

```
src/
├── main.ts              # entry point
├── core/Game.ts         # game loop & orchestration
├── config/              # constants, dev-panel runtime tunables, chapter palettes
├── rendering/           # Three.js scene, materials, post-processing
├── world/               # procedural segments, chapter math, gates, path & patterns/
├── gameplay/            # avatar, missiles, rings, fragments, scoring, palette blending
├── input/               # keyboard & touch steering
├── audio/               # music, SFX, mute state
├── ui/                  # HUD (cl-hud), dev panel, tutorial, buttons, overlays
├── utils/               # small shared helpers
├── assets/              # models, audio, fonts, images
└── styles/main.css      # HUD & overlay styles
```

Obstacle patterns live in `src/world/patterns/` — `static.ts` (panes/grids/walls),
`dynamic.ts` (pendulums, windmills, doors, falling/sliding/laser hazards), and
`architecture.ts` (slabs, crane claws, tower/switch gates, beam elevators). The
weighted registry + `pickPattern()` is in `patterns/index.ts`.

## Controls

| Action           | Input                                   |
| ---------------- | --------------------------------------- |
| Steer            | `WASD` / arrow keys, or drag on touch   |
| Scatter missiles | `Space` (double-tap on touch)           |
| Pause / resume   | `P` or `Esc`                            |
| Toggle dev panel | `F9`                                    |

## Dev panel (F9)

Press **F9** for a live tuning panel. It reads/writes a mutable settings object
(`src/config/runtime.ts`) that the engine consumes each frame, so changes apply instantly:

- **Speed** — base speed, acceleration (per metre) and the speed-bonus cap.
- **Turns & slopes** — turn/slope sharpness, stretch length, straight-chance, and bank-into-turns amount.
- **Layout** — wave spacing (rooms between obstacle waves), world scale, and **current zone** (force a chapter, or `AUTO` by distance).
- **Player** — steer reach/speed, hit-box size, and the scouted "path ahead blocked" guide.
- **Levels** — level length, infinite-levels toggle, gate/crystal boost durations.
- **Barrel roll** — roll the world manually, or trigger a full 360°.

> Speed/zone/roll apply immediately; turn/slope/wave changes apply to rooms generated ahead.

## Scoring

- Shatter glass (with a missile or by ploughing through while boost-armoured) → points × your **combo** multiplier.
- Chain breaks within ~2s to build the combo.
- Fly through **boost rings** (+points, speed surge) and **crystal rings** (big points + a level-long overdrive).
- **Crash** (an unbroken hazard reaches you) → red flash, screen shake, combo resets, −75, and your speed craters.

The HUD (built in `src/ui/cl-hud.ts`) shows score, a run timer, the current level + biome,
a SCATTER-ready prompt, and a thrust/speed bar.

## Obstacles & gotchas

Rooms are procedurally generated and ramp up in difficulty with distance: glass panes, gapped
rows, grids, reinforced glass, pyramids, layered/tilted panes, narrow slits, hanging spikes,
suspended beams, spinning panels, staggered columns, pendulums (and fields), windmills, DNA
helices, circle portals, beam curtains, sliding doors, vertical gates, falling blocks, closing/
pushing walls, pop-up blockers, laser beams, overhead slab lanes, crane claws, tower gates,
beam elevators, and switch gates.

Gotchas:

- **🔩 Steel plates** — unbreakable; a missile clangs off and breaks your combo.
- **🕳️ Decoy holes** — look solid but the middle is empty; a wasted shot.

## Levels / chapters

Each colour world is a "level" with its own architecture style and a per-pattern weight table
biasing which obstacles appear — both defined in `src/config/chapters.ts`. Chapter math lives in
`src/world/chapter.ts` (`chapterAt` / `effectiveChapter`), scaled by `DISTANCE_SCALE` so a room's
colour matches the sky by the time you reach it. Level boundaries spawn a crystal wormhole gate.

## Path: turns & slopes

The level isn't a dead-straight rail. `src/world/path.ts` defines the centreline as a smooth,
lazily-generated function of world `z` — left/right turns and elevation — with occasional stretches
that turn, climb, dip, or run straight. Crucially **`z` stays the exact progress axis** (curves only
displace x/y), so all z-based spawn/cull/crash logic is untouched; the camera and each room are
posed onto the centreline, and the camera banks into turns.

## Verify it works

A headless smoke test builds the app, boots it via `vite preview` in real Chrome, plays for ~12s,
and asserts the world advances, the HUD renders, post-processing/reflections load, and nothing throws:

```bash
npm install      # pulls puppeteer-core (uses your installed Chrome, no download)
npm test
```

## Tuning

Gameplay and visual constants live in `src/config/constants.ts`, `src/config/runtime.ts` (dev-panel
defaults), and `src/config/chapters.ts`:

- Gameplay: `GRAVITY`, `SEG_LEN`, `COMBO_WINDOW`, plus speed/level tunables in `runtime.ts`.
- World: `PATH_HALF`, `PILLAR_X`, `CHAPTER_DIST`, `CHAPTERS[]` palette table.
- Turns/slopes: `CURVES_ENABLED` (set `false` for a straight rail), `TURN_MAX`, `ELEV_MAX`, `CURVE_STRETCH_MIN/MAX`, `STRAIGHT_CHANCE`, `BANK_FACTOR`, `PATH_LOOK_AHEAD`.
- Look: bloom pass settings in `src/rendering/setup-renderer.ts`, tone mapping exposure on the renderer.
