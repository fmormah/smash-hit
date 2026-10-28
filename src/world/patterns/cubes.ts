import * as THREE from "three";
import { OBS_TOP, PATH_HALF, SEG_LEN } from "../../config/constants";
import { dev } from "../../config/runtime";
import type {
  MaterialFactories,
  SharedGeometries,
} from "../../rendering/materials";
import { choice, rnd } from "../../utils/random";
import type { Obstacle, Segment } from "../../types";
import { addObstacle, coversCenter } from "../obstacle-helpers";

/**
 * Stationary CUBE obstacles — the GamesCom canyon's signature hazard. Full obstacles
 * (breakable, missile-targetable, crash-on-contact when they cover the lane) in four
 * sizes. `cubeField` populates the ground; `overheadBlocks` hangs high so a player
 * parked at the top of the screen is still threatened. Colour comes from
 * `dev.obstacleColor` so it stays independent of the level palette.
 */

type CubeSize = { w: number; h: number; d: number };

// sizes roughly relative to the player: half / double / quadruple / tower
const SIZES: Record<"small" | "medium" | "large" | "tower", CubeSize> = {
  small: { w: 0.9, h: 0.9, d: 0.9 },
  medium: { w: 2.2, h: 2.2, d: 2.2 },
  large: { w: 3.8, h: 3.8, d: 3.8 },
  tower: { w: 2.4, h: OBS_TOP + 4, d: 2.4 },
};
const ALL_SIZES = ["small", "medium", "large", "tower"] as const;

function makeCube(key: keyof typeof SIZES) {
  const s = SIZES[key];
  return new THREE.Mesh(
    new THREE.BoxGeometry(s.w, s.h, s.d),
    new THREE.MeshStandardMaterial({
      color: dev.obstacleColor,
      metalness: 0.35,
      roughness: 0.55,
      envMapIntensity: 1.0,
    }),
  );
}

function addCube(
  seg: Segment,
  obstacles: Obstacle[],
  x: number,
  y: number,
  z: number,
  key: keyof typeof SIZES,
): Obstacle {
  const mesh = makeCube(key);
  mesh.position.set(x, y, z);
  mesh.rotation.y = rnd(-0.12, 0.12);
  const o = addObstacle(seg, mesh, obstacles, {
    breakable: true,
    fragColor: 0xdfeaf2,
  });
  o.blocksCenter = coversCenter(o.mesh);
  return o;
}

/** Ground-standing cubes, arranged a few different ways. */
function cubeField(
  seg: Segment,
  diff: number,
  obstacles: Obstacle[],
  _geo: SharedGeometries,
  _mats: MaterialFactories,
) {
  const reach = PATH_HALF + 1.8;
  const zMid = rnd(-SEG_LEN * 0.18, SEG_LEN * 0.18);
  const onFloor = (key: keyof typeof SIZES) => SIZES[key].h / 2 - 0.1; // base on floor

  const arrangement = choice([
    "solo",
    "cluster",
    "line",
    "scatter",
    "gate",
    "line", // weight "line" higher — the signature ground path-blocker
  ]);

  switch (arrangement) {
    case "solo": {
      const key = choice([...ALL_SIZES]);
      addCube(seg, obstacles, rnd(-reach, reach), onFloor(key), zMid, key);
      break;
    }
    case "cluster": {
      const cx = rnd(-reach * 0.6, reach * 0.6);
      const n = 3 + ((Math.random() * 3) | 0);
      for (let i = 0; i < n; i++) {
        const key = choice(["small", "small", "medium", "large"] as const);
        addCube(
          seg,
          obstacles,
          cx + rnd(-2.4, 2.4),
          onFloor(key),
          zMid + rnd(-3.5, 3.5),
          key,
        );
      }
      break;
    }
    case "line": {
      // a row across the ground floor with a single gap to fly through
      const slots = 5 + ((Math.random() * 2) | 0);
      const gap = (Math.random() * slots) | 0;
      const key = choice(["medium", "medium", "large"] as const);
      for (let i = 0; i < slots; i++) {
        if (i === gap) continue;
        const x = -reach + (2 * reach * i) / (slots - 1);
        addCube(seg, obstacles, x, onFloor(key), zMid, key);
      }
      break;
    }
    case "gate": {
      const half = rnd(1.4, 2.6);
      const key = choice(["large", "tower"] as const);
      addCube(seg, obstacles, -half - SIZES[key].w / 2, onFloor(key), zMid, key);
      addCube(seg, obstacles, half + SIZES[key].w / 2, onFloor(key), zMid, key);
      break;
    }
    default: {
      const n = 3 + ((diff * 3) | 0) + ((Math.random() * 2) | 0);
      for (let i = 0; i < n; i++) {
        const key = choice([...ALL_SIZES]);
        addCube(
          seg,
          obstacles,
          rnd(-reach, reach),
          onFloor(key),
          rnd(-SEG_LEN * 0.4, SEG_LEN * 0.4),
          key,
        );
      }
    }
  }
}

/**
 * High-hanging cubes that threaten a player who's parked at the TOP of the screen.
 * A row up high (with a gap), so flying high is no longer safe — you must drop into
 * the gap or weave back down.
 */
function overheadBlocks(
  seg: Segment,
  _diff: number,
  obstacles: Obstacle[],
  _geo: SharedGeometries,
  _mats: MaterialFactories,
) {
  const reach = PATH_HALF + 1.8;
  const zMid = rnd(-SEG_LEN * 0.18, SEG_LEN * 0.18);
  const y = rnd(OBS_TOP + 1.5, OBS_TOP + 6.5); // high in the play space
  const slots = 4 + ((Math.random() * 3) | 0);
  const gap = (Math.random() * slots) | 0;
  for (let i = 0; i < slots; i++) {
    if (i === gap) continue;
    const key = choice(["medium", "medium", "large"] as const);
    const x = -reach + (2 * reach * i) / (slots - 1);
    addCube(seg, obstacles, x, y, zMid, key);
  }
}

export { cubeField, overheadBlocks };
