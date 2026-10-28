/** Gameplay & world tunables */
export const PATH_HALF = 3.6;
export const OBS_TOP = 6.2;
export const PILLAR_X = 5.6;
export const EYE_Y = 2.15;
export const SEG_LEN = 22;
export const SPAWN_AHEAD = 240;
export const CULL_BEHIND = 44;
export const GRAVITY = 24;
export const MAX_FRAGMENTS = 1100;
export const FOG_NEAR = 16;
export const FOG_FAR = 150;
export const CHAPTER_DIST = 230;
export const COMBO_WINDOW = 2.2;
/** HUD "distance" advances at this fraction of world travel. Shared so the
 *  segment-chapter (by world position) and the sky-chapter (by distance) stay in sync. */
export const DISTANCE_SCALE = 0.6;

// ---- Path curvature: occasional gentle banking turns + slopes (à la Smash Hit) ----
/** Master switch — set false to fly the original dead-straight rail. */
export const CURVES_ENABLED = true;
/** How far ahead (in z-units) the camera aims; sets how turns/slopes read. */
export const PATH_LOOK_AHEAD = 14;
/** Max lateral slope |dX/dz| of a turn (~0.24 ≈ 13°). */
export const TURN_MAX = 0.24;
/** Max vertical slope |dY/dz| of an elevation change. */
export const ELEV_MAX = 0.19;
/** Each turn/slope/straight stretch lasts this many z-units. */
export const CURVE_STRETCH_MIN = 36;
export const CURVE_STRETCH_MAX = 90;
/** Chance a given stretch is dead straight (the "occasional" in occasional turns). */
export const STRAIGHT_CHANCE = 0.3;
/** Camera roll (radians) per unit lateral slope — banks into turns for flavour. */
export const BANK_FACTOR = 0.9;
