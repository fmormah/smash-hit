import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import crystalUrl from '../assets/crystal.glb';
import { EYE_Y, PATH_HALF } from '../config/constants';
import { dev } from '../config/runtime';
import type { Segment } from '../types';

/**
 * Level/biome gate (ported from the first game): a large, SHINY metallic crystal
 * the player flies through. The shine comes from a PMREM-baked room environment
 * (real reflections) plus a twinkling glitter shader across the facets — exactly
 * how Crystal-Line Drifter's gateway crystal is done.
 */
let gateEnvMap: THREE.Texture | null = null;
/** Supply the baked room env map (call once from the Game with the renderer). */
export function setGateEnv(env: THREE.Texture) {
  gateEnvMap = env;
}
/** Shared glitter time — the Game advances .value each frame. */
export const gateGlitter = { value: 0 };

// Twinkling glitter injected into the crystal's standard material (from Crystal-Line):
// sparse, view-dependent specks that sparkle in/out across the facets.
const GLITTER_GLSL = `
float gHash(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float glitter(vec3 p, float t){
  vec3 ip = floor(p);
  float r = gHash(ip);
  float r2 = gHash(ip + 11.3);
  float twinkle = sin(t * 7.0 + r * 6.2831) * 0.5 + 0.5;
  float spark = step(0.90, r) * pow(twinkle, 8.0);
  float twinkle2 = sin(t * 13.0 + r2 * 6.2831) * 0.5 + 0.5;
  spark += step(0.94, r2) * pow(twinkle2, 10.0) * 0.7;
  return spark;
}
`;

let crystalProto: THREE.Object3D | null = null;
new GLTFLoader()
  .loadAsync(crystalUrl)
  .then((g) => {
    crystalProto = g.scene;
  })
  .catch(() => {
    /* no gate model — gates fall back to just the banner */
  });

const _box = new THREE.Box3();
const _size = new THREE.Vector3();

export function addCrystalGate(seg: Segment, accentHex: number) {
  if (!crystalProto) return;
  const model = crystalProto.clone(true);
  _box.setFromObject(model);
  _box.getSize(_size);
  const w = _size.x || 1;
  // span the corridor (local units — the segment group's worldScale applies on top).
  const targetW = PATH_HALF * 2 * 1.85 * 1.5;
  model.scale.setScalar(targetW / w);

  // Translucent, highly metallic crystal — reflects the baked room env for real
  // shine, faint accent tint, and twinkling glitter on the facets.
  const mat = new THREE.MeshStandardMaterial({
    color: accentHex,
    metalness: 0.95,
    roughness: 0.07,
    envMap: gateEnvMap,
    envMapIntensity: 1.7,
    emissive: accentHex,
    emissiveIntensity: 0.22,
    toneMapped: true,
    transparent: true,
    opacity: 0.92,
    depthWrite: true,
    fog: false,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uGlitterTime = gateGlitter;
    shader.fragmentShader =
      'uniform float uGlitterTime;\n' +
      GLITTER_GLSL +
      shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
         {
           vec3 gp = vNormal * 9.0 + normalize(vViewPosition) * 5.0;
           float spark = glitter(gp, uGlitterTime);
           totalEmissiveRadiance += vec3(spark) * 2.2;
         }`,
      );
  };

  model.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).material = mat;
  });
  // centred on the lane, raised up a bit above the eye-line to be framed majestically
  model.position.set(0, (EYE_Y + 1.5) / dev.worldScale, 0);
  seg.group.add(model);
}
