import * as THREE from 'three';
import { EYE_Y } from '../config/constants';
import { laneAt } from '../world/path';
import type { Obstacle } from '../types';

/**
 * "Ride line": scouts the corridor ahead and computes the BEST collision-free path
 * the player can fly. It runs a real reachability search over a 2D grid (lateral ×
 * vertical) across depth-slices: a cell is reachable if it's clear AND a reachable
 * cell on the previous slice is within the player's steer reach for that slice.
 * This guarantees the line finds a way *around* obstacles whenever a route exists
 * within the movement bounds + reach — and only reports BLOCKED when none does.
 */
const STEP = 4; // world units between slices
const MAX_SLICES = 48; // cap (scan distance / STEP is clamped to this)
const MAXP = MAX_SLICES + 1;
const NX = 31; // lateral grid resolution
const NY = 15; // vertical grid resolution
const NXY = NX * NY;
const JC = (NX - 1) / 2; // centre column
const KC = (NY - 1) / 2; // centre row

const sizeCache = new WeakMap<THREE.Object3D, { hx: number; hy: number; hz: number }>();
const _box = new THREE.Box3();
const _sz = new THREE.Vector3();
const _wp = new THREE.Vector3();

interface Blocker {
  x: number;
  y: number;
  z: number;
  hx: number;
  hy: number;
  hz: number;
}

export interface Scout {
  line: THREE.Line;
  pos: Float32Array;
}

// Working buffers (reused each frame to avoid allocation).
const reachAll = new Uint8Array(MAXP * NXY); // reachability per (slice, cell)
const freeGrid = new Uint8Array(NXY); // clear/blocked for the current slice
const II = new Int32Array((NY + 1) * (NX + 1)); // integral image of the previous slice's reach
const laneXArr = new Float32Array(MAXP);
const laneYArr = new Float32Array(MAXP);
const mxBins = new Int16Array(MAXP);
const myBins = new Int16Array(MAXP);
const here: Blocker[] = [];

export function createScout(scene: THREE.Scene): Scout {
  const pos = new Float32Array(MAXP * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.LineBasicMaterial({
    color: 0xff2233,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    depthTest: false, // always drawn on top so the guide reads clearly
    toneMapped: false,
  });
  const line = new THREE.Line(geo, mat);
  line.frustumCulled = false;
  line.renderOrder = 998;
  scene.add(line);
  return { line, pos };
}

function halfExt(mesh: THREE.Object3D) {
  let s = sizeCache.get(mesh);
  if (!s) {
    _box.setFromObject(mesh);
    _box.getSize(_sz);
    s = { hx: _sz.x / 2, hy: _sz.y / 2, hz: _sz.z / 2 };
    sizeCache.set(mesh, s);
  }
  return s;
}

/** Clear/blocked grid for slice `i` (writes freeGrid). */
function computeFree(i: number, bx: number, lo: number, binW: number, binH: number) {
  const lx = laneXArr[i];
  const ly = laneYArr[i];
  for (let k = 0; k < NY; k++) {
    const wy = ly + lo + k * binH;
    const row = k * NX;
    for (let j = 0; j < NX; j++) {
      const wx = lx - bx + j * binW;
      let f = 1;
      for (let m = 0; m < here.length; m++) {
        const b = here[m];
        if (Math.abs(wx - b.x) < b.hx && Math.abs(wy - b.y) < b.hy) {
          f = 0;
          break;
        }
      }
      freeGrid[row + j] = f;
    }
  }
}

/** Integral image of the previous slice's reach grid (so box queries are O(1)). */
function buildII(sliceBase: number) {
  const W = NX + 1;
  for (let k = 0; k < NY; k++) {
    const r = k * NX;
    const ir = (k + 1) * W;
    const irPrev = k * W;
    for (let j = 0; j < NX; j++) {
      II[ir + j + 1] =
        reachAll[sliceBase + r + j] + II[ir + j] + II[irPrev + j + 1] - II[irPrev + j];
    }
  }
}

/** Any reachable previous-slice cell within the reach box of (j,k)? */
function boxAny(j: number, k: number, maxJ: number, maxK: number) {
  const W = NX + 1;
  const loJ = j - maxJ > 0 ? j - maxJ : 0;
  const hiJ = j + maxJ < NX - 1 ? j + maxJ : NX - 1;
  const loK = k - maxK > 0 ? k - maxK : 0;
  const hiK = k + maxK < NY - 1 ? k + maxK : NY - 1;
  const sum =
    II[(hiK + 1) * W + (hiJ + 1)] -
    II[loK * W + (hiJ + 1)] -
    II[(hiK + 1) * W + loJ] +
    II[loK * W + loJ];
  return sum > 0;
}

/**
 * Recompute + draw the ride line. Returns true when the path ahead is BLOCKED.
 * latSpeed/vertSpeed are the player's max world steer speeds (units/sec).
 */
export function updateScout(
  scout: Scout,
  obstacles: Obstacle[],
  px: number,
  py: number,
  az: number,
  bx: number, // lateral half-bound (relative to lane centre)
  lo: number, // bottom bound (relative to eye line)
  up: number, // top bound
  hitX: number,
  hitY: number,
  speed: number,
  latSpeed: number,
  vertSpeed: number,
  scoutDist: number,
  clearance: number,
  warnDist: number,
  fromPlayer: boolean,
): boolean {
  const slices = Math.max(4, Math.min(MAX_SLICES, Math.round(scoutDist / STEP)));
  const marginX = hitX * clearance;
  const marginY = hitY * clearance;
  const binW = (2 * bx) / (NX - 1);
  const binH = Math.max(0.05, (up - lo) / (NY - 1));

  // Gather hazard AABBs (inflated by the clearance margin) within the scan window.
  const minZ = az - slices * STEP - 6;
  const blockers: Blocker[] = [];
  for (const o of obstacles) {
    if (o.broken || !o.blocksCenter) continue;
    o.mesh.getWorldPosition(_wp);
    if (_wp.z > az + 1 || _wp.z < minZ) continue;
    const s = halfExt(o.mesh);
    if (s.hx < 0.05) continue;
    blockers.push({ x: _wp.x, y: _wp.y, z: _wp.z, hx: s.hx + marginX, hy: s.hy + marginY, hz: s.hz });
  }

  // Per-slice lane centre + reach (in grid bins).
  for (let i = 0; i <= slices; i++) {
    const lane = laneAt(az - i * STEP);
    laneXArr[i] = lane.x;
    laneYArr[i] = EYE_Y + lane.y;
    const dtSlice = STEP / Math.max(2, speed);
    mxBins[i] = Math.max(0, Math.min(NX - 1, Math.floor((latSpeed * dtSlice) / binW)));
    myBins[i] = Math.max(0, Math.min(NY - 1, Math.floor((vertSpeed * dtSlice) / binH)));
  }

  const sliceBlockers = (i: number) => {
    const zi = az - i * STEP;
    here.length = 0;
    for (const b of blockers) {
      if (Math.abs(b.z - zi) <= b.hz + STEP * 0.6) here.push(b);
    }
  };

  // --- Seed the origin (slice 0) ---
  sliceBlockers(0);
  computeFree(0, bx, lo, binW, binH);
  for (let c = 0; c < NXY; c++) reachAll[c] = 0;
  let originCell: number;
  if (fromPlayer) {
    const j0 = Math.max(0, Math.min(NX - 1, Math.round((px - laneXArr[0] + bx) / binW)));
    const k0 = Math.max(0, Math.min(NY - 1, Math.round((py - laneYArr[0] - lo) / binH)));
    originCell = k0 * NX + j0;
  } else {
    // Detached: nearest clear cell to the corridor centre.
    originCell = Math.round(KC) * NX + Math.round(JC);
    let bestD = Infinity;
    for (let k = 0; k < NY; k++) {
      for (let j = 0; j < NX; j++) {
        if (!freeGrid[k * NX + j]) continue;
        const d = (j - JC) * (j - JC) + (k - KC) * (k - KC);
        if (d < bestD) {
          bestD = d;
          originCell = k * NX + j;
        }
      }
    }
  }
  reachAll[originCell] = 1;

  // --- Forward reachability sweep ---
  let F = 0;
  for (let i = 1; i <= slices; i++) {
    sliceBlockers(i);
    computeFree(i, bx, lo, binW, binH);
    buildII((i - 1) * NXY);
    const base = i * NXY;
    const maxJ = mxBins[i];
    const maxK = myBins[i];
    let any = false;
    for (let k = 0; k < NY; k++) {
      const row = k * NX;
      for (let j = 0; j < NX; j++) {
        const c = row + j;
        if (freeGrid[c] && boxAny(j, k, maxJ, maxK)) {
          reachAll[base + c] = 1;
          any = true;
        } else {
          reachAll[base + c] = 0;
        }
      }
    }
    if (!any) break;
    F = i;
  }

  // --- Pick the goal at the farthest reached slice (nearest the corridor centre) ---
  const goalBase = F * NXY;
  let goalCell = originCell;
  let bestG = Infinity;
  for (let k = 0; k < NY; k++) {
    for (let j = 0; j < NX; j++) {
      if (!reachAll[goalBase + k * NX + j]) continue;
      const d = Math.abs(j - JC) + Math.abs(k - KC);
      if (d < bestG) {
        bestG = d;
        goalCell = k * NX + j;
      }
    }
  }

  // --- Trace the path back to the origin ---
  const pos = scout.pos;
  let cell = goalCell;
  const writePoint = (slot: number, i: number, c: number) => {
    const j = c % NX;
    const k = (c / NX) | 0;
    pos[slot * 3] = laneXArr[i] - bx + j * binW;
    pos[slot * 3 + 1] = laneYArr[i] + lo + k * binH;
    pos[slot * 3 + 2] = az - i * STEP;
  };
  for (let i = F; i >= 1; i--) {
    writePoint(i, i, cell);
    // nearest reachable predecessor within the reach box (straightest)
    const j = cell % NX;
    const k = (cell / NX) | 0;
    const maxJ = mxBins[i];
    const maxK = myBins[i];
    const base = (i - 1) * NXY;
    let best = cell;
    let bestD = Infinity;
    const loK = Math.max(0, k - maxK);
    const hiK = Math.min(NY - 1, k + maxK);
    const loJ = Math.max(0, j - maxJ);
    const hiJ = Math.min(NX - 1, j + maxJ);
    for (let kk = loK; kk <= hiK; kk++) {
      for (let jj = loJ; jj <= hiJ; jj++) {
        if (!reachAll[base + kk * NX + jj]) continue;
        const d = (jj - j) * (jj - j) + (kk - k) * (kk - k);
        if (d < bestD) {
          bestD = d;
          best = kk * NX + jj;
        }
      }
    }
    cell = best;
  }
  // origin point — pin to the craft when anchored, else the chosen origin cell
  if (fromPlayer) {
    pos[0] = px;
    pos[1] = py;
    pos[2] = az;
  } else {
    writePoint(0, 0, originCell);
  }

  const count = F + 1;
  scout.line.geometry.setDrawRange(0, count);
  scout.line.geometry.attributes.position.needsUpdate = true;

  // Blocked only when the path can't reach the end and the wall is within warn range.
  if (F >= slices) return false;
  const blockDist = (F + 1) * STEP;
  return blockDist <= warnDist;
}
