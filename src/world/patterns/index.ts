import { CHAPTERS } from "../../config/chapters";
import {
  gamesComChapterFor,
  gamesComLevelTuning,
  isGamesComPlayMode,
} from "../../config/gamescom-levels";
import { dev, gamescom } from "../../config/runtime";
import type { PatternFn } from "../../types";

import * as staticPatterns from "./static";
import * as dynamicPatterns from "./dynamic";
import * as architecturePatterns from "./architecture";
import * as cubePatterns from "./cubes";

/** Named pattern registry — chapters bias these by name. */
const PATTERNS: Record<string, PatternFn> = {
  ...staticPatterns,
  ...dynamicPatterns,
  ...architecturePatterns,
  ...cubePatterns,
};

export const PATTERN_NAMES = Object.keys(PATTERNS).sort();

/** Pattern names that make up the GamesCom obstacle set (on by default in GamesCom). */
export const GAMESCOM_PATTERNS = new Set(["cubeField", "overheadBlocks"]);

/** GamesCom obstacle allowlist: every existing type OFF, only the GamesCom set ON. */
export function applyGamesComObstacleDefaults() {
  for (const name of PATTERN_NAMES) {
    dev.obstacleEnabled[name] = GAMESCOM_PATTERNS.has(name);
  }
}

const emptyPattern: PatternFn = () => {};

function baseWeights(diff: number): Record<string, number> {
  return {
    singlePane: 10,
    paneRowWithGap: 9,
    glassGrid: 5,
    reinforcedWall: 6,
    crystalBonus: 0, // pickup crystals removed
    multiballOrb: 0, // pickup crystals removed
    steelGotcha: 5 + diff * 4,
    decoyHole: 3 + diff * 5,
    pendulum: 4 + diff * 5,
    pendulumField: diff * 7,
    windmill: 3 + diff * 3,
    doubleWindmill: 2 + diff * 5,
    dnaHelix: 3 + diff * 6,
    circlePortal: 3 + diff * 5,
    beamCurtain: 3 + diff * 4,
    slidingDoors: 4 + diff * 5,
    verticalGate: 3 + diff * 4,
    fallingBlocks: 3 + diff * 5,
    closingWall: diff * 6,
    layeredPanes: 3 + diff * 5,
    tiltedPanes: 4 + diff * 4,
    narrowSlit: 2 + diff * 5,
    glassPyramid: 4,
    hangingSpikes: 2 + diff * 5,
    suspendedBeam: 3 + diff * 4,
    spinningPanel: 2 + diff * 5,
    staggeredColumns: 2 + diff * 4,
    longitudinalPane: 3 + diff * 4,
    floorCrystalsPattern: 0, // pickup crystals removed
    slidingBlocks: 3 + diff * 5,
    popupBlockers: 2 + diff * 6,
    laserBeams: diff * 7,
    pushingWalls: diff * 5,
    overheadSlabLanes: 3 + diff * 6,
    craneClaws: 2 + diff * 5,
    towerGate: 2 + diff * 5,
    beamElevators: 2 + diff * 5,
    switchGate: 1 + diff * 3,
    cubeField: 0, // 0 in normal biomes; forced ON + weighted under GamesCom (below)
    overheadBlocks: 0, // ditto — high-hanging threat for top-of-screen players
  };
}

export function pickPattern(diff: number, chIdx: number): PatternFn {
  const ch = gamescom.enabled ? gamesComChapterFor(chIdx) : CHAPTERS[chIdx % CHAPTERS.length];
  const base = baseWeights(diff);
  const mult = ch.weights ?? {};
  const entries: [string, number][] = [];
  let total = 0;
  const gamescomWeightMul = isGamesComPlayMode()
    ? gamesComLevelTuning(chIdx).obstacleDensity
    : 1;
  for (const name in base) {
    if (dev.obstacleEnabled[name] === false) continue;
    // GamesCom forces its obstacle set on with a fixed weight (their base weight is 0).
    const w =
      gamescom.enabled && GAMESCOM_PATTERNS.has(name)
        ? 12 * gamescomWeightMul
        : base[name] * (mult[name] ?? 1);
    if (w > 0) {
      entries.push([name, w]);
      total += w;
    }
  }
  if (total <= 0) return emptyPattern;
  let r = Math.random() * total;
  for (const [name, w] of entries) if ((r -= w) <= 0) return PATTERNS[name];
  return dev.obstacleEnabled.singlePane === false ? emptyPattern : staticPatterns.singlePane;
}

// GamesCom defaults to ON at boot (runtime.ts). Seed its curated obstacle allowlist so
// only the curated cube set spawns in the canyon until the dev panel says otherwise.
if (gamescom.enabled) applyGamesComObstacleDefaults();
