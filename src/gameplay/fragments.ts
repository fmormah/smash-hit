import * as THREE from 'three';
import { GRAVITY, MAX_FRAGMENTS } from '../config/constants';
import { dev, gamescom } from '../config/runtime';
import type { SharedGeometries, SharedMaterials } from '../rendering/materials';
import { fragMat, sparkMat } from '../rendering/materials';
import { rnd } from '../utils/random';
import type { Fragment, FragmentCallbacks, Obstacle } from '../types';
import { removeObstacle } from '../world/obstacle-helpers';
import { playShatter } from '../audio/sfx';

const FADE = 0.4;
/** Triangular shard geometry (mixed with the box "rectangle" shards). */
const TRI_GEO = new THREE.TetrahedronGeometry(0.7, 0);

/** Free up space so a fresh burst ALWAYS spawns (the shatter must never be skipped). */
function ensureFragmentRoom(scene: THREE.Scene, fragments: Fragment[], need: number) {
  const max = MAX_FRAGMENTS;
  while (fragments.length && fragments.length + need > max) {
    const old = fragments.shift()!;
    scene.remove(old.mesh);
  }
}

/**
 * Shatter a rectangle of (w × h) into a cloud of thin shards.
 * `density` scales the shard count (× dev.fragVolume); `lifeScale` stretches how
 * long they live (used so the crash hitstop can last exactly as long as the burst).
 * Returns the longest shard lifetime spawned.
 */
export function spawnFragments(
  scene: THREE.Scene,
  center: THREE.Vector3,
  w: number,
  h: number,
  color: number,
  fragments: Fragment[],
  geo: SharedGeometries,
  shared: SharedMaterials,
  density = 1,
  lifeScale = 1,
  boostArmourActive = false,
  blast = false,
  playerSpeed = 0, // live craft speed — non-freeze shards are carried forward by it so
  //                  they linger in view instead of blowing past the racing camera
): number {
  const dens = Math.max(0.3, dev.fragVolume * density);
  // Slightly fewer, but larger shards for a chunkier, more satisfying smash.
  const cols = Math.min(16, Math.max(4, Math.round(w * 2.3 * Math.sqrt(dens))));
  const rows = Math.min(16, Math.max(4, Math.round(h * 2.3 * Math.sqrt(dens))));
  const fw = w / cols;
  const fh = h / rows;
  const mat = fragMat(color, shared.fragCache);
  ensureFragmentRoom(scene, fragments, cols * rows);
  let maxLife = 0;
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) {
      if (fragments.length >= MAX_FRAGMENTS) return maxLife;
      // Mix of rectangular (box) and triangular (tetra) shards.
      const isRect = Math.random() < 0.55;
      const m = new THREE.Mesh(isRect ? geo.frag : TRI_GEO, mat);
      const ox = (i + 0.5) / cols - 0.5;
      const oy = (j + 0.5) / rows - 0.5;
      // Slightly bigger, chunkier shards that read clearly as heavy glass fragments.
      const base = isRect
        ? new THREE.Vector3(fw * rnd(0.8, 1.35), fh * rnd(0.8, 1.35), rnd(0.03, 0.08))
        : new THREE.Vector3().setScalar(Math.min(fw, fh) * rnd(0.8, 1.3));
      m.scale.copy(base);
      m.position.set(center.x + ox * w, center.y + oy * h, center.z + rnd(-0.1, 0.1));
      m.rotation.set(rnd(0, Math.PI * 2), rnd(0, Math.PI * 2), rnd(0, Math.PI * 2)); // varying angles
      scene.add(m);
      const life = rnd(0.45, 0.85) * lifeScale;
      if (life > maxLife) maxLife = life;

      let velX: number;
      let velY: number;
      let velZ: number;
      if (blast) {
        // Missile shockwave: shards blast RADIALLY outward, and travel WITH the camera
        // (matching its forward speed, ± a little depth spread) so the burst hangs in
        // view for its whole life instead of the fast camera blowing past it.
        const len = Math.hypot(ox, oy) || 0.001;
        const speed = rnd(16, 34);
        velX = (ox / len) * speed;
        velY = (oy / len) * speed + rnd(0, 4);
        velZ = playerSpeed > 1 ? -playerSpeed + rnd(-10, 10) : rnd(-5, 8);
      } else if (boostArmourActive) {
        // Boost-armour smash: shards ride WITH the craft (≈ camera speed, ± a touch) so
        // they hang in front of you and spread into a cone — clearly visible at ANY
        // speed, instead of the old fixed velocity that the fast camera outran.
        const speedZBase = dev.boostArmourFragSpeed;
        velZ = playerSpeed > 1 ? -playerSpeed + rnd(-12, 12) : rnd(speedZBase * 0.55, speedZBase * 1.45);
        const speedMul = speedZBase / 26.0;
        velX = ox * rnd(6, 16) * speedMul;
        velY = oy * rnd(5, 12) * speedMul + rnd(2, 6) * speedMul;
      } else {
        velZ = rnd(1, 6);
        velX = ox * rnd(3, 8);
        velY = oy * rnd(2, 6) + rnd(1, 3);
      }

      fragments.push({
        mesh: m,
        base,
        vel: new THREE.Vector3(velX, velY, velZ),
        spin: new THREE.Vector3(rnd(-9, 9), rnd(-9, 9), rnd(-9, 9)),
        life,
      });
    }
  return maxLife;
}

export function sparkBurst(
  scene: THREE.Scene,
  pos: THREE.Vector3,
  color: number,
  n: number,
  fragments: Fragment[],
  geo: SharedGeometries,
  shared: SharedMaterials,
) {
  const mat = sparkMat(color, shared.sparkCache);
  for (let i = 0; i < n; i++) {
    if (fragments.length >= MAX_FRAGMENTS) return;
    const m = new THREE.Mesh(geo.frag, mat);
    const base = new THREE.Vector3().setScalar(rnd(0.05, 0.16));
    m.scale.copy(base);
    m.position.copy(pos);
    scene.add(m);
    const dir = new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize();
    fragments.push({
      mesh: m,
      base,
      vel: dir.multiplyScalar(rnd(3, 9)),
      spin: new THREE.Vector3(rnd(-10, 10), rnd(-10, 10), rnd(-10, 10)),
      life: rnd(0.3, 0.7),
    });
  }
}

export function updateFragments(dt: number, fragments: Fragment[], scene: THREE.Scene) {
  for (let i = fragments.length - 1; i >= 0; i--) {
    const f = fragments[i];
    f.life -= dt;
    f.vel.y -= GRAVITY * dt;
    f.mesh.position.addScaledVector(f.vel, dt);
    f.mesh.rotation.x += f.spin.x * dt;
    f.mesh.rotation.y += f.spin.y * dt;
    f.mesh.rotation.z += f.spin.z * dt;
    if (f.life < FADE) f.mesh.scale.copy(f.base).multiplyScalar(Math.max(0.001, f.life / FADE));
    if (f.life <= 0 || f.mesh.position.y < -12) { // Allow deeper falling of fragments in void biomes
      scene.remove(f.mesh);
      fragments.splice(i, 1);
    }
  }
}

/** Snap explosion for scatter missiles. Snappy, fast-decaying, high-energy colored spark ring. */
export function missileExplosion(
  scene: THREE.Scene,
  pos: THREE.Vector3,
  color: number,
  fragments: Fragment[],
  geo: SharedGeometries,
  shared: SharedMaterials,
) {
  if (!dev.missileExplosions) return;
  const mat = sparkMat(color, shared.sparkCache);
  const sparkCount = 28;
  for (let i = 0; i < sparkCount; i++) {
    if (fragments.length >= MAX_FRAGMENTS) return;
    const m = new THREE.Mesh(geo.frag, mat);
    const size = rnd(0.08, 0.22);
    const base = new THREE.Vector3().setScalar(size);
    m.scale.copy(base);
    m.position.copy(pos);
    scene.add(m);
    
    // Snappy expansion velocity vector
    const dir = new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize();
    const speed = rnd(12, 28); // super fast snappy outwards pop
    
    fragments.push({
      mesh: m,
      base,
      vel: dir.multiplyScalar(speed),
      spin: new THREE.Vector3(rnd(-15, 15), rnd(-15, 15), rnd(-15, 15)),
      life: rnd(0.18, 0.42), // short-lived, crisp explosion sparks
    });
  }
}

export function shatter(
  o: Obstacle,
  scene: THREE.Scene,
  fragments: Fragment[],
  geo: SharedGeometries,
  shared: SharedMaterials,
  obstacles: Obstacle[],
  dispose: (mesh: THREE.Object3D) => void,
  callbacks: FragmentCallbacks,
  boostArmourActive = false,
  blast = false,
  playerSpeed = 0,
) {
  o.broken = true;
  const mesh = o.mesh as THREE.Mesh;
  mesh.updateWorldMatrix(true, false);
  const center = new THREE.Vector3();
  mesh.getWorldPosition(center);
  const box = new THREE.Box3().setFromObject(mesh);
  const sx = Math.max(0.4, box.max.x - box.min.x);
  const sy = Math.max(0.4, box.max.y - box.min.y);

  if (o.powerup) {
    callbacks.onPowerup(o.powerup);
    if (!gamescom.enabled)
      sparkBurst(scene, center, 0xbfeaff, 28, fragments, geo, shared);
  } else if (o.crystal) {
    callbacks.onCrystal();
    if (!gamescom.enabled)
      sparkBurst(scene, center, 0x9affe0, 24, fragments, geo, shared);
  } else {
    callbacks.onGlassBreak(o.maxHp >= 2 ? 25 : 12, o.maxHp);
    if (!gamescom.enabled) {
      const dens = boostArmourActive ? dev.boostArmourFragMultiplier : blast ? 1.3 : 1.0;
      spawnFragments(scene, center, sx, sy, o.fragColor, fragments, geo, shared, dens, 1.0, boostArmourActive, blast, playerSpeed);
      playShatter(center, sx > 2.5 || sy > 2.5, o.maxHp >= 2); // distance-attenuated glass break
      // a bright, snappy spark pop punctuates the missile impact shockwave!
      if (blast) {
        if (dev.missileExplosions) {
          missileExplosion(scene, center, o.fragColor, fragments, geo, shared);
        } else {
          sparkBurst(scene, center, o.fragColor, 18, fragments, geo, shared);
        }
      }
    }
  }
  removeObstacle(o, obstacles, dispose);
}
