import * as THREE from "three";
import {
  CULL_BEHIND,
  EYE_Y,
  OBS_TOP,
  PATH_HALF,
  PILLAR_X,
  SEG_LEN,
} from "../config/constants";
import { GAMESCOM_CANYON } from "../config/chapters";
import {
  gamescomLevelCount,
  gamesComChapterFor,
  gamesComLevelTuning,
  generalChapterFor,
  isGamesComPlayMode,
} from "../config/gamescom-levels";
import { dev, gamescom } from "../config/runtime";
import type {
  MaterialFactories,
  SharedGeometries,
} from "../rendering/materials";
import { disposeGroup } from "../utils/dispose";
import { rnd } from "../utils/random";
import type { Obstacle, Segment } from "../types";
import {
  addObstacle,
  chapterBanner,
  coversCenter,
  removeFromArray,
  tutorialText,
} from "./obstacle-helpers";
import { laneAt, slopeAt } from "./path";
import { pickPattern } from "./patterns";
import { addCrystalGate } from "./gates";
import { chapterAt } from "./chapter";

const _FWD_Z = new THREE.Vector3(0, 0, 1);
const _tangent = new THREE.Vector3();

/** How many rooms before a level gate dissolve into the cube-cliff void (the in-between space). */
const VOID_LEAD = 8;

export interface SegmentState {
  segments: Segment[];
  obstacles: Obstacle[];
  nextSegZ: number;
  segIndex: number;
  distance: number;
  speed: number; // live player speed (drives wave-density-by-speed)
  gates: { z: number; triggered: boolean }[]; // level-gate crystals (world z) for the boost-on-pass
  splashMode: boolean;
}

/**
 * Rooms between obstacle waves. Either the fixed dev.waveSpacing, or — when
 * dev.waveBySpeed is on — a value that grows with speed (min→max) so faster flight
 * spaces hazards out and gives more reaction time.
 */
export function effectiveWaveSpacing(speed: number): number {
  if (!dev.waveBySpeed) return Math.max(1, Math.round(dev.waveSpacing));
  const t = THREE.MathUtils.clamp(
    ((speed - dev.baseSpeed) / Math.max(1, dev.maxBonus)) * dev.waveSpeedRate,
    0,
    1,
  );
  return Math.max(
    1,
    Math.round(dev.waveSpeedMin + (dev.waveSpeedMax - dev.waveSpeedMin) * t),
  );
}

export function spawnSegment(
  scene: THREE.Scene,
  camera: THREE.Camera,
  state: SegmentState,
  geo: SharedGeometries,
  mats: MaterialFactories,
  dispose: (mesh: THREE.Object3D) => void,
) {
  const zc = state.nextSegZ;
  const group = new THREE.Group();
  scene.add(group);

  const gamescomPlay = isGamesComPlayMode();
  // Infinite-run gating: GATELESS pins the level (no transitions / continuous flight);
  // GATED advances + cycles the active levels with gates between them.
  const gatelessInfinite = dev.infiniteLevels && !dev.infiniteGated;
  const gatedInfinite = dev.infiniteLevels && dev.infiniteGated;
  const segmentChapter = (segIndex: number) => {
    if (gamescomPlay) return chapterAt(segIndex); // finite Play: advance by distance
    if (dev.zoneOverride >= 0) return dev.zoneOverride; // forced zone
    if (gatelessInfinite) return 0; // gateless infinite: pinned → continuous
    return chapterAt(segIndex); // gated infinite / finite normal: advance
  };
  const chIdx = state.splashMode
    ? dev.splashZoneOverride >= 0
      ? dev.splashZoneOverride
      : 0
    : segmentChapter(state.segIndex);
  // GamesCom Test Flight forces the curated grey canyon (gateless) or cycles the Google
  // levels (gated); Play uses the five Google levels; otherwise the normal rotation.
  const ch = gamescom.enabled
    ? gamesComChapterFor(chIdx)
    : generalChapterFor(chIdx);
  const accent = new THREE.Color().setHex(ch.accent);
  const struct = new THREE.Color()
    .setHex(ch.horizon)
    .multiplyScalar(0.5)
    .lerp(new THREE.Color(ch.style === "canyon" ? 0x242424 : 0x202833), 0.5);

  // Place & orient the room on the curving centreline. z stays exact (= zc); the lane
  // only displaces x/y, and the room is rotated to follow the path tangent.
  // Set before building so obstacle centre-coverage sees the final world matrix.
  const off = laneAt(zc);
  group.position.set(off.x, off.y, zc);
  const sl = slopeAt(zc);
  _tangent.set(sl.x, sl.y, 1).normalize(); // direction of increasing local z (backward)
  group.quaternion.setFromUnitVectors(_FWD_Z, _tangent);
  // VERDANT and friends bank the whole room about its forward axis — but "keep level"
  // suppresses it so the perspective stays even.
  if (ch.style === "tilted" && !dev.keepLevel)
    group.rotateZ(0.16 * Math.sin(state.segIndex * 0.35));
  // World-scale (dev): widen/heighten the room (x/y) while keeping z depth so the
  // corridor stays seamless. The player avatar is unaffected. Set before building
  // children so obstacle world matrices (centre-coverage + collision) include it.
  group.scale.set(dev.worldScale, dev.worldScale, 1);

  const seg: Segment = { z: zc, group, obstacles: [], index: state.segIndex };
  state.segments.push(seg);

  // Level-gate void transition: the boundary segment carries the big crystal gate, and
  // the rooms BEFORE it (VOID_LEAD of them) dissolve the current level into a wide
  // cube-cliff void so the player approaches the gate through lots of empty space.
  const gatesEnabled = !gamescom.enabled || gamescomPlay || gatedInfinite;
  const playLevels = gamescomLevelCount(); // active Google/older levels in Play
  const isBoundary =
    gatesEnabled && // gateless Test Flight has no gates; Play / gated-infinite / normal do
    !state.splashMode &&
    state.segIndex > 4 &&
    chIdx > 0 &&
    (!gamescomPlay || chIdx < playLevels) &&
    chIdx !== segmentChapter(state.segIndex - 1);
  let isPreGate = false;
  if (gatesEnabled && !state.splashMode && state.segIndex > 4) {
    for (let k = 1; k <= VOID_LEAD; k++) {
      const nextChIdx = segmentChapter(state.segIndex + k);
      if (
        nextChIdx > chIdx &&
        (!gamescomPlay || nextChIdx < playLevels)
      ) {
        isPreGate = true;
        break;
      }
    }
  }

  if (isBoundary || isPreGate) {
    // The gate's (upcoming) chapter decides the look of the WHOLE sequence, so the
    // floor is consistent across it — and roughly half the gates float in a void.
    const gateChapter = isBoundary ? chIdx : chIdx + 1;
    const gateCh = gamescom.enabled
      ? gamesComChapterFor(gateChapter)
      : generalChapterFor(gateChapter);
    const hasFloor = gateCh.style !== "abyss" && gateCh.style !== "nebula";
    addVoidTerrain(
      seg,
      state.obstacles,
      geo,
      struct,
      ch.accent,
      hasFloor,
      isBoundary,
    );
    if (isBoundary) {
      addCrystalGate(seg, ch.accent);
      state.gates.push({ z: zc, triggered: false });
      chapterBanner(
        seg,
        (gamescomPlay ? "LEVEL " : "CHAPTER ") + (chIdx + 1),
        ch.name,
        "#" + ch.accent.toString(16).padStart(6, "0"),
      );
    }
    state.nextSegZ -= SEG_LEN;
    state.segIndex++;
    return;
  }

  // Structural material is shared by pillars AND the shatterable decor below.
  const pillarMat = new THREE.MeshStandardMaterial({
    color: struct,
    metalness: 0.3,
    roughness: 0.6,
    envMapIntensity: 0.8,
  });

  // Open styles ('void' / 'abyss' / 'ethereal' / 'nebula') trade the enclosing pillars for a wide cube-cliff
  // horizon or custom voids; 'abyss' & 'nebula' drop the floor entirely.
  const openStyle =
    ch.style === "void" ||
    ch.style === "abyss" ||
    ch.style === "ethereal" ||
    ch.style === "nebula" ||
    ch.style === "canyon";
  if (ch.style === "void" || ch.style === "abyss") {
    addCubeCliffs(seg, state.obstacles, geo, makeRockMat(struct), ch.accent, {
      base: ch.style === "void",
      floaters: ch.style === "abyss" ? 14 : 0,
    });
  } else if (ch.style === "ethereal") {
    addEtherealTerrain(
      seg,
      state.obstacles,
      group,
      geo,
      struct,
      ch.accent,
      mats,
    );
  } else if (ch.style === "nebula") {
    addNebulaTerrain(seg, state.obstacles, group, geo, struct, ch.accent);
  } else if (ch.style === "canyon") {
    addCanyonTerrain(group, struct, ch.accent, ch, chIdx);
  } else {
    const floorMat = new THREE.MeshStandardMaterial({
      color: struct.clone().multiplyScalar(0.5),
      metalness: 0.55,
      roughness: 0.22,
      envMapIntensity: 1.4,
    });
    // depth slightly > SEG_LEN so neighbouring (yawed/pitched) floors overlap and hide seams
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(PILLAR_X * 2 + 4, 0.4, SEG_LEN + 2.5),
      floorMat,
    );
    floor.position.y = -0.2;
    group.add(floor);

    const stripMat = new THREE.MeshStandardMaterial({
      color: 0x000000,
      emissive: accent,
      emissiveIntensity: 0.7,
      fog: false,
    });
    const count = 4;
    for (let i = 0; i < count; i++) {
      const z = -SEG_LEN / 2 + (SEG_LEN * (i + 0.5)) / count;
      for (const sx of [-1, 1]) {
        const ph = rnd(9, 15);
        const p = new THREE.Mesh(geo.pillar, pillarMat);
        p.scale.set(1, ph, 1);
        p.position.set(sx * PILLAR_X, ph / 2 - 0.2, z);
        group.add(p);
        const strip = new THREE.Mesh(
          new THREE.BoxGeometry(0.1, ph * 0.7, 0.1),
          stripMat,
        );
        strip.position.set(sx * (PILLAR_X - 0.56), ph * 0.4, z);
        group.add(strip);
      }
    }
  }

  {
    if (state.segIndex > 1) {
      switch (ch.style) {
        case "void":
        case "abyss":
        case "ethereal":
        case "nebula":
          // open horizon — the custom voids are enough; keep the sky clear of standard beams
          break;
        case "canyon":
          // GamesCom Canyon: addCanyonTerrain builds the whole shell; obstacles + fuel
          // orbs come from the pattern system (tuned via GamesCom rules). No extras here.
          break;
        case "enclosed":
          addSideWalls(group, geo, struct);
          if (!state.splashMode && Math.random() < 0.45)
            addCeilingRibs(seg, state.obstacles, geo, pillarMat, ch.accent);
          break;
        case "towers":
          addGridTowers(group, geo, struct);
          addTowerGateArchitecture(seg, state.obstacles, group, geo, struct, ch.accent);
          break;
        case "stepped":
          if (!state.splashMode) {
            addSteppedBlocks(seg, state.obstacles, geo, pillarMat, ch.accent);
            addCausewayPads(seg, state.obstacles, geo, pillarMat);
            addFloorCrystals(seg, state.obstacles, mats, ch.accent);
          }
          break;
        case "gateway":
          if (!state.splashMode) {
            addArches(seg, state.obstacles, geo, pillarMat, ch.accent);
            addGatewayFrames(seg, state.obstacles, group, geo, pillarMat, ch.accent);
            addCausewayPads(seg, state.obstacles, geo, pillarMat);
            if (Math.random() < 0.4)
              addSteppedBlocks(seg, state.obstacles, geo, pillarMat, ch.accent);
          } else {
            addGatewayFrames(seg, state.obstacles, group, geo, pillarMat, ch.accent);
          }
          break;
        case "tilted":
          if (!state.splashMode) {
            addBankedSlabs(seg, state.obstacles, geo, struct, ch.accent);
            if (Math.random() < 0.5)
              addSteppedBlocks(seg, state.obstacles, geo, pillarMat, ch.accent);
          }
          break;
        case "open":
        default:
          if (!state.splashMode) {
            addCausewayPads(seg, state.obstacles, geo, pillarMat);
            if (Math.random() < 0.6)
              addSteppedBlocks(seg, state.obstacles, geo, pillarMat, ch.accent);
          }
          break;
      }
      if (
        !state.splashMode &&
        ch.style !== "gateway" &&
        !openStyle &&
        Math.random() < 0.4
      )
        addArches(seg, state.obstacles, geo, pillarMat, ch.accent);
    }

    if (!gamescom.enabled && !state.splashMode && state.segIndex === 2)
      tutorialText(seg, "aim to hit.");
    else if (!gamescom.enabled && !state.splashMode && state.segIndex === 4)
      tutorialText(seg, "smash everything.");
    else if (
      !state.splashMode &&
      state.segIndex > 4 &&
      state.segIndex %
        Math.max(
          1,
          Math.round(
            effectiveWaveSpacing(state.speed) /
              (gamescomPlay ? gamesComLevelTuning(chIdx).obstacleDensity : 1),
          ),
        ) ===
        0
    ) {
      const diff = gamescomPlay
        ? Math.min(1, 0.2 + gamesComLevelTuning(chIdx).levelIndex * 0.2)
        : Math.min(1, state.distance / 1700);
      pickPattern(diff, chIdx)(
        seg,
        diff,
        state.obstacles,
        geo,
        mats,
        dispose,
        camera,
      );
    }
  }

  state.nextSegZ -= SEG_LEN;
  state.segIndex++;
}

// ---- per-chapter architecture builders ----

function makeRockMat(struct: THREE.Color) {
  return new THREE.MeshStandardMaterial({
    color: struct.clone().multiplyScalar(0.55),
    metalness: 0.18,
    roughness: 0.85,
    envMapIntensity: 0.45,
  });
}

/**
 * A dark cube-cliff landscape: blocky plateaus and standing slabs receding into the
 * fog, leaving the centre lane open so the horizon/void reads behind the obstacles.
 * `base` lays a ground plate; `floaters` scatters drifting cubes for a floorless abyss.
 * All these objects are now registered as breakable destructible obstacles!
 */
function addCubeCliffs(
  seg: Segment,
  obstacles: Obstacle[],
  geo: SharedGeometries,
  rockMat: THREE.Material,
  accentHex: number,
  opts: {
    base?: boolean;
    floaters?: number;
    reach?: number;
    lessDense?: boolean;
    clearFrontOfGate?: boolean;
  } = {},
) {
  const reach = opts.reach ?? 0;
  if (opts.base) {
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(PILLAR_X * 2 + 14, 0.4, SEG_LEN + 2.5),
      rockMat,
    );
    base.position.y = -0.3;
    seg.group.add(base);
  }

  // stepped cube plateaus climbing out on both sides of the lane
  const cubeCount = opts.lessDense ? 2 : 4;
  for (const sx of [-1, 1]) {
    for (let i = 0; i < cubeCount; i++) {
      const z = rnd(-SEG_LEN / 2, SEG_LEN / 2);
      if (opts.clearFrontOfGate && z > -7) continue; // clear space in front of the crystal gate

      const w = rnd(3, 6);
      const h = rnd(2.5, 11);
      const d = rnd(4, 9);
      const cube = new THREE.Mesh(geo.frag, rockMat);
      cube.scale.set(w, h, d);
      cube.position.set(
        sx * (PATH_HALF + 1.6 + reach + i * rnd(2.2, 4)),
        h / 2 - 0.4,
        z,
      );
      addShatterDecor(seg, obstacles, cube, rockMat, accentHex);
    }
  }

  // a few tall standing slabs farther out for the void silhouette
  const slabCount = opts.lessDense ? 1 : 3;
  for (let i = 0; i < slabCount; i++) {
    const sx = Math.random() < 0.5 ? -1 : 1;
    const z = rnd(-SEG_LEN / 2, SEG_LEN / 2);
    if (opts.clearFrontOfGate && z > -7) continue; // clear space in front of the crystal gate

    const w = rnd(2, 5);
    const h = rnd(7, 17);
    const d = rnd(2, 5);
    const c = new THREE.Mesh(geo.frag, rockMat);
    c.scale.set(w, h, d);
    c.position.set(
      sx * rnd(PILLAR_X + 4 + reach, PILLAR_X + 13 + reach),
      h / 2 - 0.5,
      z,
    );
    addShatterDecor(seg, obstacles, c, rockMat, accentHex);
  }

  // drifting cubes/specks filling a floorless void (the "abyss" look)
  const floaterCount = opts.floaters ?? 0;
  for (let i = 0; i < floaterCount; i++) {
    const z = rnd(-SEG_LEN / 2, SEG_LEN / 2);
    if (opts.clearFrontOfGate && z > -7) continue; // clear space in front of the crystal gate

    const s = rnd(0.3, 1.5);
    const f = new THREE.Mesh(geo.frag, rockMat);
    f.scale.setScalar(s);
    f.position.set(rnd(-PILLAR_X - 7, PILLAR_X + 7), rnd(-9, OBS_TOP + 5), z);
    f.rotation.set(
      rnd(0, Math.PI * 2),
      rnd(0, Math.PI * 2),
      rnd(0, Math.PI * 2),
    );
    addShatterDecor(seg, obstacles, f, rockMat, accentHex);
  }
}

/**
 * The void approach to a level gate. `hasFloor` lays a ground plate; when false the
 * gate sequence floats over a bottomless, cube-strewn void.
 */
function addVoidTerrain(
  seg: Segment,
  obstacles: Obstacle[],
  geo: SharedGeometries,
  struct: THREE.Color,
  accentHex: number,
  hasFloor: boolean,
  isBoundary: boolean,
) {
  addCubeCliffs(seg, obstacles, geo, makeRockMat(struct), accentHex, {
    base: hasFloor,
    floaters: hasFloor ? 3 : 8, // less dense floaters in-between
    lessDense: true, // less dense cubes and slabs in-between
    clearFrontOfGate: isBoundary, // clear space in front of the crystal gate
  });
}

function addEtherealTerrain(
  seg: Segment,
  obstacles: Obstacle[],
  group: THREE.Group,
  geo: SharedGeometries,
  struct: THREE.Color,
  accentHex: number,
  mats: MaterialFactories,
) {
  const floorMat = new THREE.MeshStandardMaterial({
    color: struct.clone().multiplyScalar(0.45),
    metalness: 0.45,
    roughness: 0.35,
    envMapIntensity: 1.2,
  });

  // Two side platforms with a gap in the center
  const sideW = 5.5;
  const gap = 3.8;
  const leftPlatform = new THREE.Mesh(
    new THREE.BoxGeometry(sideW, 0.4, SEG_LEN + 2.5),
    floorMat,
  );
  leftPlatform.position.set(-gap - sideW / 2, -0.2, 0);
  group.add(leftPlatform);

  const rightPlatform = new THREE.Mesh(
    new THREE.BoxGeometry(sideW, 0.4, SEG_LEN + 2.5),
    floorMat,
  );
  rightPlatform.position.set(gap + sideW / 2, -0.2, 0);
  group.add(rightPlatform);

  // Tall elegant side columns (Image 1 and 2)
  const colMat = new THREE.MeshStandardMaterial({
    color: struct,
    metalness: 0.35,
    roughness: 0.4,
    envMapIntensity: 1.0,
  });
  for (const sx of [-1, 1]) {
    const h = rnd(12, 22);
    const col = new THREE.Mesh(geo.pillar, colMat);
    col.scale.set(1.4, h, 1.4);
    col.position.set(
      sx * (PILLAR_X + 2.5),
      h / 2 - 0.2,
      rnd(-SEG_LEN / 4, SEG_LEN / 4),
    );
    group.add(col);
  }

  // Decorative side DNA helices (Image 3)
  for (const sx of [-1, 1]) {
    if (Math.random() < 0.5) {
      addSideDnaHelix(seg, obstacles, group, sx * (PILLAR_X + 1.2), mats, accentHex);
    }
  }

  // Floating spheres (Image 1) — destructible: they pop/shatter when the player
  // flies into them (a graze, never a crash) instead of being inert décor.
  const sphereMat = new THREE.MeshStandardMaterial({
    color: accentHex,
    metalness: 0.9,
    roughness: 0.1,
    envMapIntensity: 1.5,
  });
  for (let i = 0; i < 4; i++) {
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(rnd(0.2, 0.6), 16, 12),
      sphereMat.clone(),
    );
    sphere.position.set(
      rnd(-PILLAR_X - 1, PILLAR_X + 1),
      rnd(1, OBS_TOP - 1),
      rnd(-SEG_LEN / 2, SEG_LEN / 2),
    );
    const o = addObstacle(seg, sphere, obstacles, {
      breakable: true,
      fragColor: accentHex,
    });
    o.blocksCenter = false; // shatter-through, no crash penalty
  }

  // Hanging wires and suspended panes (Image 1 and 4)
  const wireMat = new THREE.MeshStandardMaterial({
    color: 0x444444,
    metalness: 0.8,
    roughness: 0.2,
  });
  const paneMat = mats.glass();
  for (let i = 0; i < 2; i++) {
    const wx = rnd(-3.5, 3.5);
    const wz = rnd(-SEG_LEN / 2, SEG_LEN / 2);
    const wy = rnd(5.5, 8.5);

    // Wire
    const wire = new THREE.Mesh(new THREE.BoxGeometry(0.03, 10, 0.03), wireMat);
    wire.position.set(wx, wy + 5, wz);
    group.add(wire);

    // Suspended glass pane — registered so it SHATTERS when struck (was inert decor)
    const pane = new THREE.Mesh(
      new THREE.BoxGeometry(rnd(1.2, 2.4), rnd(1.2, 2.4), 0.1),
      paneMat,
    );
    pane.position.set(wx, wy, wz);
    pane.rotation.set(rnd(-0.15, 0.15), rnd(-0.15, 0.15), rnd(-0.15, 0.15));
    addShatterDecor(seg, obstacles, pane, paneMat, accentHex);
  }
}

function addSideDnaHelix(
  seg: Segment,
  obstacles: Obstacle[],
  group: THREE.Group,
  x: number,
  mats: MaterialFactories,
  accentHex: number,
) {
  const hub = new THREE.Group();
  hub.position.set(x, EYE_Y + rnd(-1, 2), rnd(-SEG_LEN / 4, SEG_LEN / 4));
  hub.rotation.y = Math.PI / 2; // face along the path
  group.add(hub);
  const turns = 2.0;
  const rungs = 12;
  const radius = 1.2;
  const length = 8;
  const railMat = mats.glass();
  for (let i = 0; i < rungs; i++) {
    const t = i / (rungs - 1);
    const ang = t * Math.PI * 2 * turns;
    const z = (t - 0.5) * length;
    const rung = new THREE.Mesh(
      new THREE.BoxGeometry(radius * 2, 0.12, 0.12),
      railMat,
    );
    rung.position.set(0, 0, z);
    rung.rotation.z = ang;
    hub.add(rung);
  }
  // The whole helix is ONE shatterable obstacle (already parented to the seg group).
  const o = addObstacle(seg, hub, obstacles, {
    noAdd: true,
    breakable: true,
    fragColor: accentHex,
  });
  o.blocksCenter = false; // off to the side — never a path-blocker
  o.cleanup = () => {
    hub.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    railMat.dispose();
  };
}

function addNebulaTerrain(
  seg: Segment,
  obstacles: Obstacle[],
  group: THREE.Group,
  geo: SharedGeometries,
  struct: THREE.Color,
  accentHex: number,
) {
  const rockMat = makeRockMat(struct);
  const glowMat = new THREE.MeshStandardMaterial({
    color: accentHex,
    emissive: accentHex,
    emissiveIntensity: 1.5,
    metalness: 0.1,
    roughness: 0.1,
  });

  // Drifting colorful geometric particles (Image 4 / cosmic void)
  for (let i = 0; i < 18; i++) {
    const s = rnd(0.2, 1.2);
    const useGlow = Math.random() < 0.35;
    const meshGeo =
      Math.random() < 0.4 ? geo.octa : Math.random() < 0.5 ? geo.bob : geo.frag;
    const f = new THREE.Mesh(meshGeo, useGlow ? glowMat : rockMat);
    f.scale.setScalar(s);
    f.position.set(
      rnd(-PILLAR_X - 6, PILLAR_X + 6),
      rnd(-8, OBS_TOP + 6),
      rnd(-SEG_LEN / 2, SEG_LEN / 2),
    );
    f.rotation.set(
      rnd(0, Math.PI * 2),
      rnd(0, Math.PI * 2),
      rnd(0, Math.PI * 2),
    );
    group.add(f);
  }

  // Floating neon glass panels
  for (let i = 0; i < 3; i++) {
    const paneMat = new THREE.MeshStandardMaterial({
      color: accentHex,
      transparent: true,
      opacity: 0.45,
      emissive: accentHex,
      emissiveIntensity: 0.8,
      metalness: 0.1,
      roughness: 0.05,
      side: THREE.DoubleSide,
    });
    const pane = new THREE.Mesh(
      new THREE.BoxGeometry(rnd(1.2, 3), rnd(1.2, 3), 0.08),
      paneMat,
    );
    pane.position.set(
      rnd(-PILLAR_X, PILLAR_X),
      rnd(-4, OBS_TOP + 2),
      rnd(-SEG_LEN / 2, SEG_LEN / 2),
    );
    pane.rotation.set(
      rnd(0, Math.PI * 2),
      rnd(0, Math.PI * 2),
      rnd(0, Math.PI * 2),
    );
    // registered so the neon glass panels SHATTER when struck (was inert decor)
    addShatterDecor(seg, obstacles, pane, paneMat, accentHex);
  }
}

/**
 * GAMESCOM CANYON terrain — deliberately minimal placeholder: a floor and two solid
 * canyon walls with a glowing rim. No pillars/décor — obstacles (cubes) and fuel orbs
 * come from the pattern system so this stays a clean proving ground to iterate on.
 * (Wall spacing / narrowing, movement, etc. will be driven by the evolving GamesCom rules.)
 */
function addCanyonTerrain(
  group: THREE.Group,
  _struct: THREE.Color, // walls now use their own palette colour (gamescom.canyonWallColor)
  accentHex: number,
  chapter = GAMESCOM_CANYON,
  chIdx = 0,
) {
  const minGap = 6;
  const tuning = gamesComLevelTuning(chIdx);
  const play = isGamesComPlayMode();
  const wallGap = THREE.MathUtils.clamp(
    play ? tuning.wallGap : gamescom.canyonWallGap,
    minGap,
    22,
  );
  const slopeAdd = play ? tuning.slopeAddDeg : 0;
  const leftSlope = THREE.MathUtils.clamp(
    gamescom.canyonMirrorSlopes
      ? gamescom.canyonSlopeDeg + slopeAdd
      : gamescom.canyonLeftSlopeDeg + slopeAdd,
    0,
    89.5,
  );
  const rightSlope = THREE.MathUtils.clamp(
    gamescom.canyonMirrorSlopes
      ? gamescom.canyonSlopeDeg + slopeAdd
      : gamescom.canyonRightSlopeDeg + slopeAdd,
    0,
    89.5,
  );
  const leftCurve = gamescom.canyonMirrorCurves
    ? gamescom.canyonCurve
    : gamescom.canyonLeftCurve;
  const rightCurve = gamescom.canyonMirrorCurves
    ? gamescom.canyonCurve
    : gamescom.canyonRightCurve;
  const canyonDepth =
    SEG_LEN * THREE.MathUtils.clamp(gamescom.canyonDrawDistanceScale, 1, 3);
  const floorColor = play ? chapter.floor ?? chapter.horizon : gamescom.canyonFloorColor;
  const wallColor = play ? chapter.wall ?? chapter.top : gamescom.canyonWallColor;

  const floorMat = new THREE.MeshPhysicalMaterial({
    color: floorColor,
    // emissive = the palette colour so the floor reads TRUE even inside a strongly
    // coloured room (otherwise the sky/fog/reflections wash it out), + a light sheen.
    emissive: new THREE.Color().setHex(floorColor),
    emissiveIntensity: 0.55,
    metalness: 0.0,
    roughness: 0.5,
    envMapIntensity: dev.floorReflect, // the bright sky-glint reflection (0 = none)
    clearcoat: dev.floorReflect > 0 ? 0.5 : 0,
    clearcoatRoughness: 0.12,
    side: THREE.DoubleSide,
  });
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(wallGap + 0.6, canyonDepth + 0.04),
    floorMat,
  );
  floor.name = "gamescom-canyon-floor";
  floor.userData.gamescomCanyonFloor = true;
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.11;
  group.add(floor);

  const floorWash = new THREE.Mesh(
    new THREE.PlaneGeometry(wallGap + 0.5, canyonDepth),
    makeCanyonFloorWashMaterial(),
  );
  floorWash.name = "gamescom-canyon-floor-wash";
  floorWash.rotation.x = -Math.PI / 2;
  floorWash.position.y = -0.055;
  floorWash.renderOrder = 1;
  group.add(floorWash);

  const wallMat = new THREE.MeshStandardMaterial({
    color: wallColor, // own palette control, decoupled from the sky gradient
    metalness: 0.06,
    roughness: 0.86,
    envMapIntensity: 0.7,
  });
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0x0b0b0b,
    emissive: new THREE.Color().setHex(accentHex), // accent drives the rim glow
    emissiveIntensity: 0.7,
    fog: false,
  });
  const strataMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x202020),
    metalness: 0.04,
    roughness: 0.95,
    envMapIntensity: 0.2,
    transparent: true,
    opacity: 0.42,
  });
  const wallH = THREE.MathUtils.clamp(gamescom.canyonWallHeight, 3, 30);
  const wallDepth = 5.2;
  const maxTopReach = 96;
  const maxConvex = Math.max(0, wallGap / 2 - 0.6);
  const curves = {
    [-1]: THREE.MathUtils.clamp(leftCurve, -wallDepth * 0.9, maxConvex),
    [1]: THREE.MathUtils.clamp(rightCurve, -wallDepth * 0.9, maxConvex),
  } as Record<number, number>;
  const topOffsets = {
    [-1]: Math.min(
      maxTopReach,
      Math.tan(THREE.MathUtils.degToRad(leftSlope)) * wallH,
    ),
    [1]: Math.min(
      maxTopReach,
      Math.tan(THREE.MathUtils.degToRad(rightSlope)) * wallH,
    ),
  } as Record<number, number>;
  for (const sx of [-1, 1] as const) {
    const topOffset = topOffsets[sx];
    const curve = curves[sx];
    const wall = new THREE.Mesh(
      makeCanyonWallGeometry(
        sx,
        wallGap,
        topOffset,
        wallDepth,
        wallH,
        curve,
        gamescom.canyonCurveFlattenTop,
        canyonDepth,
      ),
      wallMat,
    );
    group.add(wall);

    const topCurveOffset =
      -sx * curve * canyonCurveProfile(1, gamescom.canyonCurveFlattenTop);
    const rim = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.12, canyonDepth + 2.5),
      rimMat,
    );
    rim.position.set(sx * (wallGap / 2 + topOffset) + topCurveOffset, wallH, 0);
    rim.rotation.z = -sx * THREE.MathUtils.degToRad(sx < 0 ? leftSlope : rightSlope);
    group.add(rim);

    for (let i = 0; i < 5; i++) {
      const y = wallH * rnd(0.16, 0.86);
      const t = y / wallH;
      const curveOffset =
        -sx * curve * canyonCurveProfile(t, gamescom.canyonCurveFlattenTop);
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(
          0.1,
          rnd(0.05, 0.13),
          rnd(5.5, canyonDepth * 0.85),
        ),
        strataMat,
      );
      strip.position.set(
        sx * (wallGap / 2 + topOffset * t) + curveOffset - sx * 0.045,
        y,
        rnd(-canyonDepth * 0.18, canyonDepth * 0.18),
      );
      strip.rotation.z = -sx * THREE.MathUtils.degToRad(sx < 0 ? leftSlope : rightSlope);
      strip.rotation.y = rnd(-0.04, 0.04);
      group.add(strip);
    }
  }

  if (gamescom.canyonGridLines) {
    addCanyonGrid(
      group,
      wallGap,
      wallH,
      topOffsets,
      curves,
      canyonDepth,
      accentHex,
    );
  }
}

function makeCanyonFloorWashMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    fog: false,
    toneMapped: false,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      void main() {
        float x = abs(vUv.x - 0.5) * 2.0;
        float center = exp(-pow(x / 0.34, 2.0));
        float side = smoothstep(0.36, 0.98, x);
        float centerAlpha = center * 0.3;
        float sideAlpha = side * 0.34;
        float useCenter = step(sideAlpha, centerAlpha);
        vec3 color = mix(vec3(0.0), vec3(1.0), useCenter);
        float alpha = max(centerAlpha, sideAlpha);
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });
}

/**
 * Subtle GamesCom-canyon grid, drawn as anti-aliased SHADER overlays (not 1px lines)
 * so it reads clearly while staying subtle and scales naturally into the vanishing
 * point. Dark lines on the light floor, light lines on the dark walls.
 */
function addCanyonGrid(
  group: THREE.Group,
  wallGap: number,
  wallH: number,
  topOffsets: Record<number, number>,
  curves: Record<number, number>,
  canyonDepth: number,
  accentHex: number,
) {
  const opacity = THREE.MathUtils.clamp(gamescom.canyonGridOpacity, 0.02, 1.0);
  const wallDepth = 5.2;
  // The accent tints the grid so the level palette recolours it. Both surfaces are dark,
  // so the lines are a lightened accent (kept subtle by canyonGridOpacity).
  const accent = new THREE.Color().setHex(accentHex);
  const floorLine = accent.getHex();
  const wallLine = accent.getHex();

  const floorGrid = new THREE.Mesh(
    new THREE.PlaneGeometry(wallGap + 0.6, canyonDepth + 0.04),
    makeCanyonGridMaterial(floorLine, opacity * 0.9, 0),
  );
  floorGrid.rotation.x = -Math.PI / 2;
  floorGrid.position.y = -0.05;
  floorGrid.renderOrder = 4;
  group.add(floorGrid);

  for (const sx of [-1, 1] as const) {
    const wallGrid = new THREE.Mesh(
      makeCanyonWallGeometry(
        sx,
        wallGap,
        topOffsets[sx],
        wallDepth,
        wallH,
        curves[sx],
        gamescom.canyonCurveFlattenTop,
        canyonDepth,
      ),
      makeCanyonGridMaterial(wallLine, opacity, 1),
    );
    wallGrid.renderOrder = 4;
    group.add(wallGrid);
  }
}

/**
 * Anti-aliased world-grid material. `mode` 0 = floor (grid over the geometry's local
 * X/Y), 1 = wall (local Z/Y). Spacing divides SEG_LEN so lines stay seamless across
 * segments; polygonOffset lifts it off the surface to avoid z-fighting.
 */
function makeCanyonGridMaterial(color: number, opacity: number, mode: number) {
  const div = Math.max(3, Math.round(SEG_LEN / 4));
  const spacing = SEG_LEN / div;
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: false,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
      uSpacing: { value: spacing },
      uMode: { value: mode },
    },
    vertexShader: `
      varying vec3 vLocal;
      void main() {
        vLocal = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uSpacing;
      uniform float uMode;
      varying vec3 vLocal;
      float aaLine(float c) {
        float cs = c / uSpacing;
        float w = max(fwidth(cs), 1e-4);
        float d = abs(fract(cs - 0.5) - 0.5);
        return 1.0 - smoothstep(0.0, w * 1.5, d);
      }
      void main() {
        vec2 co = uMode < 0.5 ? vLocal.xy : vLocal.zy;
        float g = max(aaLine(co.x), aaLine(co.y));
        if (g < 0.01) discard;
        gl_FragColor = vec4(uColor, g * uOpacity);
      }
    `,
  });
}

function makeCanyonWallGeometry(
  sx: -1 | 1,
  gap: number,
  topOffset: number,
  wallDepth: number,
  wallH: number,
  curve = 0,
  flattenTop = true,
  depth = SEG_LEN,
) {
  const z0 = -depth / 2 - 1.25;
  const z1 = depth / 2 + 1.25;
  const y0 = -0.18;
  const y1 = wallH;
  const segments = 18;
  const rows: {
    innerZ0: THREE.Vector3;
    outerZ0: THREE.Vector3;
    innerZ1: THREE.Vector3;
    outerZ1: THREE.Vector3;
  }[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const y = THREE.MathUtils.lerp(y0, y1, t);
    const curved = -sx * curve * canyonCurveProfile(t, flattenTop);
    const innerX = sx * (gap / 2 + topOffset * t) + curved;
    const outerX = innerX + sx * wallDepth;
    rows.push({
      innerZ0: new THREE.Vector3(innerX, y, z0),
      outerZ0: new THREE.Vector3(outerX, y, z0),
      innerZ1: new THREE.Vector3(innerX, y, z1),
      outerZ1: new THREE.Vector3(outerX, y, z1),
    });
  }
  const positions: number[] = [];
  const quad = (
    a: THREE.Vector3,
    b: THREE.Vector3,
    c: THREE.Vector3,
    d: THREE.Vector3,
  ) => {
    for (const p of [a, b, c, b, d, c]) positions.push(p.x, p.y, p.z);
  };
  for (let i = 0; i < segments; i++) {
    const a = rows[i];
    const b = rows[i + 1];
    quad(a.innerZ0, a.innerZ1, b.innerZ0, b.innerZ1); // inner cliff face
    quad(a.outerZ0, b.outerZ0, a.outerZ1, b.outerZ1); // outer face
    quad(a.innerZ0, b.innerZ0, a.outerZ0, b.outerZ0); // front cap
    quad(a.innerZ1, a.outerZ1, b.innerZ1, b.outerZ1); // back cap
  }
  const bottom = rows[0];
  const top = rows[rows.length - 1];
  quad(top.innerZ0, top.innerZ1, top.outerZ0, top.outerZ1); // top
  quad(bottom.innerZ0, bottom.outerZ0, bottom.innerZ1, bottom.outerZ1); // base

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function canyonCurveProfile(t: number, flattenTop: boolean) {
  if (!flattenTop) return Math.sin((Math.PI * t) / 2);

  const peak = 0.56;
  const flatStart = 0.84;
  if (t >= flatStart) return 0;

  const smooth = (x: number) => x * x * (3 - 2 * x);
  if (t <= peak) return smooth(THREE.MathUtils.clamp(t / peak, 0, 1));

  const falloff = smooth(THREE.MathUtils.clamp((t - peak) / (flatStart - peak), 0, 1));
  return 1 - falloff;
}

/**
 * Register a dark decorative mesh as a SHATTERABLE obstacle. These used to be inert
 * black blocks/beams with no collision — now they smash like everything else. Each
 * gets its own cloned material so a single shatter never disposes a shared one.
 */
function addShatterDecor(
  seg: Segment,
  obstacles: Obstacle[],
  mesh: THREE.Mesh,
  baseMat: THREE.Material,
  fragColor: number,
  pad = 0.25,
) {
  mesh.material = (baseMat as THREE.Material).clone();
  const o = addObstacle(seg, mesh, obstacles, { breakable: true, fragColor });
  o.blocksCenter = coversCenter(o.mesh, pad);
  return o;
}

function addSteppedBlocks(
  seg: Segment,
  obstacles: Obstacle[],
  geo: SharedGeometries,
  mat: THREE.Material,
  accentHex: number,
) {
  for (const sx of [-1, 1]) {
    for (let s = 0; s < 3; s++) {
      const b = new THREE.Mesh(geo.frag, mat);
      const h = rnd(2, 5) + s;
      b.scale.set(rnd(2, 3.5), h, rnd(2, 3.5));
      b.position.set(
        sx * (PILLAR_X + 3 + s * 2.2),
        h / 2 - 0.2,
        rnd(-SEG_LEN / 2, SEG_LEN / 2),
      );
      addShatterDecor(seg, obstacles, b, mat, accentHex);
    }
  }
}

function addArches(
  seg: Segment,
  obstacles: Obstacle[],
  geo: SharedGeometries,
  mat: THREE.Material,
  accentHex: number,
) {
  const n = 1 + ((Math.random() * 2) | 0);
  for (let i = 0; i < n; i++) {
    const beam = new THREE.Mesh(geo.frag, mat);
    beam.scale.set(PILLAR_X * 2, 0.9, 1.3);
    beam.position.set(
      0,
      rnd(7, 10.5),
      -SEG_LEN / 2 + (SEG_LEN * (i + 0.5)) / n,
    );
    addShatterDecor(seg, obstacles, beam, mat, accentHex);
  }
}

function addSideWalls(
  group: THREE.Group,
  geo: SharedGeometries,
  struct: THREE.Color,
) {
  const mat = new THREE.MeshStandardMaterial({
    color: struct,
    metalness: 0.25,
    roughness: 0.7,
    envMapIntensity: 0.6,
  });
  const wh = OBS_TOP + 7;
  for (const sx of [-1, 1]) {
    const w = new THREE.Mesh(geo.frag, mat);
    w.scale.set(0.6, wh, SEG_LEN);
    w.position.set(sx * (PILLAR_X + 1.0), wh / 2 - 0.2, 0);
    group.add(w);
  }
}

function addGridTowers(
  group: THREE.Group,
  geo: SharedGeometries,
  struct: THREE.Color,
) {
  const mat = new THREE.MeshStandardMaterial({
    color: struct,
    transparent: true,
    opacity: 0.32,
    metalness: 0.2,
    roughness: 0.1,
    envMapIntensity: 1.2,
    emissive: struct.clone().multiplyScalar(0.35),
    emissiveIntensity: 0.4,
    side: THREE.DoubleSide,
  });
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 2; k++) {
      const w = rnd(3, 5);
      const h = rnd(15, 28);
      const d = rnd(3, 5);
      const t = new THREE.Mesh(geo.frag, mat);
      t.scale.set(w, h, d);
      t.position.set(
        sx * (PILLAR_X + 3 + k * 4),
        h / 2 - 0.2,
        rnd(-SEG_LEN / 2, SEG_LEN / 2),
      );
      group.add(t);
    }
  }
}

function addCeilingRibs(
  seg: Segment,
  obstacles: Obstacle[],
  geo: SharedGeometries,
  mat: THREE.Material,
  accentHex: number,
) {
  const n = 3;
  for (let i = 0; i < n; i++) {
    const z = -SEG_LEN / 2 + (SEG_LEN * (i + 0.5)) / n;
    const rib = new THREE.Mesh(geo.frag, mat);
    rib.scale.set(PILLAR_X * 2 + 1.4, 0.42, 1.0);
    rib.position.set(0, OBS_TOP + 1.15, z);
    addShatterDecor(seg, obstacles, rib, mat, accentHex);
  }
}

function addCausewayPads(
  seg: Segment,
  obstacles: Obstacle[],
  geo: SharedGeometries,
  mat: THREE.Material,
) {
  const group = seg.group;
  const n = 14;
  // Float-form pads: the top surface sits just above the floor; the body extends
  // DOWN (long columns) rather than poking up. The main pads also PULSE in height
  // (top anchored to the ground line) for a gentle breathing motion.
  for (let i = 0; i < n; i++) {
    const pad = new THREE.Mesh(geo.frag, mat);
    const padTop = rnd(0.14, 0.5);
    const padH = rnd(2.5, 7);
    pad.scale.set(rnd(0.85, 1.75), padH, rnd(0.85, 1.75));
    pad.position.set(
      rnd(-1.85, 1.85),
      padTop - padH / 2,
      -SEG_LEN / 2 + (SEG_LEN * (i + 0.5)) / n + rnd(-0.35, 0.35),
    );
    const sxz = pad.scale.x;
    const szz = pad.scale.z;
    const phase = rnd(0, Math.PI * 2);
    addObstacle(seg, pad, obstacles, {
      breakable: false, // decor only — never collides
      update: (dt, ob) => {
        ob.t += dt;
        const h = padH * (1 + Math.sin(ob.t * 1.4 + phase) * 0.13); // pulse ±13%
        ob.mesh.scale.set(sxz, h, szz);
        ob.mesh.position.y = padTop - h / 2; // keep the top (ground line) fixed
      },
    });

    if (Math.random() < 0.75) {
      const sidePad = new THREE.Mesh(geo.frag, mat);
      const sTop = rnd(0.24, 0.82);
      const sH = rnd(2, 6);
      sidePad.scale.set(rnd(0.68, 1.35), sH, rnd(0.68, 1.35));
      sidePad.position.set(
        (Math.random() < 0.5 ? -1 : 1) * rnd(1.95, 3.25),
        sTop - sH / 2,
        pad.position.z + rnd(-0.42, 0.42),
      );
      group.add(sidePad);
    }

    if (i % 3 === 1) {
      const rearPad = new THREE.Mesh(geo.frag, mat);
      const rTop = rnd(0.32, 0.95);
      const rH = rnd(2, 5.5);
      rearPad.scale.set(rnd(0.6, 1.15), rH, rnd(0.6, 1.15));
      rearPad.position.set(
        rnd(-2.2, 2.2),
        rTop - rH / 2,
        pad.position.z + rnd(-0.75, 0.75),
      );
      group.add(rearPad);
    }
  }
}

function addBankedSlabs(
  seg: Segment,
  obstacles: Obstacle[],
  geo: SharedGeometries,
  struct: THREE.Color,
  accentHex: number,
) {
  const mat = new THREE.MeshStandardMaterial({
    color: struct.clone().lerp(new THREE.Color(0x9affe0), 0.18),
    transparent: true,
    opacity: 0.55, // less transparent (these now shatter)
    metalness: 0.1,
    roughness: 0.12,
    envMapIntensity: 1.1,
    side: THREE.DoubleSide,
  });
  const n = 4;
  for (let i = 0; i < n; i++) {
    const sx = i % 2 === 0 ? -1 : 1;
    const slab = new THREE.Mesh(geo.frag, mat);
    slab.scale.set(rnd(1.1, 1.7), 0.24, rnd(8, 13));
    slab.position.set(
      sx * rnd(1.8, PILLAR_X - 0.6),
      rnd(3.0, OBS_TOP + 1.1),
      -SEG_LEN / 2 + (SEG_LEN * (i + 0.5)) / n,
    );
    slab.rotation.y = sx * rnd(0.28, 0.48);
    slab.rotation.z = sx * rnd(0.1, 0.22);
    addShatterDecor(seg, obstacles, slab, mat, accentHex);
  }
}

function addTowerGateArchitecture(
  seg: Segment,
  obstacles: Obstacle[],
  _group: THREE.Group, // meshes self-register via addShatterDecor (seg.group)
  geo: SharedGeometries,
  struct: THREE.Color,
  accentHex: number,
) {
  const mat = new THREE.MeshStandardMaterial({
    color: struct.clone().lerp(new THREE.Color(0x7aa0ff), 0.14),
    transparent: true,
    opacity: 0.38,
    metalness: 0.2,
    roughness: 0.18,
    envMapIntensity: 1.15,
    emissive: struct.clone().multiplyScalar(0.32),
    emissiveIntensity: 0.45,
  });
  for (let k = 0; k < 2; k++) {
    const z = -SEG_LEN / 2 + (SEG_LEN * (k + 0.5)) / 2;
    for (const sx of [-1, 1]) {
      const side = new THREE.Mesh(geo.frag, mat);
      side.scale.set(rnd(1.0, 1.45), rnd(12, 18), rnd(1.2, 1.8));
      side.position.set(
        sx * (PATH_HALF + rnd(1.0, 1.8)),
        side.scale.y / 2 - 0.2,
        z,
      );
      addShatterDecor(seg, obstacles, side, mat, accentHex);
    }
    const top = new THREE.Mesh(geo.frag, mat);
    top.scale.set(PILLAR_X * 1.7, 0.55, 1.2);
    top.position.set(0, rnd(7.2, 9.8), z);
    addShatterDecor(seg, obstacles, top, mat, accentHex);
  }
}

function addGatewayFrames(
  seg: Segment,
  obstacles: Obstacle[],
  _group: THREE.Group, // meshes self-register via addShatterDecor (seg.group)
  geo: SharedGeometries,
  mat: THREE.Material,
  accentHex: number,
) {
  const n = 2;
  for (let i = 0; i < n; i++) {
    const z = -SEG_LEN / 2 + (SEG_LEN * (i + 0.5)) / n;
    for (const sx of [-1, 1]) {
      const side = new THREE.Mesh(geo.frag, mat);
      side.scale.set(0.72, OBS_TOP + 1.6, 0.8);
      side.position.set(sx * (PATH_HALF + 0.6), (OBS_TOP + 1.2) / 2, z);
      addShatterDecor(seg, obstacles, side, mat, accentHex);
    }
    const top = new THREE.Mesh(geo.frag, mat);
    top.scale.set(PATH_HALF * 2 + 1.6, 0.58, 0.8);
    top.position.set(0, OBS_TOP + 1.15, z);
    addShatterDecor(seg, obstacles, top, mat, accentHex);
  }
}

function addFloorCrystals(
  seg: Segment,
  obstacles: Obstacle[],
  mats: MaterialFactories,
  accentHex: number,
) {
  for (let i = 0; i < 3; i++) {
    const z = -SEG_LEN / 2 + (SEG_LEN * (i + 0.5)) / 3;
    for (const sx of [-1, 1]) {
      const py = new THREE.Mesh(
        new THREE.ConeGeometry(0.3, 0.7, 4),
        mats.crystal(),
      );
      py.position.set(sx * rnd(1.4, 3.2), 0.35, z);
      py.rotation.y = Math.PI / 4;
      addObstacle(seg, py, obstacles, {
        type: "crystal",
        crystal: true,
        fragColor: accentHex,
        update: (dt, ob) => {
          ob.mesh.rotation.y += dt * 1.0;
        },
      });
    }
  }
}

export function cullSegments(
  scene: THREE.Scene,
  cameraZ: number,
  state: SegmentState,
  shared: {
    geo: SharedGeometries;
    mat: import("../rendering/materials").SharedMaterials;
  },
) {
  for (let i = state.segments.length - 1; i >= 0; i--) {
    const s = state.segments[i];
    if (s.z > cameraZ + CULL_BEHIND) {
      for (const o of s.obstacles.slice()) {
        if (o.cleanup) o.cleanup();
        removeFromArray(state.obstacles, o);
      }
      disposeGroup(s.group, shared);
      scene.remove(s.group);
      state.segments.splice(i, 1);
    }
  }
}

/** Per-frame obstacle movement (pendulums, sliding doors, etc.). */
export function updateObstacles(dt: number, obstacles: Obstacle[]) {
  for (const o of obstacles) {
    if (o.broken) continue;
    if (o.update) o.update(dt, o);
  }
}

const _obPos = new THREE.Vector3();
const _obBox = new THREE.Box3();
const _obSize = new THREE.Vector3();

/**
 * Avatar-vs-obstacle resolution (weave model). When an obstacle reaches the
 * avatar's depth plane and overlaps it laterally/vertically:
 *   - crystal / powerup → pickup,
 *   - path-blocking hazard (solid, or breakable not yet cleared) → crash,
 *   - anything else → woven past (no effect).
 * Decorative geometry (not blocksCenter, not a pickup) never crashes.
 */
export function checkAvatarCollision(
  avatarPos: THREE.Vector3,
  hitX: number, // player hit-box half-extents (X / Y), and Z band base
  hitY: number,
  hitZ: number,
  obstacles: Obstacle[],
  onCrash: (o: Obstacle) => void,
  onPickup: (o: Obstacle) => void,
  onGraze: (o: Obstacle) => void,
  getCrashCooldown: () => number,
  zReach = 0, // forward distance covered this frame — widens the band to stop tunnelling
  boostArmourActive = false,
) {
  const cooling = getCrashCooldown() > 0;
  const band = hitZ + Math.max(0, zReach);
  for (const o of obstacles) {
    if (o.broken) continue;
    o.mesh.getWorldPosition(_obPos);
    if (Math.abs(_obPos.z - avatarPos.z) > band) continue;
    if (o._hx === undefined || o._hy === undefined) {
      _obBox.setFromObject(o.mesh);
      _obBox.getSize(_obSize);
      o._hx = _obSize.x / 2;
      o._hy = _obSize.y / 2;
    }
    if (Math.abs(avatarPos.x - _obPos.x) > o._hx + hitX) continue;
    if (Math.abs(avatarPos.y - _obPos.y) > o._hy + hitY) continue;
    if (o.crystal || o.powerup) {
      onPickup(o);
    } else if (boostArmourActive) {
      // With boost armour, both blocksCenter and breakable obstacles shatter cleanly without deceleration!
      if (o.blocksCenter || o.breakable) {
        onGraze(o);
      }
    } else if (o.blocksCenter || o.breakable) {
      // Post-crash i-frames: stay invulnerable AND plough through, shattering whatever
      // you touch, so you clear a path instead of re-crashing the instant they expire.
      if (cooling) onGraze(o);
      else onCrash(o);
    }
  }
}

export function createSegmentState(): SegmentState {
  return {
    segments: [],
    obstacles: [],
    nextSegZ: -SEG_LEN,
    segIndex: 0,
    distance: 0,
    speed: 0,
    gates: [],
    splashMode: false,
  };
}
