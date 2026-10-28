import * as THREE from "three";
import { dev } from "../config/runtime";

export interface SharedGeometries {
  pane: THREE.BoxGeometry;
  frag: THREE.BoxGeometry;
  octa: THREE.OctahedronGeometry;
  pillar: THREE.BoxGeometry;
  bob: THREE.IcosahedronGeometry;
  spike: THREE.ConeGeometry;
}

export interface SharedMaterials {
  fragCache: Map<number, THREE.MeshStandardMaterial>;
  sparkCache: Map<number, THREE.MeshBasicMaterial>;
}

export function createSharedGeometries(): SharedGeometries {
  return {
    pane: new THREE.BoxGeometry(1, 1, 0.16),
    frag: new THREE.BoxGeometry(1, 1, 1),
    octa: new THREE.OctahedronGeometry(0.62, 0),
    pillar: new THREE.BoxGeometry(1.1, 1, 1.6),
    bob: new THREE.IcosahedronGeometry(0.85, 0),
    spike: new THREE.ConeGeometry(0.5, 1, 7), // unit-height; scale.y sets length
  };
}

export function createMaterialFactories() {
  return {
    glass: () =>
      new THREE.MeshStandardMaterial({
        color: 0xaef0ff,
        transparent: true,
        opacity: dev.glassOpacity, // dynamically read from dev panel settings
        metalness: 0.0,
        roughness: 0.05,
        envMapIntensity: 1.6,
        emissive: 0x123246,
        emissiveIntensity: 0.55,
        side: THREE.DoubleSide,
      }),
    glassReinf: () =>
      new THREE.MeshStandardMaterial({
        color: 0xbfe0ff,
        transparent: true,
        opacity: Math.min(1, dev.glassOpacity + 0.2), // slightly less transparent for reinforced glass
        metalness: 0.1,
        roughness: 0.12,
        envMapIntensity: 1.3,
        emissive: 0x1a2a55,
        emissiveIntensity: 0.6,
        side: THREE.DoubleSide,
      }),
    steel: () =>
      new THREE.MeshStandardMaterial({
        color: 0x7a8494,
        metalness: 0.95,
        roughness: 0.3,
        envMapIntensity: 1.0,
        side: THREE.DoubleSide,
      }),
    crystal: () =>
      new THREE.MeshStandardMaterial({
        color: 0x9affe0,
        transparent: true,
        opacity: 0.65,
        metalness: 0.2,
        roughness: 0.02,
        envMapIntensity: 1.5,
        emissive: 0x18c98a,
        emissiveIntensity: 1.5,
      }),
  };
}

export function createSharedMaterials(): SharedMaterials {
  return {
    fragCache: new Map(),
    sparkCache: new Map(),
  };
}

export function fragMat(
  color: number,
  cache: Map<number, THREE.MeshStandardMaterial>,
) {
  let m = cache.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      transparent: true,
      opacity: 0.62, // less opaque
      metalness: 0.1,
      roughness: 0.1,
      envMapIntensity: 1.2,
      emissive: color,
      emissiveIntensity: 1.1, // brighter
      toneMapped: false,
    });
    cache.set(color, m);
  }
  return m;
}

export function sparkMat(
  color: number,
  cache: Map<number, THREE.MeshBasicMaterial>,
) {
  let m = cache.get(color);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color });
    cache.set(color, m);
  }
  return m;
}

export type MaterialFactories = ReturnType<typeof createMaterialFactories>;
