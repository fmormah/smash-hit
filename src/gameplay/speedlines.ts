import * as THREE from 'three';

/**
 * Radial "speed lines" (warp streaks) overlaid in front of the camera.
 * They fade in with the boost amount (ring pass / top speed / gate overdrive)
 * and tint to the power colour.
 * This version uses InstancedMesh with thin 3D boxes that stretch dynamically
 * with speed to create gorgeous, glowing, volumetric warp streaks.
 */
const COUNT = 160; // slightly more lines for a richer, more intense warp effect

export interface SpeedLines {
  obj: THREE.InstancedMesh;
  mat: THREE.MeshBasicMaterial;
  lengths: Float32Array;
  radii: Float32Array;
  angles: Float32Array;
  depths: Float32Array;
}

const _dummy = new THREE.Object3D();

export function createSpeedLines(scene: THREE.Scene): SpeedLines {
  const lengths = new Float32Array(COUNT);
  const radii = new Float32Array(COUNT);
  const angles = new Float32Array(COUNT);
  const depths = new Float32Array(COUNT);

  // A thin, long 3D box geometry
  const geo = new THREE.BoxGeometry(0.015, 0.015, 1.0);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xcfeeff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
  });

  const obj = new THREE.InstancedMesh(geo, mat, COUNT);
  obj.frustumCulled = false;
  obj.renderOrder = 999;
  obj.visible = false;
  scene.add(obj);

  for (let i = 0; i < COUNT; i++) {
    angles[i] = Math.random() * Math.PI * 2;
    radii[i] = 0.25 + Math.random() * 2.8; // spread them radially from the center
    lengths[i] = 1.8 + Math.random() * 4.5;
    depths[i] = -2.0 - Math.random() * 25.0; // distribute along depth in front of camera
  }

  return { obj, mat, lengths, radii, angles, depths };
}

/** Drive the streaks: position in front of the camera, flow towards camera, fade by `amount` (0..1). */
export function updateSpeedLines(sl: SpeedLines, amount: number, color: number, camera: THREE.Camera, dt: number) {
  const on = amount > 0.02;
  sl.obj.visible = on;
  if (!on) return;

  // Volumetric glowing streaks
  sl.mat.opacity = Math.min(1, amount) * 0.95;
  sl.mat.color.setHex(color);

  // Position precisely at camera position and orientation
  sl.obj.position.copy(camera.position);
  sl.obj.quaternion.copy(camera.quaternion);

  // flow speed is scaled by the amount of boost
  const flowSpeed = 45.0 + amount * 35.0;

  for (let i = 0; i < COUNT; i++) {
    sl.depths[i] += flowSpeed * dt;

    // If the streak passes the near viewport limit, reset it to the background
    if (sl.depths[i] > -1.0) {
      sl.angles[i] = Math.random() * Math.PI * 2;
      sl.radii[i] = 0.25 + Math.random() * 3.0;
      sl.lengths[i] = 2.0 + Math.random() * 5.0;
      sl.depths[i] = -28.0 - Math.random() * 5.0; // spawn in deep distance
    }

    const a = sl.angles[i];
    const r = sl.radii[i];
    const len = sl.lengths[i];
    const z = sl.depths[i];

    const ca = Math.cos(a);
    const sa = Math.sin(a);

    // Position the instance relative to the camera
    _dummy.position.set(ca * r, sa * r, z);
    
    // Scale the instance: stretch the Z-axis dynamically based on boost amount to make them look like warp streaks!
    const stretch = 1.0 + amount * 1.8;
    _dummy.scale.set(1.0, 1.0, len * stretch);
    
    // Rotate to align with the direction of travel (pointing straight down Z)
    _dummy.rotation.set(0, 0, a); // roll to match radial angle for a perfect tunnel effect

    _dummy.updateMatrix();
    sl.obj.setMatrixAt(i, _dummy.matrix);
  }

  sl.obj.instanceMatrix.needsUpdate = true;
}
