import {
  CHAPTERS,
  GAMESCOM_ALL_CHAPTERS,
  GAMESCOM_CANYON,
  type Chapter,
} from "./chapters";
import { dev, gamescom } from "./runtime";

export const GAMESCOM_PLAY_LEVEL_COUNT = 5;

const wrap = (v: number, n: number) => ((v % n) + n) % n;

/** The active, ordered list of GamesCom Google-level source indices (dev-panel driven). */
export function activeGamescomLevels(): number[] {
  const list = dev.gamescomLevelOrder.filter(
    (i) => dev.gamescomLevelActive[i] !== false,
  );
  return list.length ? list : dev.gamescomLevelOrder.slice();
}

/** The active, ordered list of general (CHAPTERS) source indices (dev-panel driven). */
export function activeGeneralLevels(): number[] {
  const list = dev.generalLevelOrder.filter(
    (i) => dev.generalLevelActive[i] !== false,
  );
  return list.length ? list : dev.generalLevelOrder.slice();
}

/** How many levels the current mode visits before the finish (= active-list length). */
export function gamescomLevelCount(): number {
  return activeGamescomLevels().length;
}

/** General (non-GamesCom) chapter for a raw level index, honouring order + active list. */
export function generalChapterFor(rawIdx: number): Chapter {
  const list = activeGeneralLevels();
  return CHAPTERS[list[wrap(rawIdx, list.length)]];
}

export interface GamesComLevelTuning {
  levelIndex: number;
  wallGap: number;
  slopeAddDeg: number;
  obstacleDensity: number;
  baseSpeedBonus: number;
  maxSpeedBonus: number;
  accelerationMul: number;
  boostMulBonus: number;
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

export function isGamesComPlayMode() {
  return gamescom.enabled && gamescom.runMode === "play";
}

export function isGamesComTestFlightMode() {
  return gamescom.enabled && gamescom.runMode === "testFlight";
}

// Progression POSITION within the active Google levels (drives the difficulty ramp).
export function gamesComPlayLevelIndex(chIdx: number) {
  return Math.floor(clamp(chIdx, 0, gamescomLevelCount() - 1));
}

export function gamesComChapterFor(chIdx: number): Chapter {
  const list = activeGamescomLevels();
  if (isGamesComPlayMode()) {
    // finite Play: clamp to the active list and map to the (reordered) level.
    return GAMESCOM_ALL_CHAPTERS[list[gamesComPlayLevelIndex(chIdx)]];
  }
  // Test Flight: GATED infinite cycles the active levels; GATELESS = grey canyon.
  if (dev.infiniteGated) {
    return GAMESCOM_ALL_CHAPTERS[list[wrap(chIdx, list.length)]];
  }
  return GAMESCOM_CANYON;
}

export function gamesComLevelTuning(chIdx: number): GamesComLevelTuning {
  const i = gamesComPlayLevelIndex(chIdx);
  if (!isGamesComPlayMode()) {
    return {
      levelIndex: 0,
      wallGap: gamescom.canyonWallGap,
      slopeAddDeg: 0,
      obstacleDensity: 1,
      baseSpeedBonus: 0,
      maxSpeedBonus: 0,
      accelerationMul: 1,
      boostMulBonus: 0,
    };
  }

  return {
    levelIndex: i,
    wallGap: clamp(
      gamescom.canyonWallGap - i * 3.0 * gamescom.playWallGapDifficultyMul,
      6,
      22,
    ),
    slopeAddDeg: i * 8.5 * gamescom.playSlopeDifficultyMul,
    obstacleDensity: clamp(
      0.45 + i * 0.35 * gamescom.playObstacleDifficultyMul,
      0.05,
      10,
    ),
    baseSpeedBonus: i * 2.5 * gamescom.playBaseSpeedDifficultyMul,
    maxSpeedBonus: i * 4.0 * gamescom.playBaseSpeedDifficultyMul,
    accelerationMul: clamp(
      1 + i * 0.25 * gamescom.playAccelerationDifficultyMul,
      0,
      10,
    ),
    boostMulBonus: i * 0.08 * gamescom.playSpeedBoostDifficultyMul,
  };
}
