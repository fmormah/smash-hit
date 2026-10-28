import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { EYE_Y, OBS_TOP, PATH_HALF } from '../config/constants';
import { dev, gamescom } from '../config/runtime';
import { createBoosters, setBoosterColor, updateBoosters, type Boosters } from './boosters';
import { rnd } from '../utils/random';
import heroUrl from '../assets/hero.glb';

/**
 * The player avatar (fused build): a craft that rides ahead of the camera and is
 * STEERED to weave the world. Ported from the first game's look — the hero glb
 * model, a companion side orb with a world-space fairy trail, and booster jets.
 * Collision uses `pos` / `radius` (the visuals don't affect gameplay).
 */
export interface Avatar {
  mesh: THREE.Group; // positioned by the loop each frame
  steerX: number;
  steerY: number;
  pos: THREE.Vector3;
  radius: number;
  // visuals
  model: THREE.Object3D | null;
  placeholder: THREE.Mesh; // shown until the model loads
  orb: THREE.Group; // companion shell + core (child of mesh)
  orbCore: THREE.Mesh;
  boosters: Boosters; // thruster FX (child of mesh)
  trail: THREE.Mesh; // world-space ribbon/trail (added to the scene)
  trailPos: Float32Array;
  color: number; // current power colour (tints orb / trail / boosters)
  boostFx: number; // 0..1 thruster flare (set on ring pass / high speed, decays)
  powerReady: boolean; // scatter-missile ability charged → the orb glows/pulses
  cometForce: boolean; // force the comet trail on (crystal-ring perma-boost), even unarmoured
  bounds: THREE.LineSegments; // movement-envelope wireframe (dev, world-space)
  hitBox: THREE.LineSegments; // collision/hit box wireframe (dev, world-space)
  magnetField: THREE.LineSegments; // pickup-magnet field sphere (dev, world-space)
  shield: THREE.Group; // dynamic glowing boost shield
  shieldActive: boolean; // tracks whether shield is currently shown
  shieldTrail: THREE.Points; // world-space shield comet trail
  shieldTrailParticles: { pos: THREE.Vector3; vel: THREE.Vector3; life: number; maxLife: number; size: number }[];
  shieldRibbon: THREE.Mesh; // world-space shield ribbon trail
  shieldRibbonPos: Float32Array; // centerline points for shield ribbon
  // stunt spin (crash yaw-360 / ring yaw-720 or roll-360), eased then reset to origin
  spinTimer: number;
  spinDur: number;
  spinTotal: number; // total radians (multiple of 2π → ends at origin)
  spinAxisZ: boolean; // true = roll (z), false = yaw (y)
}

/** Base lateral / vertical reach of the steer offset (at world scale 1). */
export const STEER_X = PATH_HALF * 0.85;
export const STEER_UP = 2.6;
export const STEER_DOWN = 1.5;
/**
 * Steering speed (units/sec). Direct-velocity control like the first game:
 * hold a direction → glide at this speed, release → stop where you are (NO
 * spring back). Base keeps the first game's traversal feel; `dev.steerSpeed`
 * scales sharpness live.
 */
export const STEER_SPEED_X = STEER_X / 0.78; // ≈ 3.9
export const STEER_SPEED_Y = STEER_UP / 0.65; // ≈ 4.0

/**
 * The player's movement envelope, scaled with the world so the bigger corridor
 * stays reachable. `dev.steerMulX/Y` fine-tune the reach; the model is never
 * scaled. Speed scales the same way so the traversal *feel* stays constant.
 */
export function steerBounds() {
  // Corridor-fill baseline (scales with the world so the bigger room stays
  // reachable), then the dev sliders OFFSET it in world units — lateral / up /
  // down nudges layered on top of the baked reach.
  if (gamescom.enabled) {
    const canyonHalfGap = (gamescom.canyonWallGap * dev.worldScale) / 2;
    const x = Math.max(0.8, canyonHalfGap - 0.9 + dev.steerMulX);
    const up = Math.max(0.5, (OBS_TOP - EYE_Y) * dev.worldScale - 0.25) + dev.steerMulUp;
    const lo = Math.min(-0.2, -EYE_Y * dev.worldScale + 0.25) + dev.steerMulDown;
    return { x, up, lo };
  }
  const s = dev.worldScale;
  const x = Math.max(1, PATH_HALF * s - 0.25) + dev.steerMulX;
  const up = Math.max(0.5, (OBS_TOP - EYE_Y) * s - 0.25) + dev.steerMulUp;
  const lo = Math.min(-0.2, -EYE_Y * s + 0.25) + dev.steerMulDown;
  return { x, up, lo };
}

const TRAIL_GRAINS = 64;

export function createAvatar(scene: THREE.Scene): Avatar {
  const group = new THREE.Group();

  // placeholder shown until the glb loads — a soft cyan cone
  const placeholder = new THREE.Mesh(
    new THREE.ConeGeometry(0.45, 1.4, 6),
    new THREE.MeshStandardMaterial({
      color: 0x8af6ff,
      emissive: 0x1c7e8c,
      emissiveIntensity: 1,
      metalness: 0.5,
      roughness: 0.3,
      toneMapped: false,
    }),
  );
  placeholder.rotation.x = -Math.PI / 2;
  group.add(placeholder);

  // a soft key light rides with the craft so the hero model reads even in the
  // dark chapters (the dim corridors would otherwise leave it a silhouette)
  const keyLight = new THREE.PointLight(0xcfeaff, 9, 9, 2);
  keyLight.position.set(0.4, 1.6, -1.6); // slightly above + ahead of the figure
  group.add(keyLight);

  // companion side orb: translucent shell + a glowing inner core
  const orb = new THREE.Group();
  orb.position.set(1.0, 0.6, 0.1);
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(0.34, 18, 18),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x88e0ff,
      emissiveIntensity: 0.6,
      transparent: true,
      opacity: 0.5,
      metalness: 0.2,
      roughness: 0.1,
      toneMapped: false,
    }),
  );
  orb.add(shell);
  const orbCore = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0x66f6ff, toneMapped: false }),
  );
  orb.add(orbCore);
  group.add(orb);

  // booster FX (lifted from the first game) — two thrusters with plume + sparks
  const boosters = createBoosters(group);

  scene.add(group);

  // world-space ribbon/trail (glowing, tapering, anime-style energy cone trail)
  const trailPos = new Float32Array(TRAIL_GRAINS * 3); // holds the centerline history points
  const ribbonPos = new Float32Array(TRAIL_GRAINS * 2 * 3); // holds the expanded left/right vertices
  const ribbonCol = new Float32Array(TRAIL_GRAINS * 2 * 3); // holds colors of left/right vertices
  
  // construct indices for the triangle strip/quads
  const indices: number[] = [];
  for (let i = 0; i < TRAIL_GRAINS - 1; i++) {
    const v0 = i * 2;
    const v1 = i * 2 + 1;
    const v2 = (i + 1) * 2;
    const v3 = (i + 1) * 2 + 1;
    
    // Triangle 1
    indices.push(v0, v1, v2);
    // Triangle 2
    indices.push(v1, v3, v2);
  }

  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(ribbonPos, 3));
  trailGeo.setAttribute('color', new THREE.BufferAttribute(ribbonCol, 3));
  trailGeo.setIndex(indices);

  const trail = new THREE.Mesh(
    trailGeo,
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.98,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  trail.frustumCulled = false; // Prevent culling of world-space ribbon
  scene.add(trail);

  // movement-envelope wireframe (dev), positioned at the lane centre each frame
  const bounds = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
    new THREE.LineBasicMaterial({ color: 0x66f6ff, transparent: true, opacity: 0.5, toneMapped: false }),
  );
  bounds.visible = false;
  scene.add(bounds);

  // collision/hit box wireframe (dev) — world-axis-aligned at the avatar
  const hitBox = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
    new THREE.LineBasicMaterial({ color: 0xff5a6e, transparent: true, opacity: 0.7, toneMapped: false }),
  );
  hitBox.visible = false;
  scene.add(hitBox);

  // pickup-magnet field sphere (dev) — a unit wireframe sphere scaled to the
  // field radius and parked at the avatar each frame (gold, like the pickups)
  const magnetField = new THREE.LineSegments(
    new THREE.WireframeGeometry(new THREE.SphereGeometry(1, 16, 10)),
    new THREE.LineBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.3, toneMapped: false }),
  );
  magnetField.visible = false;
  magnetField.frustumCulled = false;
  scene.add(magnetField);

  // cool shield around the player model: inner glowing sphere + outer rotating wireframe
  const shield = new THREE.Group();
  const shieldInner = new THREE.Mesh(
    new THREE.SphereGeometry(1.6, 24, 20),
    new THREE.MeshStandardMaterial({
      color: 0x00f3ff,
      emissive: 0x00aaff,
      emissiveIntensity: 2.0,
      transparent: true,
      opacity: 0.28,
      metalness: 0.1,
      roughness: 0.1,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  shieldInner.name = 'shieldInner';
  shield.add(shieldInner);

  const shieldOuter = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.65, 1),
    new THREE.MeshBasicMaterial({
      color: 0x00f3ff,
      wireframe: true,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  shieldOuter.name = 'shieldOuter';
  shield.add(shieldOuter);
  shield.visible = false;
  group.add(shield);

  // shield comet trail: world-space glowing particles streaming backwards from the shield's outer boundary
  const shieldTrailCount = 200;
  const shieldTrailPos = new Float32Array(shieldTrailCount * 3);
  const shieldTrailCol = new Float32Array(shieldTrailCount * 3);
  const shieldTrailGeo = new THREE.BufferGeometry();
  shieldTrailGeo.setAttribute('position', new THREE.BufferAttribute(shieldTrailPos, 3));
  shieldTrailGeo.setAttribute('color', new THREE.BufferAttribute(shieldTrailCol, 3));

  const shieldTrailMat = new THREE.PointsMaterial({
    size: 0.9,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const shieldTrail = new THREE.Points(shieldTrailGeo, shieldTrailMat);
  shieldTrail.frustumCulled = false; // MUST disable frustum culling so world-space points always render!
  scene.add(shieldTrail);

  const shieldTrailParticles: { pos: THREE.Vector3; vel: THREE.Vector3; life: number; maxLife: number; size: number }[] = [];

  // shield ribbon trail: world-space glowing 3D conical ribbon trailing behind the shield
  const shieldRibbonCount = 64;
  const RADIAL_SEGMENTS = 12;
  const shieldRibbonCenterPos = new Float32Array(shieldRibbonCount * 3);
  const shieldRibbonPos = new Float32Array(shieldRibbonCount * RADIAL_SEGMENTS * 3);
  const shieldRibbonCol = new Float32Array(shieldRibbonCount * RADIAL_SEGMENTS * 3);
  
  // construct indices for the triangle strip/quads wrapping around the tube/cone
  const shieldRibbonIndices: number[] = [];
  for (let i = 0; i < shieldRibbonCount - 1; i++) {
    for (let j = 0; j < RADIAL_SEGMENTS; j++) {
      const nextJ = (j + 1) % RADIAL_SEGMENTS;
      const v0 = i * RADIAL_SEGMENTS + j;
      const v1 = i * RADIAL_SEGMENTS + nextJ;
      const v2 = (i + 1) * RADIAL_SEGMENTS + j;
      const v3 = (i + 1) * RADIAL_SEGMENTS + nextJ;
      
      // Quad triangles
      shieldRibbonIndices.push(v0, v1, v2);
      shieldRibbonIndices.push(v1, v3, v2);
    }
  }

  const shieldRibbonGeo = new THREE.BufferGeometry();
  shieldRibbonGeo.setAttribute('position', new THREE.BufferAttribute(shieldRibbonPos, 3));
  shieldRibbonGeo.setAttribute('color', new THREE.BufferAttribute(shieldRibbonCol, 3));
  shieldRibbonGeo.setIndex(shieldRibbonIndices);

  const shieldRibbon = new THREE.Mesh(
    shieldRibbonGeo,
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
  shieldRibbon.frustumCulled = false; // Prevent culling
  scene.add(shieldRibbon);

  const a: Avatar = {
    mesh: group,
    steerX: 0,
    steerY: 0,
    pos: new THREE.Vector3(),
    radius: 0.7,
    model: null,
    placeholder,
    orb,
    orbCore,
    boosters,
    trail,
    trailPos,
    color: 0x66f6ff,
    boostFx: 0,
    powerReady: false,
    cometForce: false,
    bounds,
    hitBox,
    magnetField,
    shield,
    shieldActive: false,
    shieldTrail,
    shieldTrailParticles,
    shieldRibbon,
    shieldRibbonPos: shieldRibbonCenterPos,
    spinTimer: 0,
    spinDur: 0,
    spinTotal: 0,
    spinAxisZ: false,
  };

  // async hero-model load — swap in over the placeholder when ready
  new GLTFLoader()
    .loadAsync(heroUrl)
    .then((gltf) => {
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      box.getSize(size);
      const h = size.y || 1;
      model.scale.setScalar(1.9 / h); // normalise to a sensible craft height
      // position/rotation are driven live from `dev` each frame (see updateAvatar);
      // seed them now so the figure is correct before the first play frame.
      model.position.set(dev.heroPosX, dev.heroPosY, dev.heroPosZ);
      model.rotation.set(
        (dev.heroRotXDeg * Math.PI) / 180,
        (dev.heroRotYDeg * Math.PI) / 180,
        (dev.heroRotZDeg * Math.PI) / 180,
      );
      placeholder.visible = false;
      group.add(model);
      a.model = model;
    })
    .catch(() => {
      /* keep the placeholder if the model fails to load */
    });

  return a;
}

/**
 * Ghost the craft body during the post-crash invulnerability window. `opacity < 1`
 * fades it translucent (the classic arcade i-frame flash); pass `1` to restore it
 * solid. Only flips the materials' blend state on the edges, not every frame.
 */
export function setAvatarBodyOpacity(a: Avatar, opacity: number) {
  const body = a.model ?? a.placeholder;
  const wantTransparent = opacity < 1;
  body.traverse((o) => {
    const raw = (o as THREE.Mesh).material;
    if (!raw) return;
    const mats = Array.isArray(raw) ? raw : [raw];
    for (const mat of mats) {
      const m = mat as THREE.Material & { opacity: number };
      if (m.transparent !== wantTransparent) {
        m.transparent = wantTransparent;
        m.needsUpdate = true;
      }
      m.opacity = opacity;
    }
  });
}

/** Tint the companion orb / trail / boosters to the held power colour. */
export function setAvatarColor(a: Avatar, hex: number) {
  a.color = hex;
  (a.orbCore.material as THREE.MeshBasicMaterial).color.setHex(hex);
  const shell = a.orb.children[0] as THREE.Mesh;
  (shell.material as THREE.MeshStandardMaterial).emissive.setHex(hex);
  setBoosterColor(a.boosters, hex);
}

/**
 * Direct-velocity steering (matches the first game's feel): the axis drives a
 * constant glide speed; releasing leaves the craft where it is. Clamped to the
 * corridor reach — no easing, no auto-centre. `dev.steerSpeed` and
 * `dev.keyboardSteerSensitivity` scale keyboard sharpness; `speedMul` is the
 * caller's forward-speed-derived multiplier (1 = unaffected).
 */
export function updateAvatarSteer(a: Avatar, axisX: number, axisY: number, dt: number, speedMul = 1) {
  const s = dev.steerSpeed * dev.keyboardSteerSensitivity * dev.worldScale * speedMul;
  const b = steerBounds();
  a.steerX += axisX * STEER_SPEED_X * s * dt;
  a.steerY += axisY * STEER_SPEED_Y * s * dt;
  a.steerX = Math.max(-b.x, Math.min(b.x, a.steerX));
  a.steerY = Math.max(b.lo, Math.min(b.up, a.steerY));
}

/** Place the movement-envelope wireframe at the lane centre (cx,cy,cz). */
export function updateBoundsBox(a: Avatar, cx: number, cy: number, cz: number) {
  a.bounds.visible = dev.showBounds;
  if (!dev.showBounds) return;
  const b = steerBounds();
  a.bounds.position.set(cx, cy + (b.up + b.lo) / 2, cz);
  a.bounds.scale.set(b.x * 2, Math.max(0.1, b.up - b.lo), 1);
}

/** Place the collision/hit box wireframe at the avatar (world-axis-aligned). */
export function updateHitBox(a: Avatar) {
  a.hitBox.visible = dev.showHitBox;
  if (!dev.showHitBox) return;
  a.hitBox.position.copy(a.pos);
  a.hitBox.quaternion.identity();
  a.hitBox.scale.set(dev.hitX * 2, dev.hitY * 2, dev.hitZ * 2);
}

/** Park the pickup-magnet field sphere at the avatar, scaled to the field radius. */
export function updateMagnetField(a: Avatar) {
  a.magnetField.visible = dev.showPickupField && dev.pickupMagnetRadius > 0;
  if (!a.magnetField.visible) return;
  a.magnetField.position.copy(a.pos);
  a.magnetField.quaternion.identity();
  a.magnetField.scale.setScalar(dev.pickupMagnetRadius);
}

const _wp = new THREE.Vector3();
const _col = new THREE.Color();
const _FWD = new THREE.Vector3(0, 0, -1);
const _Z = new THREE.Vector3(0, 0, 1);
const _Y = new THREE.Vector3(0, 1, 0);
const _aimDir = new THREE.Vector3();
const _aimQ = new THREE.Quaternion();
const _bakedQ = new THREE.Quaternion();
const _rollQ = new THREE.Quaternion();
const _spinQ = new THREE.Quaternion();
const _bakedE = new THREE.Euler();

/** Kick off a stunt spin: total radians (multiple of 2π) about yaw (y) or roll (z). */
export function triggerSpin(a: Avatar, axisZ: boolean, totalRad: number, dur: number) {
  a.spinAxisZ = axisZ;
  a.spinTotal = totalRad;
  a.spinDur = dur;
  a.spinTimer = dur;
}

const DEG = Math.PI / 180;

/**
 * Per-frame visual update: hero transform, orb bob/orbit, fairy trail, boosters.
 * `viewRoll` is the camera's roll this frame — the craft counter-rolls by it so it
 * stays visually upright on screen during a barrel/manual roll.
 */
export function updateAvatar(
  a: Avatar,
  dt: number,
  elapsed: number,
  viewRoll = 0,
  vpX?: number,
  vpY?: number,
  vpZ?: number,
) {
  // hero CONTAINER transform — rotates/scales the whole craft (model + boosters
  // + orb) together. The Game loop owns mesh.position; we own rotation + scale.
  _bakedE.set(dev.heroContRotXDeg * DEG, dev.heroContRotYDeg * DEG, dev.heroContRotZDeg * DEG);
  if (dev.aimNoseToCentre) {
    // point the nose (−z) at the central vanishing point, then apply the baked
    // artistic offset — so the craft always faces screen-centre, even on turns.
    if (vpX !== undefined && vpY !== undefined && vpZ !== undefined) {
      _aimDir.set(vpX - a.pos.x, vpY - a.pos.y, vpZ - a.pos.z).normalize();
    } else {
      _aimDir.set(-a.steerX, -a.steerY, -16).normalize();
    }
    _aimQ.setFromUnitVectors(_FWD, _aimDir);
    _bakedQ.setFromEuler(_bakedE);
    a.mesh.quaternion.copy(_aimQ).multiply(_bakedQ);
  } else {
    a.mesh.quaternion.setFromEuler(_bakedE);
  }
  // stunt spin (crash / ring) — a local spin eased 0→total; ends at the origin
  // orientation since total is a multiple of 2π.
  if (a.spinTimer > 0) {
    a.spinTimer = Math.max(0, a.spinTimer - dt);
    const p = a.spinDur > 0 ? 1 - a.spinTimer / a.spinDur : 1;
    const ease = p * p * (3 - 2 * p);
    _spinQ.setFromAxisAngle(a.spinAxisZ ? _Z : _Y, a.spinTotal * ease);
    a.mesh.quaternion.multiply(_spinQ);
  }
  // counter the camera's view-roll so the craft holds its on-screen orientation
  if (viewRoll !== 0) {
    _rollQ.setFromAxisAngle(_Z, viewRoll);
    a.mesh.quaternion.premultiply(_rollQ);
  }
  a.mesh.scale.setScalar(dev.heroContScale);

  // live hero-model transform (dev sliders) — local to the craft
  if (a.model) {
    a.model.position.set(dev.heroPosX, dev.heroPosY, dev.heroPosZ);
    a.model.rotation.set(dev.heroRotXDeg * DEG, dev.heroRotYDeg * DEG, dev.heroRotZDeg * DEG);
  }

  // orb gently bobs beside the craft; the core orbits inside the shell
  a.orb.position.x = 1.0 + Math.sin(elapsed * 2) * 0.08;
  a.orb.position.y = 0.6 + Math.sin(elapsed * 3) * 0.12;
  a.orbCore.position.x = Math.cos(elapsed * 6) * 0.16;
  a.orbCore.position.z = Math.sin(elapsed * 6) * 0.16;

  // orb glows + pulses when the scatter-missile ability is charged (cooldown ready).
  // When not ready, the surrounding orb shell is fully transparent.
  // When charged, we add a gentle, tuned emissive intensity to trigger a nice glow/bloom in post-processing without being overbearing!
  {
    const shellMat = (a.orb.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
    if (a.powerReady) {
      shellMat.transparent = true;
      const pulse = 0.5 + Math.sin(elapsed * 7) * 0.5;
      shellMat.opacity = 0.72; // fully visible outer shell
      shellMat.emissiveIntensity = 2.0 + pulse * 2.5; // Toned down from 12 + 18 to prevent over-bloom!
      a.orb.scale.setScalar(1 + pulse * 0.12); // slightly subtler pulsing scale too
    } else {
      shellMat.transparent = true;
      shellMat.opacity = 0.0; // fully transparent when on cooldown!
      shellMat.emissiveIntensity = 0.0;
      a.orb.scale.setScalar(1.0);
    }
  }

  // long-exposure red traffic light-capture style trail: shift positions and colors to create an unbroken glowing line
  a.orbCore.getWorldPosition(_wp);
  const centerline = a.trailPos;

  // Initialize buffer to the current position on the first frame to avoid rendering a line to 0,0,0
  if (centerline[0] === 0 && centerline[1] === 0 && centerline[2] === 0) {
    for (let i = 0; i < TRAIL_GRAINS; i++) {
      centerline[i * 3] = _wp.x;
      centerline[i * 3 + 1] = _wp.y;
      centerline[i * 3 + 2] = _wp.z;
    }
  }

  // Shift older points to the left (idx 0 is oldest, idx TRAIL_GRAINS-1 is newest)
  for (let i = 0; i < TRAIL_GRAINS - 1; i++) {
    const nextIdx = (i + 1) * 3;
    const currIdx = i * 3;
    centerline[currIdx] = centerline[nextIdx];
    centerline[currIdx + 1] = centerline[nextIdx + 1];
    centerline[currIdx + 2] = centerline[nextIdx + 2];
  }

  // Insert newest point at the very end
  const lastIdx = (TRAIL_GRAINS - 1) * 3;
  centerline[lastIdx] = _wp.x;
  centerline[lastIdx + 1] = _wp.y;
  centerline[lastIdx + 2] = _wp.z;

  const ribbonPos = a.trail.geometry.attributes.position.array as Float32Array;
  const ribbonCol = a.trail.geometry.attributes.color.array as Float32Array;

  const upVec = new THREE.Vector3(0, 1, 0);
  const dir = new THREE.Vector3();
  const side = new THREE.Vector3();
  const pCurr = new THREE.Vector3();
  const pNext = new THREE.Vector3();

  for (let i = 0; i < TRAIL_GRAINS; i++) {
    const cIdx = i * 3;
    pCurr.set(centerline[cIdx], centerline[cIdx + 1], centerline[cIdx + 2]);
    
    if (i < TRAIL_GRAINS - 1) {
      pNext.set(centerline[cIdx + 3], centerline[cIdx + 4], centerline[cIdx + 5]);
      dir.subVectors(pNext, pCurr).normalize();
    } else if (i > 0) {
      const pPrev = new THREE.Vector3(centerline[cIdx - 3], centerline[cIdx - 2], centerline[cIdx - 1]);
      dir.subVectors(pCurr, pPrev).normalize();
    } else {
      dir.set(0, 0, -1);
    }

    side.crossVectors(dir, upVec).normalize();
    if (side.lengthSq() < 1e-4) {
      side.set(1, 0, 0);
    }

    const t = i / (TRAIL_GRAINS - 1); // 0 (oldest/tail) to 1 (newest/head)
    // start point width is wide, tapering down towards the tail (oldest parts)
    const halfWidth = (dev.orbTrailWidth / 2) * Math.pow(t, dev.orbTrailDecay);

    // Left vertex for this centerline point
    const rIdxLeft = i * 2 * 3;
    ribbonPos[rIdxLeft] = pCurr.x + side.x * halfWidth;
    ribbonPos[rIdxLeft + 1] = pCurr.y + side.y * halfWidth;
    ribbonPos[rIdxLeft + 2] = pCurr.z + side.z * halfWidth;

    // Right vertex for this centerline point
    const rIdxRight = (i * 2 + 1) * 3;
    ribbonPos[rIdxRight] = pCurr.x - side.x * halfWidth;
    ribbonPos[rIdxRight + 1] = pCurr.y - side.y * halfWidth;
    ribbonPos[rIdxRight + 2] = pCurr.z - side.z * halfWidth;

    // Dynamically set the colors: Head is highly saturated matching the current attuned orb color (a.color),
    // while older tail parts become increasingly pale (white-neon) and fade out as they decay.
    const intensity = Math.pow(t, 1.5); // fade out opacity/brightness towards the tail
    const paleness = 1.0 - t; // tail is paler (more white), head is highly saturated
    
    _col.setHex(a.color); // active attuned color (from rings / gates)
    const r = (_col.r * t + 0.95 * paleness) * intensity;
    const g = (_col.g * t + 0.95 * paleness) * intensity;
    const b = (_col.b * t + 0.95 * paleness) * intensity;

    // Set colors for left vertex
    ribbonCol[rIdxLeft] = r;
    ribbonCol[rIdxLeft + 1] = g;
    ribbonCol[rIdxLeft + 2] = b;

    // Set colors for right vertex
    ribbonCol[rIdxRight] = r;
    ribbonCol[rIdxRight + 1] = g;
    ribbonCol[rIdxRight + 2] = b;
  }

  a.trail.geometry.attributes.position.needsUpdate = true;
  a.trail.geometry.attributes.color.needsUpdate = true;

  // booster thruster FX (lifted from the first game) — flares on ring/speed.
  // During a 720° yaw spin (ring stunt) the boost is cut, then resumes as normal.
  // When shield/boost armour is active, we completely turn off the main thrusters and use the anime comet trail instead!
  const yawSpin720 = a.spinTimer > 0 && !a.spinAxisZ && a.spinTotal >= Math.PI * 3;
  const boostersActive = !yawSpin720 && !a.shield.visible;
  updateBoosters(a.boosters, elapsed, dev.boosterX, dev.boosterY, dev.boosterZ, boostersActive ? a.boostFx : 0);

  // update shield visuals, position and scale if active or always on
  a.shield.position.set(dev.shieldOffsetX, dev.shieldOffsetY, dev.shieldOffsetZ);
  a.shield.scale.setScalar(dev.shieldScale);

  if (a.shield.visible) {
    const shieldInner = a.shield.getObjectByName('shieldInner') as THREE.Mesh;
    const shieldOuter = a.shield.getObjectByName('shieldOuter') as THREE.Mesh;
    if (shieldInner && shieldOuter) {
      // rotate outer shell wireframe
      shieldOuter.rotation.y += dt * 1.5;
      shieldOuter.rotation.x += dt * 0.75;
      // pulsate inner opacity
      const matInner = shieldInner.material as THREE.MeshStandardMaterial;
      matInner.opacity = 0.2 + Math.sin(elapsed * 15) * 0.08;
      // copy active color
      const col = _col.setHex(a.color);
      matInner.color.copy(col);
      matInner.emissive.copy(col);
      (shieldOuter.material as THREE.MeshBasicMaterial).color.copy(col);
    }
  }

  if (dev.shieldTrailType === 0 || a.cometForce) {
    // === COMET TRAIL (PARTICLES) === (forced on during the crystal-ring boost)
    const shieldTrailPosAttr = a.shieldTrail.geometry.attributes.position as THREE.BufferAttribute;
    const shieldTrailColAttr = a.shieldTrail.geometry.attributes.color as THREE.BufferAttribute;
    const sPos = shieldTrailPosAttr.array as Float32Array;
    const sCol = shieldTrailColAttr.array as Float32Array;

    // 1. Update existing particles
    for (let i = a.shieldTrailParticles.length - 1; i >= 0; i--) {
      const p = a.shieldTrailParticles[i];
      p.life -= dt;
      if (p.life <= 0) {
        a.shieldTrailParticles.splice(i, 1);
        continue;
      }
      // move particle backwards
      p.pos.addScaledVector(p.vel, dt);
    }

    // 2. Spawn new particles while armoured OR during the crystal-ring perma-boost
    if (a.shield.visible || a.cometForce) {
      // get shield world center
      const shieldCenter = new THREE.Vector3();
      a.shield.getWorldPosition(shieldCenter);

      // spawn 4-6 particles per frame
      const spawnCount = Math.min(6, Math.floor(dt * 300) + 1);
      for (let k = 0; k < spawnCount; k++) {
        if (a.shieldTrailParticles.length >= 200) break;

        // Let's create an incredibly dynamic, spiraling energy cone trailing behind the shield.
        // We spawn particles on a ring corresponding to the outer edge of the shield.
        const theta = Math.random() * Math.PI * 2;
        const r = 1.6 * dev.shieldScale;

        // Spawn slightly towards the rear/mid of the shield
        const localOff = new THREE.Vector3(
          Math.cos(theta) * r,
          Math.sin(theta) * r,
          rnd(-0.1, 0.4) // offset towards the back (+Z local)
        );

        // Rotate local spawn offset by the ship's world rotation
        const worldOff = localOff.clone().applyQuaternion(a.mesh.quaternion);
        const startPos = shieldCenter.clone().add(worldOff);

        // Create a local velocity vector (relative to the ship's facing direction):
        // - Streams backward (+Z local)
        // - Converges inwards towards the central axis (-X, -Y local) to form a tapering cone
        // - Spirals/swirls around the central axis (-Y, +X tangential components) for awesome vortex energy!
        const inwardFactor = 3.5; // pulls particles towards center line as they travel back
        const spiralSpeed = 11.5;   // vortex speed spinning around center line

        const localVel = new THREE.Vector3(
          -localOff.x * inwardFactor - localOff.y * spiralSpeed,
          -localOff.y * inwardFactor + localOff.x * spiralSpeed,
          18.0 + Math.random() * 12.0 // forward along Z local (streaming backwards behind ship)
        );

        // Rotate local velocity vector by ship's world rotation so it curves with the track/ship tilts perfectly!
        const vel = localVel.applyQuaternion(a.mesh.quaternion);

        const life = 0.45 + Math.random() * 0.4; // beautiful, persistent trailing particles
        a.shieldTrailParticles.push({
          pos: startPos,
          vel,
          life,
          maxLife: life,
          size: 0.35 + Math.random() * 0.4
        });
      }
    }

    // 3. Fill the geometry buffers
    const colHex = _col.setHex(a.color);
    for (let i = 0; i < 200; i++) {
      const idx = i * 3;
      if (i < a.shieldTrailParticles.length) {
        const p = a.shieldTrailParticles[i];
        sPos[idx] = p.pos.x;
        sPos[idx + 1] = p.pos.y;
        sPos[idx + 2] = p.pos.z;

        // fade color by remaining life
        const fade = p.life / p.maxLife;
        sCol[idx] = colHex.r * fade;
        sCol[idx + 1] = colHex.g * fade;
        sCol[idx + 2] = colHex.b * fade;
      } else {
        // hide unused particles far away
        sPos[idx] = 9999;
        sPos[idx + 1] = 9999;
        sPos[idx + 2] = 9999;
        sCol[idx] = 0;
        sCol[idx + 1] = 0;
        sCol[idx + 2] = 0;
      }
    }
    shieldTrailPosAttr.needsUpdate = true;
    shieldTrailColAttr.needsUpdate = true;
  } else {
    // === RIBBON TRAIL (3D TAPERED MESH) ===
    const ribbonPos = a.shieldRibbon.geometry.attributes.position.array as Float32Array;
    const ribbonCol = a.shieldRibbon.geometry.attributes.color.array as Float32Array;
    const sCenterline = a.shieldRibbonPos;

    const currentShieldCenter = new THREE.Vector3();
    a.shield.getWorldPosition(currentShieldCenter);

    // Initialize buffer to current position if completely empty
    if (sCenterline[0] === 0 && sCenterline[1] === 0 && sCenterline[2] === 0) {
      for (let i = 0; i < 64; i++) {
        sCenterline[i * 3] = currentShieldCenter.x;
        sCenterline[i * 3 + 1] = currentShieldCenter.y;
        sCenterline[i * 3 + 2] = currentShieldCenter.z;
      }
    }

    // Shift centerline history
    for (let i = 0; i < 63; i++) {
      const nextIdx = (i + 1) * 3;
      const currIdx = i * 3;
      sCenterline[currIdx] = sCenterline[nextIdx];
      sCenterline[currIdx + 1] = sCenterline[nextIdx + 1];
      sCenterline[currIdx + 2] = sCenterline[nextIdx + 2];
    }
    const sLastIdx = 63 * 3;
    sCenterline[sLastIdx] = currentShieldCenter.x;
    sCenterline[sLastIdx + 1] = currentShieldCenter.y;
    sCenterline[sLastIdx + 2] = currentShieldCenter.z;

    // Expand centerline points into 3D Conical Ribbon Mesh vertices (tapering cone)
    const pCurrS = new THREE.Vector3();
    const pNextS = new THREE.Vector3();
    const dirS = new THREE.Vector3();
    const normalS = new THREE.Vector3();
    const binormalS = new THREE.Vector3();

    const RAD_SEGS = 12;

    for (let i = 0; i < 64; i++) {
      const cIdx = i * 3;
      pCurrS.set(sCenterline[cIdx], sCenterline[cIdx + 1], sCenterline[cIdx + 2]);
      
      if (i < 63) {
        pNextS.set(sCenterline[cIdx + 3], sCenterline[cIdx + 4], sCenterline[cIdx + 5]);
        dirS.subVectors(pNextS, pCurrS).normalize();
      } else if (i > 0) {
        const pPrevS = new THREE.Vector3(sCenterline[cIdx - 3], sCenterline[cIdx - 2], sCenterline[cIdx - 1]);
        dirS.subVectors(pCurrS, pPrevS).normalize();
      } else {
        dirS.set(0, 0, -1);
      }

      normalS.crossVectors(dirS, upVec).normalize();
      if (normalS.lengthSq() < 1e-4) {
        normalS.set(1, 0, 0);
      }
      binormalS.crossVectors(dirS, normalS).normalize();

      const t = i / 63; // 0 (tail) to 1 (head)
      // Shield starting radius determines starting cone diameter, tapering down to a trailing tail ribbon (0 radius)
      const radius = (dev.shieldTrailWidth / 2) * Math.pow(t, dev.shieldTrailDecay);

      // Colors: Match powerColor/shieldColor at head, fade to pale white-translucent at tail
      const intensity = Math.pow(t, 1.5);
      const paleness = 1.0 - t;
      const rCol = _col.setHex(a.color);
      
      const r = (rCol.r * t + 0.95 * paleness) * intensity;
      const g = (rCol.g * t + 0.95 * paleness) * intensity;
      const b = (rCol.b * t + 0.95 * paleness) * intensity;

      // Project vertices circularly around the centerline
      for (let j = 0; j < RAD_SEGS; j++) {
        const angle = (j / RAD_SEGS) * Math.PI * 2;
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);

        const vIdx = (i * RAD_SEGS + j) * 3;
        ribbonPos[vIdx] = pCurrS.x + (normalS.x * cosA + binormalS.x * sinA) * radius;
        ribbonPos[vIdx + 1] = pCurrS.y + (normalS.y * cosA + binormalS.y * sinA) * radius;
        ribbonPos[vIdx + 2] = pCurrS.z + (normalS.z * cosA + binormalS.z * sinA) * radius;

        ribbonCol[vIdx] = r;
        ribbonCol[vIdx + 1] = g;
        ribbonCol[vIdx + 2] = b;
      }
    }
    a.shieldRibbon.geometry.attributes.position.needsUpdate = true;
    a.shieldRibbon.geometry.attributes.color.needsUpdate = true;
  }
}
