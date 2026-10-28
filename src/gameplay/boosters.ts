import * as THREE from 'three';

/**
 * Booster FX lifted from the first game (Crystal-Line's PlayerSystem): two side
 * thrusters, each a soft additive glow cone + a brighter core plume + a nozzle
 * ring, plus a stream of turbulent sparks. Pulses/flickers like plasma. The nose
 * faces −z, so the plumes/sparks stream backward (+z local).
 */
const CYAN = new THREE.Color(0x69faff);
const GLOW_LEN = 3.35;
const PLUME_LEN = 2.35;
const SPARK_COUNT = 160;

export interface Boosters {
  group: THREE.Group;
  sides: THREE.Group[];
  coreMat: THREE.MeshBasicMaterial;
  glowMat: THREE.MeshBasicMaterial;
  sparkMat: THREE.PointsMaterial;
  sparkGeo: THREE.BufferGeometry;
  sparkPos: Float32Array;
  sparkSeeds: Float32Array;
  color: THREE.Color;
}

function makeCone(length: number, radius: number, mat: THREE.Material, renderOrder: number) {
  const cone = new THREE.Mesh(new THREE.ConeGeometry(radius, length, 24, 1, true), mat);
  cone.position.set(0, 0, length * 0.5); // wide base at the nozzle, tip tapering behind (+z)
  cone.rotation.x = Math.PI / 2;
  cone.renderOrder = renderOrder;
  return cone;
}

export function createBoosters(parent: THREE.Object3D): Boosters {
  const group = new THREE.Group();
  const coreMat = new THREE.MeshBasicMaterial({
    color: CYAN.clone(),
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const glowMat = new THREE.MeshBasicMaterial({
    color: CYAN.clone(),
    transparent: true,
    opacity: 0.25,
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const sparkMat = new THREE.PointsMaterial({
    color: CYAN.clone(),
    size: 0.12,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
    toneMapped: false,
  });

  const sides: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const sg = new THREE.Group();
    sg.userData.side = side;
    sg.add(
      makeCone(GLOW_LEN, 0.48, glowMat, 3),
      makeCone(PLUME_LEN, 0.2, coreMat, 4),
      new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.028, 8, 32), coreMat),
    );
    sides.push(sg);
    group.add(sg);
  }

  const sparkPos = new Float32Array(SPARK_COUNT * 3);
  const sparkSeeds = new Float32Array(SPARK_COUNT * 4);
  for (let i = 0; i < SPARK_COUNT; i++) {
    const s = i * 4;
    sparkSeeds[s] = i % 2 === 0 ? -1 : 1;
    sparkSeeds[s + 1] = Math.random() * 2 - 1;
    sparkSeeds[s + 2] = Math.random() * 2 - 1;
    sparkSeeds[s + 3] = Math.random();
  }
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  sparks.renderOrder = 5;
  group.add(sparks);

  parent.add(group);
  return { group, sides, coreMat, glowMat, sparkMat, sparkGeo, sparkPos, sparkSeeds, color: new THREE.Color(CYAN) };
}

export function setBoosterColor(b: Boosters, hex: number) {
  b.color.setHex(hex);
}

/** Per-frame thruster animation. `amount` (0..1) is the flare strength (0 = hidden). */
export function updateBoosters(
  b: Boosters,
  elapsed: number,
  bx: number,
  by: number,
  bz: number,
  amount: number,
) {
  b.group.visible = amount > 0.02;
  if (!b.group.visible) return;
  for (const sg of b.sides) {
    const side = sg.userData.side as number;
    sg.position.set(side * bx, by, bz);
  }

  const pulse = 0.5 + Math.sin(elapsed * 36) * 0.5;
  const col = b.color.clone().lerp(CYAN, 0.6);
  b.coreMat.color.copy(col);
  b.glowMat.color.copy(col);
  b.sparkMat.color.copy(col);
  b.coreMat.opacity = amount * (0.42 + pulse * 0.14);
  b.glowMat.opacity = amount * (0.24 + pulse * 0.1);
  b.sparkMat.opacity = amount * 0.5;
  b.sparkMat.size = 0.06 + amount * 0.08;

  const flicker = 1.0 + Math.sin(elapsed * 80) * 0.07;
  b.group.scale.set(
    1.0 + Math.sin(elapsed * 60) * 0.02,
    1.0 + Math.cos(elapsed * 55) * 0.02,
    (1 + amount * 0.34) * flicker,
  );

  const trailLen = 2.8 + amount * 3.3;
  const speed = 0.82 + amount * 2.5;
  for (let i = 0; i < SPARK_COUNT; i++) {
    const s = i * 4;
    const p = i * 3;
    const side = b.sparkSeeds[s];
    const phase = (b.sparkSeeds[s + 3] + elapsed * speed) % 1;
    const spread = 0.07 + phase * (0.4 + amount * 0.3);
    const tX = Math.sin(phase * 12 + b.sparkSeeds[s + 2] * 4) * 0.07;
    const tY = Math.cos(phase * 12 + b.sparkSeeds[s + 1] * 4) * 0.07;
    b.sparkPos[p] = side * bx + b.sparkSeeds[s + 1] * spread + tX;
    b.sparkPos[p + 1] =
      by + b.sparkSeeds[s + 2] * spread * 0.55 +
      Math.sin((phase + b.sparkSeeds[s + 3]) * Math.PI * 2) * 0.035 + tY;
    b.sparkPos[p + 2] = bz + 0.25 + phase * trailLen;
  }
  b.sparkGeo.getAttribute('position').needsUpdate = true;
}
