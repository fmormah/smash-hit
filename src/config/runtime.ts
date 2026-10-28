import {
  CHAPTERS,
  GAMESCOM_ALL_CHAPTERS,
  GAMESCOM_PLAY_CHAPTERS,
} from "./chapters";

/**
 * Live, mutable tunables driven by the F9 dev panel. Systems read from here instead of
 * the compile-time constants so values can be adjusted at runtime. Defaults are the
 * values dialed in during playtest (baked from the dev panel).
 */
export interface DevSettings {
  baseSpeed: number; // units/sec at distance 0
  accel: number; // extra speed gained per metre travelled
  maxBonus: number; // cap on the speed gained from distance
  turnMax: number; // max lateral slope |dX/dz| (left/right sharpness)
  elevMax: number; // max vertical slope |dY/dz| (up/down sharpness)
  stretchMin: number; // a turn/slope/straight stretch length (z-units)
  stretchMax: number;
  straightChance: number; // 0..1 chance a stretch is dead straight
  bank: number; // camera roll per unit lateral slope
  bankSmooth: number; // speed of camera bank smoothing (slow/smooth turns)
  lookAhead: number; // how far ahead the camera aims
  waveSpacing: number; // segments between obstacle waves (1 = every room)
  zoneOverride: number; // -1 = auto by distance, else forced chapter index
  splashZoneOverride: number; // chapter index to run through during the splash screen, defaulting to 0 (Azure)
  splashZoneCycle: boolean; // true = cycle through zones during splash screen
  splashZoneCycleInterval: number; // seconds to stay in each zone during splash screen cycle
  manualRoll: number; // persistent barrel-roll offset (radians)
  steerSpeed: number; // multiplier on avatar steer speed (control sharpness)
  keyboardSteerSensitivity: number; // desktop keyboard response multiplier; 1 = current tuned feel
  mobileJoystickSensitivity: number; // touch joystick response multiplier; 1 = current tuned feel
  speedSteerMul: number; // keyboard steer-speed multiplier blended in as forward speed climbs base→top (1 = no change at top speed)
  mobileSpeedReachMul: number; // touch thumb→lane reach multiplier blended in as forward speed climbs base→top (1 = no change at top speed)
  fragVolume: number; // shard density multiplier on a shatter (more = more shards)
  glassOpacity: number; // opacity of glass/destructible objects
  bloomIntensity: number; // relative master multiplier for post-processing bloom pass
  speedZoom: number; // extra camera zoom added at top speed (− = zoom out)
  waveBySpeed: boolean; // true = wave spacing scales with speed; false = hard waveSpacing
  waveSpeedMin: number; // wave spacing (rooms) at base speed
  waveSpeedMax: number; // wave spacing (rooms) at top speed (more = fewer waves / more reaction time)
  waveSpeedRate: number; // how aggressively speed maps to spacing (0..2)
  worldScale: number; // x/y scale of generated rooms (player model unaffected)
  worldScaleAuto: boolean; // oscillate worldScale between min/max over time
  worldScaleMin: number;
  worldScaleMax: number;
  worldScaleRate: number; // oscillation speed (rad/s of the sine)
  steerMulX: number; // multiplier on the player's lateral reach (× world scale)
  steerMulUp: number; // multiplier on the player's UP reach (top, independent)
  steerMulDown: number; // multiplier on the player's DOWN reach (bottom, independent)
  optokineticReflex: boolean; // true = gyro/chicken-head cam: aim along the local heading so the craft stays pinned in-frame and the world rotates around it (instead of chasing the curved vanishing point)
  pickupMagnetRadius: number; // world-unit radius around the craft within which rings/orbs/crystals are drawn into the player (0 = off; never affects obstacles)
  showPickupField: boolean; // draw the pickup-magnet field sphere around the craft
  showBounds: boolean; // draw the player's movement envelope in the world
  // player collision/hit box half-extents (world units) + a visualiser
  hitX: number;
  hitY: number;
  hitZ: number;
  showHitBox: boolean;
  showRideLine: boolean; // scouted safe-path guide line ahead of the player
  rideFromPlayer: boolean; // true = line starts at the craft; false = detached best-path line ahead
  scoutDist: number; // how far ahead (world units) the ride line scouts + draws
  blockClearance: number; // safe path must fit the model at this × its footprint (↑ = blocks more often)
  blockWarnDist: number; // only flash "PATH AHEAD BLOCKED" when the block is within this distance
  // hero model transform (local to the craft) — live-tunable like the first game
  heroPosX: number;
  heroPosY: number;
  heroPosZ: number;
  heroRotXDeg: number;
  heroRotYDeg: number;
  heroRotZDeg: number;
  // hero CONTAINER transform — affects the model + boosters + side orb together
  heroContRotXDeg: number;
  heroContRotYDeg: number;
  heroContRotZDeg: number;
  heroContScale: number;
  aimNoseToCentre: boolean; // rotate the craft so its nose points at screen centre as you move
  crashFreeze: number; // seconds the world hitstops on a crash (so the shatter reads)
  crashInvuln: number; // seconds of post-crash invulnerability (i-frames): craft ghosts + ploughs through obstacles
  invulnFlashHz: number; // i-frame ghost-flash frequency (flashes per second)
  crashSpeedLoss: number; // max fraction of speed lost on a hard unarmoured crash
  // booster-FX origin (local to the craft); X is the half-spacing between jets
  boosterX: number;
  boosterY: number;
  boosterZ: number;
  // levels / progression
  levelLength: number; // HUD-metres of distance per level (biome)
  infiniteLevels: boolean; // never finish — cycle levels forever
  infiniteGated: boolean; // infinite run: true = GATED cycle through the active levels; false = GATELESS continuous free flight (no gates / no level changes)
  // Mode-dependent level ordering + activation. Order = cycle/progression order (source
  // indices); active = whether that level is playable. Drives ALL progression.
  generalLevelOrder: number[]; // indices into CHAPTERS, in play order
  generalLevelActive: boolean[]; // per CHAPTERS index: included in progression?
  gamescomLevelOrder: number[]; // indices into the 5 GamesCom Google levels, in play order
  gamescomLevelActive: boolean[]; // per Google level: included in progression?
  boostArmour: boolean; // when boosting, player has reinforced armour and can smash through glass without slowing down
  boostArmourRequired: number; // number of consecutive speed boosts needed to get boost armour
  boostArmourWindow: number; // time window in seconds to stack speed boosts
  boostsForWorldRoll: number; // number of consecutive boosts needed to trigger a world barrel roll
  crystalsForComet: number; // consecutive crystal rings to stack before the comet trail + long boost + armour fire
  boostArmourAlwaysOff: boolean; // hard-disable shield/boost armour even if other armour settings are enabled
  boostArmourAlwaysOn: boolean; // always have the shield/boost armour on
  shieldOffsetX: number; // shield position offset X
  shieldOffsetY: number; // shield position offset Y
  shieldOffsetZ: number; // shield position offset Z
  shieldScale: number; // shield uniform scale multiplier
  boostArmourFragMultiplier: number; // obstacle break fragment multiplier with boost armour
  boostArmourFragSpeed: number; // speed/velocity of fragments flying towards the screen when smashed during boost
  missileCount: number; // scatter missiles fired per salvo (default 7)
  missileSpeed: number; // missile forward speed (units/sec)
  missileExplosions: boolean; // enable visual explosion effects on missile impact
  missileConeAngle: number; // half-angle of targeting cone in degrees
  missileConeRange: number; // range of targeting cone in meters
  showMissileCone: boolean; // draw lines representing the targeting cone in the world
  spinOnRing: boolean; // trigger the avatar barrel-roll/yaw stunt on each ring pass
  bgmVolume: number; // background music volume (0..1)
  sfxVolume: number; // master SFX gain (0..1; preserves the relative per-sound mix)
  masterVolume: number; // master volume gain (0..1) that scales both BGM and SFX together
  orbTrailWidth: number; // starting width of the orb's glowing ribbon trail
  orbTrailDecay: number; // exponent for the decay/taper rate of the orb trail width/opacity (higher = faster taper)
  gateBoostDuration: number; // duration of the overdrive speed boost from passing level gates
  shieldTrailType: number; // 0 = Comet (Particles), 1 = Ribbon (3D tapered mesh)
  shieldTrailWidth: number; // starting width of the shield's ribbon trail (when active)
  shieldTrailDecay: number; // exponent for the decay/taper rate of the shield ribbon trail
  // camera (mimics the first game's smoothed parallax follow)
  keepLevel: boolean; // don't roll the camera/world as you fly through turns
  camFollow: number; // VERTICAL follow — how much the camera tracks the player up/down (keeps you in frame)
  camLatFollow: number; // LATERAL follow — 0 = locked to the centreline (square-on); >0 trades square-ness
  camFollowTurn: number; // VERTICAL follow blended in while turning (by turn sharpness); default = camFollow
  camLatFollowTurn: number; // LATERAL follow blended in while turning (by turn sharpness); default = camLatFollow
  camHeight: number; // how far above the craft the chase camera sits (down-tilt / framing)
  camBack: number; // how far behind the craft the chase camera sits
  camShoulder: number; // lateral camera offset (over-the-shoulder framing)
  camLookAhead: number; // how far ahead of the craft the camera aims (smaller = more OTS/close)
  camPitchDeg: number; // camera pitch offset (− = look down more)
  camYawDeg: number; // camera yaw offset
  camZoom: number; // zoom factor (>1 = zoomed in / narrower FOV)
  // sun / key-light source position (relative to the camera heading)
  sunLateral: number; // left/right offset across the heading
  sunHeight: number; // world Y height
  sunDistance: number; // distance ahead of the camera
  sunDynamic: boolean; // subtly offset the sun/key light from player position + bank/climb
  sunDynamicStrength: number; // multiplier for the dynamic sun/key-light offset
  // floor glow = the head point-light pool (camera-relative)
  floorLightEnabled: boolean; // legacy camera/head floor light gate
  floorGlowX: number; // lateral
  floorGlowY: number; // height above the floor
  floorGlowZ: number; // forward(−)/back(+) of the camera
  floorGlowReach: number; // light falloff distance (pool size)
  floorReflect: number; // canyon floor reflection strength (the bright sky-glint on the floor)
  floorGlowIntensity: number; // brightness of the head point-light pool on the floor (0 = off)
  obstacleEnabled: Record<string, boolean>; // pattern-name allowlist; missing keys default to enabled
  // outline highlight around DESTROYABLE obstacles that sit on the path AND are in
  // highlight/missile range — helps the player read what they can shoot.
  // thickness 0 = off.
  highlightColor: number;
  highlightThickness: number;
  highlightSameAsMissileRange: boolean;
  highlightRange: number;
  obstacleColor: number; // base colour for the cube/cylinder obstacle set (kept independent of the level palette)
  speedDynamicColors: boolean; // true = speed streaks + side orb use the power colour; false = force white
}

/** Baked playtest defaults (also the target of "Reset defaults"). */
export const DEFAULT_DEV: DevSettings = {
  baseSpeed: 40,
  accel: 0.004,
  maxBonus: 70,
  turnMax: 0.39,
  elevMax: 0.23,
  stretchMin: 91,
  stretchMax: 169,
  straightChance: 0.75,
  bank: 1.0,
  bankSmooth: 3.5,
  lookAhead: 14,
  waveSpacing: 6,
  zoneOverride: -1,
  splashZoneOverride: 1,
  splashZoneCycle: true,
  splashZoneCycleInterval: 5,
  manualRoll: 0,
  steerSpeed: 2.5,
  keyboardSteerSensitivity: 1,
  mobileJoystickSensitivity: 1,
  speedSteerMul: 1, // 1 = steer speed unaffected by forward speed (current feel)
  mobileSpeedReachMul: 1, // 1 = touch reach unaffected by forward speed (current feel)
  fragVolume: 2.7,
  glassOpacity: 0.9,
  bloomIntensity: 0.5, // toned down from 1.0 to curb blow-out / readability (dev-panel adjustable 0–3×)
  speedZoom: -0.6,
  waveBySpeed: true,
  waveSpeedMin: 5,
  waveSpeedMax: 11,
  waveSpeedRate: 1.55,
  worldScale: 2.028667199291175,
  worldScaleAuto: true,
  worldScaleMin: 2,
  worldScaleMax: 4,
  worldScaleRate: 0.3,
  steerMulX: 1.2,
  steerMulUp: 14,
  steerMulDown: 6.8,
  optokineticReflex: false,
  pickupMagnetRadius: 0, // 0 = magnet off (player must fly through pickups as before)
  showPickupField: false,
  showBounds: false,
  hitX: 0.2,
  hitY: 0.35,
  hitZ: 2.7,
  showHitBox: false,
  showRideLine: false,
  rideFromPlayer: true,
  scoutDist: 112,
  blockClearance: 2.5,
  blockWarnDist: 80,
  heroPosX: 0,
  heroPosY: -0.35, // shifted closer to 0 (vertical screen center) from -0.95
  heroPosZ: 0,
  heroRotXDeg: 0,
  heroRotYDeg: 0,
  heroRotZDeg: 0,
  heroContRotXDeg: 0,
  heroContRotYDeg: 0,
  heroContRotZDeg: 0,
  heroContScale: 0.88,
  aimNoseToCentre: true,
  crashFreeze: 0.65,
  crashInvuln: 3.0,
  invulnFlashHz: 10,
  crashSpeedLoss: 0.65,
  boosterX: 0.5,
  boosterY: -1.86,
  boosterZ: 0.62,
  levelLength: 800,
  infiniteLevels: true,
  infiniteGated: false, // gateless by default (matches the current continuous free flight)
  generalLevelOrder: CHAPTERS.map((_, i) => i),
  generalLevelActive: CHAPTERS.map(() => true),
  gamescomLevelOrder: GAMESCOM_ALL_CHAPTERS.map((_, i) => i),
  // Google levels active by default; the older/general biomes are listed but OFF
  // (tick them on to fold them into the GamesCom progression / cycle).
  gamescomLevelActive: GAMESCOM_ALL_CHAPTERS.map(
    (_, i) => i < GAMESCOM_PLAY_CHAPTERS.length,
  ),
  boostArmour: true,
  boostArmourRequired: 1,
  boostArmourWindow: 4.5,
  boostsForWorldRoll: 6, // default to 6 boosts in a row
  crystalsForComet: 2, // stack 2 crystal rings to trigger the comet effect
  boostArmourAlwaysOff: false,
  boostArmourAlwaysOn: false,
  shieldOffsetX: 0,
  shieldOffsetY: -1,
  shieldOffsetZ: 0,
  shieldScale: 1,
  boostArmourFragMultiplier: 1.75,
  boostArmourFragSpeed: 26.0,
  missileCount: 50, // default missile salvo to 50
  missileSpeed: 142.5, // 95 * 1.5 = 142.5
  missileExplosions: true,
  missileConeAngle: 21.0,
  missileConeRange: 140.0,
  showMissileCone: false,
  spinOnRing: false, // barrel-roll/spin on ring pass disabled by default
  bgmVolume: 0.45,
  sfxVolume: 0.2,
  masterVolume: 1.0, // master volume scale multiplier (defaults to 1.0x / 100%)
  orbTrailWidth: 0.25,
  orbTrailDecay: 8,
  gateBoostDuration: 6.5,
  shieldTrailType: 1,
  shieldTrailWidth: 1.6,
  shieldTrailDecay: 3,
  keepLevel: false,
  camFollow: 0.6,
  camLatFollow: 0,
  camFollowTurn: 0.6, // = camFollow until tuned
  camLatFollowTurn: 0, // = camLatFollow until tuned
  camHeight: 0.5,
  camBack: 14.5,
  camShoulder: 0,
  camLookAhead: 120,
  camPitchDeg: 0,
  camYawDeg: 0,
  camZoom: 2,
  sunLateral: 0,
  sunHeight: 1.2,
  sunDistance: 150,
  sunDynamic: false,
  sunDynamicStrength: 0.35,
  floorLightEnabled: false,
  floorGlowX: 0,
  floorGlowY: 3,
  floorGlowZ: 5,
  floorGlowReach: 80,
  floorReflect: 0.3,
  floorGlowIntensity: 1,
  obstacleEnabled: {},
  highlightColor: 0x6cf0ff,
  highlightThickness: 0, // off by default; GamesCom forces it on (see getGamesComRules)
  highlightSameAsMissileRange: true,
  highlightRange: 140,
  obstacleColor: 0x6b6f73,
  speedDynamicColors: false,
};

export const dev: DevSettings = {
  ...DEFAULT_DEV,
  obstacleEnabled: { ...DEFAULT_DEV.obstacleEnabled },
};

/** Restore every tunable to its baked default (used by the dev panel). */
export function resetDev() {
  Object.assign(dev, DEFAULT_DEV, {
    obstacleEnabled: { ...DEFAULT_DEV.obstacleEnabled },
  });
  if (gamescom.enabled) {
    const snap: Record<string, unknown> = {};
    for (const k of GAMESCOM_RULE_KEYS) snap[k] = dev[k];
    gamescomSnapshot = snap as Partial<DevSettings>;
    applyGamesComRules();
  }
}

// ===========================================================================
// GAMESCOM MODE — a curated rule set + level for the Gamescom exhibition build.
// This is the EVOLVING design framework: while enabled it (a) forces the GAMESCOM
// CANYON level for every segment (see segments.ts), and (b) forces the rule
// overrides below over the top of `dev`. Toggling OFF restores the prior values.
// Add / remove / retune forced rules in GAMESCOM_RULES as we tune for the show.
// ===========================================================================
export interface GamesComConfig {
  enabled: boolean;
  runMode: "play" | "testFlight";
  canyonWallGap: number;
  canyonWallHeight: number;
  canyonMirrorSlopes: boolean;
  canyonSlopeDeg: number;
  canyonLeftSlopeDeg: number;
  canyonRightSlopeDeg: number;
  canyonMirrorCurves: boolean;
  canyonCurveFlattenTop: boolean;
  canyonCurve: number;
  canyonLeftCurve: number;
  canyonRightCurve: number;
  canyonDrawDistanceScale: number;
  canyonGridLines: boolean;
  canyonGridOpacity: number;
  canyonFloorColor: number; // GamesCom canyon floor tint (palette-driven)
  canyonWallColor: number; // canyon wall tint — decoupled from the sky gradient
  canyonSkyMid: number; // middle stop of the 3-colour sky gradient (top → mid → horizon)
  playerReflectionOpacity: number; // planar GamesCom floor reflection strength
  bloomIntensity: number;
  heroContScale: number;
  boosterY: number;
  ringOrbScale: number;
  steerMulX: number;
  steerMulUp: number;
  steerMulDown: number;
  playWallGapDifficultyMul: number;
  playSlopeDifficultyMul: number;
  playObstacleDifficultyMul: number;
  playBaseSpeedDifficultyMul: number;
  playAccelerationDifficultyMul: number;
  playSpeedBoostDifficultyMul: number;
}
export const gamescom: GamesComConfig = {
  enabled: false,
  runMode: "testFlight",
  canyonWallGap: 22,
  canyonWallHeight: 12,
  canyonMirrorSlopes: true,
  canyonSlopeDeg: 43,
  canyonLeftSlopeDeg: 43,
  canyonRightSlopeDeg: 43,
  canyonMirrorCurves: true,
  canyonCurveFlattenTop: true,
  canyonCurve: 0,
  canyonLeftCurve: 0,
  canyonRightCurve: 0,
  canyonDrawDistanceScale: 1.5,
  canyonGridLines: true,
  canyonGridOpacity: 0.2,
  canyonFloorColor: 0xc2c2c2,
  canyonWallColor: 0x44484e,
  canyonSkyMid: 0x5a5a5a,
  playerReflectionOpacity: 0.1,
  bloomIntensity: 0.08,
  heroContScale: 1.6,
  boosterY: -1.26,
  ringOrbScale: 2.5,
  steerMulX: -1.05,
  steerMulUp: 15,
  steerMulDown: 5.7,
  playWallGapDifficultyMul: 1,
  playSlopeDifficultyMul: 1,
  playObstacleDifficultyMul: 1,
  playBaseSpeedDifficultyMul: 1,
  playAccelerationDifficultyMul: 1,
  playSpeedBoostDifficultyMul: 1,
};

export const GAMESCOM_RULE_KEYS = [
  "keepLevel",
  "bank",
  "manualRoll",
  "bloomIntensity",
  "steerSpeed",
  "elevMax",
  "steerMulX",
  "steerMulUp",
  "steerMulDown",
  "heroContScale",
  "boosterY",
  "boostArmour",
  "boostArmourAlwaysOff",
  "boostArmourAlwaysOn",
  "shieldTrailType",
  "spinOnRing",
  "highlightThickness",
  "pickupMagnetRadius",
] as const satisfies readonly (keyof DevSettings)[];

/** Forced `dev` overrides applied while GamesCom mode is ON (evolve throughout dev). */
export function getGamesComRules(): Pick<
  DevSettings,
  (typeof GAMESCOM_RULE_KEYS)[number]
> {
  return {
    keepLevel: true, // no disorienting camera roll
    bank: 0, // belt-and-braces: zero track banking
    manualRoll: 0,
    bloomIntensity: gamescom.bloomIntensity,
    steerSpeed: 2.8, // snappier, more 1:1 controls for a trade-show crowd
    elevMax: 0, // no up/down track slopes in the exhibition canyon
    steerMulX: gamescom.steerMulX,
    steerMulUp: gamescom.steerMulUp,
    steerMulDown: gamescom.steerMulDown,
    heroContScale: gamescom.heroContScale,
    boosterY: gamescom.boosterY,
    boostArmour: false,
    boostArmourAlwaysOff: true,
    boostArmourAlwaysOn: false,
    shieldTrailType: 0,
    spinOnRing: false,
    highlightThickness: 2, // GamesCom: outline shootable obstacles on by default
    pickupMagnetRadius: 10, // GamesCom: pickups auto-magnet to the craft (forgiving crowd play)
  };
}

let gamescomSnapshot: Partial<DevSettings> | null = null;

/** Enable/disable GamesCom mode, applying the forced rules or restoring the snapshot. */
export function setGamesComEnabled(on: boolean) {
  if (on === gamescom.enabled) return;
  gamescom.enabled = on;
  if (on) {
    const snap: Record<string, unknown> = {};
    for (const k of GAMESCOM_RULE_KEYS) {
      snap[k] = dev[k];
    }
    gamescomSnapshot = snap as Partial<DevSettings>;
    applyGamesComRules();
  } else if (gamescomSnapshot) {
    Object.assign(dev, gamescomSnapshot);
    gamescomSnapshot = null;
  }
}

export function applyGamesComRules() {
  if (gamescom.enabled) Object.assign(dev, getGamesComRules());
}

setGamesComEnabled(true);
