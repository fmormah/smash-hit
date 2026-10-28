import type * as THREE from 'three';
import type { MaterialFactories, SharedGeometries } from '../rendering/materials';

export interface Segment {
  z: number;
  group: THREE.Group;
  obstacles: Obstacle[];
  index: number;
}

export interface Obstacle {
  mesh: THREE.Object3D;
  seg: Segment;
  type: string;
  breakable: boolean;
  hp: number;
  maxHp: number;
  blocksCenter: boolean;
  crystal: boolean;
  steel: boolean;
  powerup: number;
  update: ((dt: number, ob: Obstacle) => void) | null;
  broken: boolean;
  t: number;
  base: THREE.Vector3;
  fragColor: number;
  cleanup?: () => void;
  _falling?: boolean;
  _vy?: number;
  _wait?: number;
  /** Cached lateral/vertical half-extents (world AABB) for avatar collision. */
  _hx?: number;
  _hy?: number;
}

export interface Fragment {
  mesh: THREE.Mesh;
  base: THREE.Vector3;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
}

export interface ObstacleOptions {
  type?: string;
  breakable?: boolean;
  hp?: number;
  blocksCenter?: boolean;
  crystal?: boolean;
  steel?: boolean;
  powerup?: number;
  update?: ((dt: number, ob: Obstacle) => void) | null;
  noAdd?: boolean;
  fragColor?: number;
}

export type PatternFn = (
  seg: Segment,
  diff: number,
  obstacles: Obstacle[],
  geo: SharedGeometries,
  mats: MaterialFactories,
  dispose: (mesh: THREE.Object3D) => void,
  camera: THREE.Camera,
) => void;

export interface FragmentCallbacks {
  onPowerup: (value: number) => void;
  onCrystal: () => void;
  onGlassBreak: (points: number, maxHp: number) => void;
  onSteelHit: () => void;
  onReinforcedHit: () => void;
}
