import type * as THREE from "three";
import type { SharedGeometries, SharedMaterials } from "../rendering/materials";

export function disposeMeshResources(
  mesh: THREE.Object3D,
  shared: { geo: SharedGeometries; mat: SharedMaterials },
) {
  const m = mesh as THREE.Mesh;
  if (m.geometry && !isSharedGeo(m.geometry, shared.geo)) m.geometry.dispose();
  if (m.material && !isSharedMat(m.material, shared.mat)) {
    if (Array.isArray(m.material)) m.material.forEach((mat) => mat.dispose());
    else m.material.dispose();
  }
}

export function disposeGroup(
  group: THREE.Object3D,
  shared: { geo: SharedGeometries; mat: SharedMaterials },
) {
  group.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) disposeMeshResources(child, shared);
  });
}

function isSharedGeo(geometry: THREE.BufferGeometry, geo: SharedGeometries) {
  return Object.values(geo).includes(geometry);
}

function isSharedMat(
  material: THREE.Material | THREE.Material[],
  mat: SharedMaterials,
) {
  if (Array.isArray(material)) return false;
  for (const v of mat.fragCache.values()) if (v === material) return true;
  for (const v of mat.sparkCache.values()) if (v === material) return true;
  return false;
}
