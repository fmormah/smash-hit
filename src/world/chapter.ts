import { DISTANCE_SCALE, SEG_LEN } from "../config/constants";
import { dev } from "../config/runtime";

/**
 * Which colour chapter a segment belongs to. Scaled by DISTANCE_SCALE so the
 * segment's chapter (by world position) matches the sky's chapter (by HUD distance)
 * by the time the camera arrives.
 */
export function chapterAt(segIndex: number) {
  return Math.floor((segIndex * SEG_LEN * DISTANCE_SCALE) / dev.levelLength);
}

/** Chapter for a segment, honouring the dev-panel zone override (-1 = auto by distance). */
export function effectiveChapter(segIndex: number) {
  return dev.zoneOverride >= 0 ? dev.zoneOverride : chapterAt(segIndex);
}
