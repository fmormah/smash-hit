/** Architectural signature of a chapter — drives the environment built per segment. */
export type ChapterStyle =
  | "enclosed"
  | "open"
  | "tilted"
  | "towers"
  | "stepped"
  | "gateway"
  | "void" // open horizon: cube-cliff terrain, big sky, no enclosing pillars
  | "abyss" // no floor beneath the player — just floating objects/particles in the void
  | "ethereal" // misty horizon, deep center gap, DNA helices, suspended panes, floating spheres
  | "nebula" // no floor, rich cosmic void, glowing rings, floating neon glass panels, colored particles
  | "canyon"; // GamesCom Canyon: deliberately simple curated corridor — floor + canyon walls, cube obstacles

export interface Chapter {
  name: string;
  top: number;
  mid?: number;
  horizon: number;
  accent: number;
  light: number;
  floor?: number;
  wall?: number;
  /** signature architecture for the chapter's rooms */
  style: ChapterStyle;
  /** per-pattern weight multipliers (keyed by pattern name); default 1 when omitted */
  weights?: Record<string, number>;
}

/**
 * Per-chapter colour themes AND level identity, sampled frame-by-frame from real
 * Smash Hit footage. Each chapter has its own architecture + obstacle bias, so the
 * worlds feel distinct rather than recoloured.
 */
export const CHAPTERS: Chapter[] = [
  {
    // The opening zone is the bright AZURE biome (keeps the gentle intro pattern mix).
    name: "AZURE",
    top: 0x06283a,
    horizon: 0x8fe8ff,
    accent: 0x3fd7ff,
    light: 0xaff0ff,
    style: "enclosed",
    weights: {
      singlePane: 3.0,
      crystalBonus: 3.0,
      multiballOrb: 1.5,
      paneRowWithGap: 1.0,
      floorCrystalsPattern: 2.0,
      switchGate: 0.35,
    },
  },
  {
    name: "AZURE",
    top: 0x06283a,
    horizon: 0x8fe8ff,
    accent: 0x3fd7ff,
    light: 0xaff0ff,
    style: "enclosed", // bright enclosed corridors with suspended slabs
    weights: {
      suspendedBeam: 2.6,
      slidingDoors: 1.8,
      pendulum: 1.4,
      singlePane: 1.3,
      hangingSpikes: 0.3,
      dnaHelix: 0.3,
      beamCurtain: 0.4,
      longitudinalPane: 1.5,
      overheadSlabLanes: 1.2,
      craneClaws: 0.7,
    },
  },
  {
    name: "AETHER",
    top: 0x1a1142,
    horizon: 0xd9b8ff,
    accent: 0xb98cff,
    light: 0xe3d2ff,
    style: "void", // wide open lavender void: cube cliffs, big horizon, glass to weave
    weights: {
      singlePane: 2.0,
      paneRowWithGap: 1.6,
      crystalBonus: 2.2,
      suspendedBeam: 1.6,
      dnaHelix: 1.6,
      tiltedPanes: 1.4,
      spinningPanel: 1.2,
      multiballOrb: 1.4,
      floorCrystalsPattern: 0.5,
    },
  },
  {
    name: "ETHEREAL",
    top: 0x0c0b24,
    horizon: 0x70c5ff,
    accent: 0x00d2ff,
    light: 0x9be3ff,
    style: "ethereal", // misty horizon, deep center gap, DNA helices, suspended panes, floating spheres
    weights: {
      dnaHelix: 2.5,
      singlePane: 1.5,
      crystalBonus: 2.0,
      multiballOrb: 1.5,
      suspendedBeam: 2.0,
      spinningPanel: 1.5,
      pendulum: 1.2,
    },
  },
  {
    name: "EMBER",
    top: 0x3a0c14,
    horizon: 0xffb38a,
    accent: 0xff6a5a,
    light: 0xffb59a,
    style: "open", // hanging glass spikes + beam waterfalls + tilted slabs
    weights: {
      hangingSpikes: 3.2,
      beamCurtain: 2.2,
      beamElevators: 1.7,
      tiltedPanes: 1.8,
      fallingBlocks: 1.6,
      overheadSlabLanes: 1.2,
      switchGate: 0.8,
      dnaHelix: 0.3,
      floorCrystalsPattern: 1.5,
    },
  },
  {
    name: "VERDANT",
    top: 0x07331f,
    horizon: 0xa9f3c4,
    accent: 0x3fe89a,
    light: 0x9ff0c0,
    style: "tilted", // the whole room banks; angled glass everywhere
    weights: {
      tiltedPanes: 2.6,
      overheadSlabLanes: 3.0,
      craneClaws: 2.3,
      layeredPanes: 2.0,
      spinningPanel: 2.0,
      dnaHelix: 1.3,
      staggeredColumns: 1.4,
      suspendedBeam: 0.4,
      doubleWindmill: 1.5,
      longitudinalPane: 1.5,
    },
  },
  {
    name: "ABYSS",
    top: 0x02010f,
    horizon: 0x2a6cff,
    accent: 0x6fe0ff,
    light: 0x9fd8ff,
    style: "abyss", // NO floor — fly over a bottomless void of drifting cubes & particles
    weights: {
      singlePane: 2.0,
      layeredPanes: 1.6,
      crystalBonus: 2.0,
      suspendedBeam: 1.6,
      dnaHelix: 1.8,
      spinningPanel: 1.4,
      multiballOrb: 1.4,
      staggeredColumns: 1.2,
      floorCrystalsPattern: 0,
    },
  },
  {
    name: "NEBULA",
    top: 0x140024,
    horizon: 0xff00aa,
    accent: 0x00ffff,
    light: 0xffaaff,
    style: "nebula", // no floor, rich cosmic void, glowing rings, floating neon glass panels, colored particles
    weights: {
      singlePane: 2.0,
      layeredPanes: 1.8,
      crystalBonus: 2.2,
      dnaHelix: 2.0,
      spinningPanel: 1.6,
      multiballOrb: 1.5,
      floorCrystalsPattern: 0,
    },
  },
  {
    name: "DUSK",
    top: 0x101a4a,
    horizon: 0xffb764,
    accent: 0xff9a4a,
    light: 0xffce8a,
    style: "towers", // DNA helices + tall translucent glass-grid megastructures
    weights: {
      towerGate: 3.2,
      dnaHelix: 3.0,
      craneClaws: 1.8,
      layeredPanes: 2.0,
      multiballOrb: 2.0,
      crystalBonus: 1.8,
      glassGrid: 1.5,
      overheadSlabLanes: 0.8,
      beamCurtain: 0.4,
    },
  },
  {
    name: "DAWN",
    top: 0x0a1830,
    horizon: 0xdaeeff,
    accent: 0x6fb6ff,
    light: 0xcfe6ff,
    style: "stepped", // open stepped terrain + chains + floor markers
    weights: {
      pendulum: 2.5,
      pendulumField: 2.2,
      verticalGate: 2.0,
      narrowSlit: 1.8,
      staggeredColumns: 1.8,
      towerGate: 1.2,
      switchGate: 1.4,
      beamCurtain: 0.3,
      floorCrystalsPattern: 2.0,
    },
  },
  {
    name: "ORCHID",
    top: 0x2a0a3e,
    horizon: 0xffc2e6,
    accent: 0xff7ad6,
    light: 0xffc2ec,
    style: "gateway", // pillared gateways + beam waterfalls + portals
    weights: {
      beamCurtain: 3.0,
      beamElevators: 2.5,
      circlePortal: 2.2,
      towerGate: 1.6,
      paneRowWithGap: 1.6,
      windmill: 1.6,
      spinningPanel: 1.5,
      doubleWindmill: 1.8,
      switchGate: 1.5,
    },
  },
  {
    name: "SUNSET",
    top: 0x4a1210,
    horizon: 0xffc07a,
    accent: 0xfff1a8,
    light: 0xffd1a0,
    style: "gateway", // orange end-video gate rooms with switch doors and floating approach pads
    weights: {
      switchGate: 3.5,
      circlePortal: 2.4,
      towerGate: 1.8,
      overheadSlabLanes: 1.4,
      slidingBlocks: 1.3,
      floorCrystalsPattern: 1.2,
      beamCurtain: 0.8,
    },
  },
  {
    name: "CYBER",
    top: 0x050014,
    horizon: 0xff00ff,
    accent: 0x00ffff,
    light: 0xffaaff,
    style: "gateway",
    weights: {
      laserBeams: 3.0,
      slidingBlocks: 2.0,
      popupBlockers: 1.5,
      glassGrid: 1.5,
      beamCurtain: 1.5,
      floorCrystalsPattern: 1.0,
    },
  },
  {
    name: "TOXIC",
    top: 0x051a05,
    horizon: 0x8aff00,
    accent: 0xccff00,
    light: 0xdfff80,
    style: "tilted",
    weights: {
      popupBlockers: 3.0,
      pushingWalls: 2.0,
      tiltedPanes: 2.0,
      dnaHelix: 1.5,
      doubleWindmill: 1.5,
    },
  },
  {
    name: "FORGE",
    top: 0x240500,
    horizon: 0xff4400,
    accent: 0xffaa00,
    light: 0xffcc80,
    style: "open",
    weights: {
      slidingBlocks: 3.0,
      pushingWalls: 2.5,
      fallingBlocks: 2.0,
      steelGotcha: 1.5,
      staggeredColumns: 1.5,
      hangingSpikes: 1.0,
    },
  },
  {
    name: "FROST",
    top: 0x001133,
    horizon: 0x00aaff,
    accent: 0xffffff,
    light: 0xccffff,
    style: "towers",
    weights: {
      glassPyramid: 3.0,
      layeredPanes: 2.5,
      narrowSlit: 2.0,
      crystalBonus: 2.0,
      pendulumField: 1.5,
      multiballOrb: 1.0,
    },
  },
];

/**
 * GAMESCOM CANYON — the curated Gamescom exhibition level. Deliberately NOT part of
 * the CHAPTERS rotation above: it's a separate proving ground, forced for every
 * segment while GamesCom mode is enabled (see `gamescom` / `setGamesComEnabled` in
 * runtime, consumed in segments.ts). Neutral greys are the default exhibition look,
 * but this stays a normal Chapter so the theme can be recoloured like every other level.
 */
export const GAMESCOM_CANYON: Chapter = {
  name: "GAMESCOM CANYON",
  top: 0x151515,
  mid: 0x5a5a5a,
  horizon: 0xd2d2d2,
  accent: 0xf2f2f2,
  light: 0xffffff,
  floor: 0xc2c2c2,
  wall: 0x44484e,
  style: "canyon",
  weights: {}, // cube-obstacle / fuel-orb pattern weights get tuned here as rules evolve
};

export const GOOGLE_BLUE = 0x4285f4;
export const GOOGLE_GREEN = 0x34a853;
export const GOOGLE_YELLOW = 0xfbbc05;
export const GOOGLE_RED = 0xea4335;

export const GAMESCOM_PLAY_CHAPTERS: Chapter[] = [
  {
    name: "GOOGLE BLUE",
    top: 0x071b44,
    mid: 0x1f5fc8,
    horizon: 0x8fbaff,
    accent: GOOGLE_BLUE,
    light: 0xc6dcff,
    floor: 0x86b2ff,
    wall: 0x174a9a,
    style: "canyon",
  },
  {
    name: "GOOGLE GREEN",
    top: 0x062414,
    mid: 0x1f7f43,
    horizon: 0x93e6b0,
    accent: GOOGLE_GREEN,
    light: 0xc5f4d5,
    floor: 0x85d99d,
    wall: 0x15572e,
    style: "canyon",
  },
  {
    name: "GOOGLE YELLOW",
    top: 0x332400,
    mid: 0xc88f00,
    horizon: 0xffe28a,
    accent: GOOGLE_YELLOW,
    light: 0xfff1b0,
    floor: 0xffd978,
    wall: 0x8a6400,
    style: "canyon",
  },
  {
    name: "GOOGLE RED",
    top: 0x3a0a08,
    mid: 0xb52620,
    horizon: 0xffa09a,
    accent: GOOGLE_RED,
    light: 0xffd0cc,
    floor: 0xff8f86,
    wall: 0x8a211b,
    style: "canyon",
  },
  {
    name: "GOOGLE RAINBOW",
    top: GOOGLE_BLUE,
    mid: GOOGLE_GREEN,
    horizon: GOOGLE_RED,
    accent: 0xffffff,
    light: GOOGLE_YELLOW,
    floor: 0xf7f2d0,
    wall: 0x202d63,
    style: "canyon",
  },
];

/**
 * The full pool selectable in GamesCom mode's level list: the five Google levels
 * FIRST, then the older/general biomes. Indices into this array are what the
 * GamesCom level order/active arrays reference.
 */
export const GAMESCOM_ALL_CHAPTERS: Chapter[] = [
  ...GAMESCOM_PLAY_CHAPTERS,
  ...CHAPTERS,
];
