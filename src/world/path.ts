import { CURVES_ENABLED } from '../config/constants';
import { dev } from '../config/runtime';
import { rnd } from '../utils/random';

/**
 * The level centreline as a smooth function of world z (forward = -z, so z decreases
 * as you travel). Curves only displace x (left/right) and y (elevation) — z stays the
 * exact progress axis, so all the z-based spawn/cull/crash/ball logic keeps working.
 *
 * The path is generated lazily and monotonically forward: any query extends it as far
 * as needed, choosing occasional gentle turns and slopes of varying steepness.
 */
export interface LaneOffset {
  x: number;
  y: number;
}

const STEP = 3; // sample spacing in z-units
const samples: LaneOffset[] = [{ x: 0, y: 0 }]; // index i ↔ z = -i*STEP

// integration cursor (most-forward generated sample)
let cz = 0;
let cx = 0;
let cy = 0;
let xSlope = 0; // current dX/dz
let ySlope = 0; // current dY/dz
let xTarget = 0;
let yTarget = 0;
let stretchEndZ = 0;

const clamp1 = (v: number) => Math.max(-1, Math.min(1, v));

function chooseStretch() {
  stretchEndZ = cz - rnd(dev.stretchMin, dev.stretchMax); // forward = decreasing z
  if (Math.random() < dev.straightChance) {
    xTarget = 0;
    yTarget = 0;
  } else {
    // random turn/slope, gently mean-reverted so the lane never wanders off forever
    const tx = (Math.random() < 0.7 ? rnd(-1, 1) : 0) * 0.6 - (cx / 45) * 0.4;
    const ty = (Math.random() < 0.6 ? rnd(-1, 1) : 0) * 0.6 - (cy / 30) * 0.4;
    xTarget = clamp1(tx) * dev.turnMax;
    yTarget = clamp1(ty) * dev.elevMax;
  }
}

function extendTo(z: number) {
  while (cz > z) {
    if (cz <= stretchEndZ) chooseStretch();
    // ease slopes toward their targets so curves are smooth, never kinked
    xSlope += (xTarget - xSlope) * 0.12;
    ySlope += (yTarget - ySlope) * 0.12;
    cz -= STEP;
    cx += -xSlope * STEP; // moving forward Δz=-STEP → Δx = slope·Δz
    cy += -ySlope * STEP;
    samples.push({ x: cx, y: cy });
  }
}

/** Lateral/vertical offset of the lane centre at world z. */
export function laneAt(z: number): LaneOffset {
  if (!CURVES_ENABLED) return { x: 0, y: 0 };
  extendTo(z - STEP);
  const f = Math.max(0, -z / STEP);
  const i = Math.floor(f);
  const t = f - i;
  const a = samples[i] ?? samples[samples.length - 1];
  const b = samples[i + 1] ?? a;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Slope (dX/dz, dY/dz) of the lane at world z — used to orient rooms & the camera. */
export function slopeAt(z: number): LaneOffset {
  if (!CURVES_ENABLED) return { x: 0, y: 0 };
  const a = laneAt(z + STEP);
  const b = laneAt(z - STEP);
  return { x: (a.x - b.x) / (2 * STEP), y: (a.y - b.y) / (2 * STEP) };
}

/** Reset the path (for a fresh run). */
export function resetPath() {
  samples.length = 0;
  samples.push({ x: 0, y: 0 });
  cz = cx = cy = xSlope = ySlope = xTarget = yTarget = stretchEndZ = 0;
}
