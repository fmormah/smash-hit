import defaultState from "../config/default-state.json";
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CULL_BEHIND, DISTANCE_SCALE, EYE_Y, SPAWN_AHEAD } from '../config/constants';
import { gamesComChapterFor, isGamesComPlayMode } from '../config/gamescom-levels';
import { dev, gamescom } from '../config/runtime';
import { laneAt } from '../world/path';
import { steerBounds } from './avatar';
import crystalUrl from '../assets/crystal.glb';

// The centre crystal of a crystal ring (loaded once, cloned per ring).
let crystalProto: THREE.Object3D | null = null;
new GLTFLoader()
  .loadAsync(crystalUrl)
  .then((g) => {
    crystalProto = g.scene;
  })
  .catch(() => {
    /* fall back to a procedural octahedron gem */
  });

/**
 * Boost rings (fused build): pass-through hoops along the path. Flying through one
 * surges your speed and retunes your power colour. Once per zone, a normal ring slot
 * is randomly upgraded to a CRYSTAL RING — a bigger, crystal-gem hoop with two
 * electron orbs trailing ribbons, in the zone's pickup colour. Taking it grants a
 * speed boost that lasts to the end of the zone (and big points).
 */
export const RING_COLORS = [...defaultState.colors.ringColors]; // R B Y G
const RING_SPACING = 64; // z-units between rings
const RING_RADIUS = 3.6;
const CRYSTAL_RADIUS = RING_RADIUS * 1.25; // 25% bigger
const ORBIT_R = CRYSTAL_RADIUS * 0.96; // electron orbit radius
const TRAIL_LEN = 16; // electron ribbon trail points

interface Electron {
  orb: THREE.Mesh;
  trail: THREE.Line;
  pts: Float32Array;
  ang: number;
  spd: number;
  u: THREE.Vector3; // orbit-plane basis
  v: THREE.Vector3;
}

export interface RingObj {
  mesh: THREE.Object3D; // torus (normal) or group (crystal)
  z: number;
  color: number;
  radius: number;
  crystal: boolean;
  passed: boolean;
  ox: number;
  oy: number;
  phase: number;
  gem?: THREE.Object3D;
  electrons?: Electron[];
  expanding?: boolean;
  expandT?: number;
  magnetized?: boolean; // pickup magnet has grabbed it — now flying to the player
  magnetTrail?: MagnetTrail; // 3D ribbon streak drawn behind it while flying in
}

const RING_FLIP_FAR = 95;
const RING_FLIP_NEAR = 24;
// How fast a magnetised pickup is reeled into the player (fraction of remaining
// gap closed per second). Strong enough to out-pace the craft and make contact.
const MAGNET_PULL = 11;

// --- magnet streak: a short camera-facing tapered ribbon trailing a pickup as it
// flies into the player (head at the pickup, tapering + fading to the tail) ---
const MAGNET_TRAIL_LEN = 18;
export interface MagnetTrail {
  mesh: THREE.Mesh;
  pts: Float32Array; // centreline world-position history (head = newest)
  width: number; // head half-width
  seeded: boolean;
}
const _mtCur = new THREE.Vector3();
const _mtNext = new THREE.Vector3();
const _mtDir = new THREE.Vector3();
const _mtView = new THREE.Vector3();
const _mtSide = new THREE.Vector3();
const _mtCol = new THREE.Color();

function createMagnetTrail(
  scene: THREE.Scene,
  width: number,
): MagnetTrail {
  const pts = new Float32Array(MAGNET_TRAIL_LEN * 3);
  const pos = new Float32Array(MAGNET_TRAIL_LEN * 2 * 3);
  const col = new Float32Array(MAGNET_TRAIL_LEN * 2 * 3);
  const idx: number[] = [];
  for (let i = 0; i < MAGNET_TRAIL_LEN - 1; i++) {
    const v0 = i * 2, v1 = i * 2 + 1, v2 = (i + 1) * 2, v3 = (i + 1) * 2 + 1;
    idx.push(v0, v1, v2, v1, v3, v2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  mesh.frustumCulled = false;
  scene.add(mesh);
  return { mesh, pts, width, seeded: false };
}

function updateMagnetTrail(
  t: MagnetTrail,
  head: THREE.Vector3,
  color: number,
  camera: THREE.PerspectiveCamera,
) {
  const pts = t.pts;
  if (!t.seeded) {
    for (let i = 0; i < MAGNET_TRAIL_LEN; i++) {
      pts[i * 3] = head.x;
      pts[i * 3 + 1] = head.y;
      pts[i * 3 + 2] = head.z;
    }
    t.seeded = true;
  } else {
    pts.copyWithin(0, 3); // shift history toward the tail
    const last = (MAGNET_TRAIL_LEN - 1) * 3;
    pts[last] = head.x;
    pts[last + 1] = head.y;
    pts[last + 2] = head.z;
  }
  const pos = t.mesh.geometry.attributes.position.array as Float32Array;
  const col = t.mesh.geometry.attributes.color.array as Float32Array;
  _mtCol.setHex(color);
  for (let i = 0; i < MAGNET_TRAIL_LEN; i++) {
    const ci = i * 3;
    _mtCur.set(pts[ci], pts[ci + 1], pts[ci + 2]);
    if (i < MAGNET_TRAIL_LEN - 1) {
      _mtNext.set(pts[ci + 3], pts[ci + 4], pts[ci + 5]);
      _mtDir.subVectors(_mtNext, _mtCur);
    } else if (i > 0) {
      _mtDir.set(pts[ci] - pts[ci - 3], pts[ci + 1] - pts[ci - 2], pts[ci + 2] - pts[ci - 1]);
    } else {
      _mtDir.set(0, 0, -1);
    }
    if (_mtDir.lengthSq() < 1e-8) _mtDir.set(0, 0, -1);
    _mtDir.normalize();
    _mtView.subVectors(camera.position, _mtCur).normalize();
    _mtSide.crossVectors(_mtDir, _mtView).normalize(); // camera-facing ribbon
    if (_mtSide.lengthSq() < 1e-6) _mtSide.set(1, 0, 0);
    const tt = i / (MAGNET_TRAIL_LEN - 1); // 0 = tail, 1 = head (at the pickup)
    const hw = t.width * tt; // taper to a point at the tail
    const L = i * 2 * 3, R = (i * 2 + 1) * 3;
    pos[L] = _mtCur.x + _mtSide.x * hw;
    pos[L + 1] = _mtCur.y + _mtSide.y * hw;
    pos[L + 2] = _mtCur.z + _mtSide.z * hw;
    pos[R] = _mtCur.x - _mtSide.x * hw;
    pos[R + 1] = _mtCur.y - _mtSide.y * hw;
    pos[R + 2] = _mtCur.z - _mtSide.z * hw;
    const intensity = tt * tt; // bright at the head, fading down the tail
    const r = _mtCol.r * intensity, g = _mtCol.g * intensity, bl = _mtCol.b * intensity;
    col[L] = r; col[L + 1] = g; col[L + 2] = bl;
    col[R] = r; col[R + 1] = g; col[R + 2] = bl;
  }
  t.mesh.geometry.attributes.position.needsUpdate = true;
  t.mesh.geometry.attributes.color.needsUpdate = true;
}

function disposeMagnetTrail(scene: THREE.Scene, r: RingObj) {
  if (!r.magnetTrail) return;
  scene.remove(r.magnetTrail.mesh);
  r.magnetTrail.mesh.geometry.dispose();
  (r.magnetTrail.mesh.material as THREE.Material).dispose();
  r.magnetTrail = undefined;
}
const _dummy = new THREE.Object3D();
const _faceQ = new THREE.Quaternion();
const _tumbleE = new THREE.Euler();
const _tumbleQ = new THREE.Quaternion();
const _ev = new THREE.Vector3();

export interface RingState {
  rings: RingObj[];
  nextZ: number;
  colorIdx: number;
  geo: THREE.TorusGeometry; // normal hoop
  crystalGeo: THREE.TorusGeometry; // bigger hoop
  gemGeo: THREE.OctahedronGeometry;
  orbGeo: THREE.SphereGeometry;
  zone: number;
  zoneRingIdx: number;
  crystalCount: number; // running count of crystals placed (cycles the R/B/Y/G colour)
}

export function createRingState(): RingState {
  return {
    rings: [],
    nextZ: -RING_SPACING,
    colorIdx: 0,
    geo: new THREE.TorusGeometry(RING_RADIUS, 0.24, 10, 32),
    crystalGeo: new THREE.TorusGeometry(CRYSTAL_RADIUS, 0.32, 12, 36),
    gemGeo: new THREE.OctahedronGeometry(1.7, 0),
    orbGeo: new THREE.SphereGeometry(0.26, 12, 10),
    zone: -1,
    zoneRingIdx: 0,
    crystalCount: 0,
  };
}

export function resetRings(scene: THREE.Scene, state: RingState) {
  for (const r of state.rings) {
    disposeMagnetTrail(scene, r);
    scene.remove(r.mesh);
  }
  state.rings.length = 0;
  state.nextZ = -RING_SPACING;
  state.colorIdx = 0;
  state.zone = -1;
  state.zoneRingIdx = 0;
  state.crystalCount = 0;
}

/** A crystal ring every N rings (spread through the level), instead of one per zone. */
const CRYSTAL_EVERY = 5;

/** The centre crystal gem (crystal.glb), tinted + glowing. `sizeUnits` = target size. */
function buildGem(state: RingState, color: number, sizeUnits: number): THREE.Object3D {
  const gemMat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 1.8, // intense glow so it reads as a majestic power-up
    metalness: 0.25,
    roughness: 0.08,
    toneMapped: false,
    transparent: true,
    opacity: 1.0,
  });
  gemMat.userData.baseOpacity = 1.0;
  if (crystalProto) {
    const gem = crystalProto.clone(true);
    const box = new THREE.Box3().setFromObject(gem);
    const sz = new THREE.Vector3();
    box.getSize(sz);
    gem.scale.setScalar(sizeUnits / Math.max(sz.x, sz.y, sz.z, 0.001));
    gem.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).material = gemMat;
    });
    return gem;
  }
  return new THREE.Mesh(state.gemGeo, gemMat);
}

/** Build the special crystal ring: bigger hoop + white-edged gem + 2 electrons. */
function buildCrystalRing(state: RingState, color: number) {
  const group = new THREE.Group();

  const hoopMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, toneMapped: false });
  hoopMat.userData.baseOpacity = 0.9;
  const hoop = new THREE.Mesh(
    state.crystalGeo,
    hoopMat,
  );
  group.add(hoop);

  const gem = buildGem(state, color, 5.5);
  group.add(gem);

  const electrons: Electron[] = [];
  const planes: [THREE.Vector3, THREE.Vector3][] = [
    [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0.8, 0.6).normalize()],
    [new THREE.Vector3(0.7, 0, 0.72).normalize(), new THREE.Vector3(0, 1, 0)],
  ];
  for (let i = 0; i < 2; i++) {
    const orbMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, toneMapped: false });
    orbMat.userData.baseOpacity = 0.95;
    const orb = new THREE.Mesh(
      state.orbGeo,
      orbMat,
    );
    group.add(orb);
    const pts = new Float32Array(TRAIL_LEN * 3);
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    const trailMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, toneMapped: false });
    trailMat.userData.baseOpacity = 0.8;
    const trail = new THREE.Line(
      tg,
      trailMat,
    );
    trail.frustumCulled = false;
    group.add(trail);
    electrons.push({ orb, trail, pts, ang: i * Math.PI, spd: 3.2 + i * 0.6, u: planes[i][0], v: planes[i][1] });
  }
  return { group, gem, electrons };
}

export function updateRings(
  scene: THREE.Scene,
  state: RingState,
  camera: THREE.PerspectiveCamera,
  avatarPos: THREE.Vector3,
  avatarR: number,
  elapsed: number,
  dt: number,
  onPass: (color: number, pos: THREE.Vector3, isCrystal: boolean) => void,
) {
  const camZ = camera.position.z;
  // spawn ahead (forward = decreasing z)
  while (state.nextZ > camZ - SPAWN_AHEAD) {
    const z = state.nextZ;
    const lane = laneAt(z);

    const zone = Math.max(0, Math.floor((-z * DISTANCE_SCALE) / Math.max(1, dev.levelLength)));
    if (zone !== state.zone) {
      state.zone = zone;
      state.zoneRingIdx = 0;
    }
    // GamesCom Play: exactly one pickup crystal per Google-colour level. Other
    // modes keep the denser every-N-ring cadence.
    const isCrystal = isGamesComPlayMode()
      ? state.zoneRingIdx === 2
      : state.zoneRingIdx > 0 && state.zoneRingIdx % CRYSTAL_EVERY === 0;
    state.zoneRingIdx++;

    const color = isCrystal
      ? isGamesComPlayMode()
        ? gamesComChapterFor(zone).accent
        : RING_COLORS[state.crystalCount++ % RING_COLORS.length]
      : RING_COLORS[state.colorIdx++ % RING_COLORS.length];

    const b = steerBounds();
    const ox = (Math.random() * 2 - 1) * b.x * 0.92;
    const oy = b.lo + 0.1 + Math.random() * (b.up - b.lo - 0.2);

    let mesh: THREE.Object3D;
    let gem: THREE.Object3D | undefined;
    let electrons: Electron[] | undefined;
    const ringRadius = isCrystal
      ? CRYSTAL_RADIUS * (gamescom.enabled ? 1.8 : 1) // GamesCom: bigger crystal
      : RING_RADIUS;
    if (gamescom.enabled && isCrystal) {
      // GamesCom crystal ring → JUST the crystal (no hoop / electrons), bigger. Wrap it
      // in a group so the float-pulse (gem.position.y) stays LOCAL and doesn't overwrite
      // the ring's world height (which pinned crystals to the floor).
      const group = new THREE.Group();
      gem = buildGem(state, color, 9);
      group.add(gem);
      mesh = group;
    } else if (gamescom.enabled) {
      // GamesCom normal ring → a simple glowing ORB (fuel pickup).
      mesh = new THREE.Mesh(
        state.orbGeo,
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          emissive: 0xffffff,
          emissiveIntensity: 1.8,
          transparent: true,
          opacity: 0.86,
          metalness: 0.18,
          roughness: 0.04,
          envMapIntensity: 2.2,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        }),
      );
      mesh.scale.setScalar(ringRadius / 0.26);
    } else if (isCrystal) {
      const built = buildCrystalRing(state, color);
      mesh = built.group;
      gem = built.gem;
      electrons = built.electrons;
    } else {
      mesh = new THREE.Mesh(
        state.geo,
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, toneMapped: false }),
      );
    }
    mesh.position.set(lane.x + ox, EYE_Y + lane.y + oy, z);
    scene.add(mesh);
    state.rings.push({
      mesh,
      z,
      color,
      radius: ringRadius,
      crystal: isCrystal,
      passed: false,
      ox,
      oy,
      phase: Math.random() * Math.PI * 2,
      gem,
      electrons,
    });
    state.nextZ -= RING_SPACING;
  }

  for (let i = state.rings.length - 1; i >= 0; i--) {
    const r = state.rings[i];
    if (r.expanding) {
      // Crystal rings expand and fade away slightly faster and wider for a more satisfying collection punch!
      r.expandT = (r.expandT || 0) + dt / (r.crystal ? 0.30 : 0.38);
      if (r.expandT >= 1.0) {
        disposeMagnetTrail(scene, r); // guard (normally already disposed on contact)
        scene.remove(r.mesh);
        state.rings.splice(i, 1);
        continue;
      }
      
      const scaleAmt = r.crystal ? 2.5 : 1.4;
      const scaleVal = 1.0 + r.expandT * scaleAmt;
      r.mesh.scale.setScalar(scaleVal);
      
      const fade = 1.0 - r.expandT;
      r.mesh.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          const m = (o as THREE.Mesh).material as THREE.Material & { opacity?: number };
          if (m && 'opacity' in m) {
            m.opacity = (m.userData.baseOpacity ?? 0.85) * fade;
          }
        }
      });
      continue;
    }

    // crystal-ring animation: spin the gem, orbit the electrons + trail their ribbons
    if (r.crystal && r.gem) {
      r.gem.rotation.y += dt * 2.2; // faster, energetic spin
      r.gem.rotation.x += dt * 1.1;

      // Floating pulse animation
      r.gem.position.y = Math.sin(elapsed * 4.5) * 0.18;

      if (r.electrons)
      for (const e of r.electrons) {
        e.ang += dt * e.spd;
        const c = Math.cos(e.ang);
        const s = Math.sin(e.ang);
        _ev.set(
          (e.u.x * c + e.v.x * s) * ORBIT_R,
          (e.u.y * c + e.v.y * s) * ORBIT_R,
          (e.u.z * c + e.v.z * s) * ORBIT_R,
        );
        e.orb.position.copy(_ev);
        // shift the ribbon trail history, push the orb's local position at the head
        e.pts.copyWithin(0, 3);
        e.pts[(TRAIL_LEN - 1) * 3] = _ev.x;
        e.pts[(TRAIL_LEN - 1) * 3 + 1] = _ev.y;
        e.pts[(TRAIL_LEN - 1) * 3 + 2] = _ev.z;
        e.trail.geometry.attributes.position.needsUpdate = true;
      }
    }

    // Far-off rings tumble; as the player closes in they ease to facing head-on.
    const ahead = avatarPos.z - r.z;
    const faceBlend = THREE.MathUtils.clamp(
      (RING_FLIP_FAR - ahead) / (RING_FLIP_FAR - RING_FLIP_NEAR),
      0,
      1,
    );
    _dummy.position.copy(r.mesh.position);
    _dummy.lookAt(avatarPos.x, avatarPos.y, avatarPos.z + 16);
    _faceQ.copy(_dummy.quaternion);
    const spin = elapsed * 1.7 + r.phase;
    _tumbleE.set(spin, spin * 0.6, 0);
    _tumbleQ.setFromEuler(_tumbleE);
    r.mesh.quaternion.copy(_tumbleQ).slerp(_faceQ, faceBlend);

    if (r.z > camZ + CULL_BEHIND) {
      disposeMagnetTrail(scene, r);
      scene.remove(r.mesh);
      state.rings.splice(i, 1);
      continue;
    }
    if (!r.passed) {
      const contact = r.radius + avatarR;
      // --- Pickup magnetic field: once the player's centre is within `field` of
      // the pickup's centre, the pickup is reeled into the player and fires its
      // normal interaction on contact. Obstacles live elsewhere, so this only
      // ever affects rings / orbs / crystals. field <= 0 → magnet disabled.
      const field = dev.pickupMagnetRadius;
      if (!r.magnetized && field > 0) {
        const lane = laneAt(r.z);
        const dx = avatarPos.x - (lane.x + r.ox);
        const dy = avatarPos.y - (EYE_Y + lane.y + r.oy);
        const dz = avatarPos.z - r.z;
        if (Math.hypot(dx, dy, dz) < field) r.magnetized = true;
      }
      if (r.magnetized) {
        const pull = Math.min(1, dt * MAGNET_PULL);
        r.mesh.position.x += (avatarPos.x - r.mesh.position.x) * pull;
        r.mesh.position.y += (avatarPos.y - r.mesh.position.y) * pull;
        r.mesh.position.z += (avatarPos.z - r.mesh.position.z) * pull;
        // 3D ribbon streak trailing the pickup as it's reeled in
        if (!r.magnetTrail) {
          const w = Math.max(0.45, Math.min(1.7, r.radius * 0.35));
          r.magnetTrail = createMagnetTrail(scene, w);
        }
        updateMagnetTrail(r.magnetTrail, r.mesh.position, r.color, camera);
        const cd = Math.hypot(
          avatarPos.x - r.mesh.position.x,
          avatarPos.y - r.mesh.position.y,
          avatarPos.z - r.mesh.position.z,
        );
        if (cd < contact) {
          r.passed = true;
          r.expanding = true;
          r.expandT = 0;
          disposeMagnetTrail(scene, r); // streak's done — the collection pop takes over
          onPass(r.color, r.mesh.position, r.crystal);
        }
      } else if (avatarPos.z <= r.z + 0.6) {
        // normal pass: only when the craft reaches the pickup's z-plane
        const lane = laneAt(r.z);
        const dx = avatarPos.x - (lane.x + r.ox);
        const dy = avatarPos.y - (EYE_Y + lane.y + r.oy);
        if (Math.hypot(dx, dy) < contact) {
          r.passed = true;
          r.expanding = true;
          r.expandT = 0;
          onPass(r.color, r.mesh.position, r.crystal);
        } else {
          r.passed = true; // missed it — don't re-check
        }
      }
    }
  }
}
