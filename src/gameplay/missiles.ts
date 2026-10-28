import * as THREE from 'three';
import type { Obstacle } from '../types';
import { dev } from '../config/runtime';
import { slopeAt } from '../world/path';

/**
 * Scatter missiles — ported from Crystal-Line Drifter's player bolts. A spacebar /
 * double-tap salvo fans a spread of glowing kite-bolt missiles forward FROM the
 * companion orb, then they HOME onto destructible obstacles to clear the way.
 * Each missile drags a 3D tapered conical ribbon (the same technique as the boost
 * shield's ribbon). Tinted to the player's current power colour.
 */
const POOL = 120; // Expanded capacity to easily support multiple consecutive 50-missile salvos!
const LIFE = 1.2; // seconds before a missile fizzles
const HIT_R = 1.8; // detonation radius vs an obstacle centre
const HOMING_RANGE = 76; // seek destructible targets within this distance
const CLOSE_LOCK_RANGE = 28; // nearby threats bypass the cone/scatter delay
const TURN = 8; // how hard missiles curve toward their target (once homing)
const SCATTER_TIME = 0.26; // Pure scatter outward and inward convergence duration (seconds)
const WHITE = new THREE.Color('#ffffff');
const CORE_SCALE = new THREE.Vector3(0.32, 0.14, 1.35).multiplyScalar(2.6);
const GLOW_SCALE = CORE_SCALE.clone().multiplyScalar(1.5);
// 3D ribbon trail (mirrors the shield ribbon: centreline rings → tapered cone tube)
const RIB_SEGS = 14; // centreline history points per missile
const RIB_RAD = 6; // radial segments around the tube
const RIB_WIDTH = 0.85; // tube diameter at the head
const RIB_DECAY = 1.6; // taper exponent (head wide → tail point)

// Slim dart/missile mesh (lifted verbatim from the original PlayerBulletsSystem).
function createKiteBoltGeometry() {
  const wing = 0.42;
  const tail = 0.55;
  const nose = -0.62;
  const thick = 0.055;
  const top = [
    [0, thick, nose],
    [-wing, thick, 0.12],
    [wing, thick, 0.12],
    [0, thick, tail],
    [-wing * 0.22, thick, tail * 0.92],
    [wing * 0.22, thick, tail * 0.92],
  ];
  const bot = top.map(([x, y, z]) => [x, -y, z] as const);
  const positions: number[] = [];
  for (const p of top) positions.push(p[0], p[1], p[2]);
  for (const p of bot) positions.push(p[0], p[1], p[2]);
  const indices = [
    0, 1, 2, 1, 3, 4, 2, 3, 5, 1, 4, 5,
    6, 8, 7, 7, 10, 9, 8, 11, 10, 7, 11, 9,
    0, 6, 7, 0, 7, 1, 1, 7, 9, 1, 9, 4, 2, 8, 10,
    2, 10, 5, 0, 8, 2, 3, 9, 10, 3, 4, 9, 3, 5, 10,
  ];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

interface Missile {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  active: boolean;
  scatterT: number; // remaining pure-scatter time before homing
  hist: Float32Array; // centreline position history (RIB_SEGS points), tail→head
}

export interface Missiles {
  group: THREE.Group;
  core: THREE.InstancedMesh;
  glow: THREE.InstancedMesh;
  ribbon: THREE.Mesh;
  ribPos: Float32Array;
  ribCol: Float32Array;
  list: Missile[];
  color: THREE.Color;
  playerSpeedRef?: () => number; // callback to get player's active speed
}

const _dummy = new THREE.Object3D();
const _c = new THREE.Color();
const _wp = new THREE.Vector3();
const _tpos = new THREE.Vector3();
const _desired = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _pCurr = new THREE.Vector3();
const _pNext = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _nrm = new THREE.Vector3();
const _bin = new THREE.Vector3();

function hideInstance(mesh: THREE.InstancedMesh, i: number) {
  _dummy.position.set(0, -9999, 0);
  _dummy.scale.setScalar(0);
  _dummy.updateMatrix();
  mesh.setMatrixAt(i, _dummy.matrix);
}

export function createMissiles(scene: THREE.Scene): Missiles {
  const glow = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(0.55, 1),
    new THREE.MeshBasicMaterial({
      toneMapped: false,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
    POOL,
  );
  const core = new THREE.InstancedMesh(
    createKiteBoltGeometry(),
    new THREE.MeshBasicMaterial({
      toneMapped: false,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.98,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
    POOL,
  );
  glow.frustumCulled = false;
  core.frustumCulled = false;

  // Combined ribbon mesh — one slice (RIB_SEGS × RIB_RAD verts) per missile slot.
  const vertsPer = RIB_SEGS * RIB_RAD;
  const ribPos = new Float32Array(POOL * vertsPer * 3);
  const ribCol = new Float32Array(POOL * vertsPer * 3);
  const ribIdx: number[] = [];
  for (let s = 0; s < POOL; s++) {
    const base = s * vertsPer;
    for (let i = 0; i < RIB_SEGS - 1; i++) {
      for (let j = 0; j < RIB_RAD; j++) {
        const nj = (j + 1) % RIB_RAD;
        const v0 = base + i * RIB_RAD + j;
        const v1 = base + i * RIB_RAD + nj;
        const v2 = base + (i + 1) * RIB_RAD + j;
        const v3 = base + (i + 1) * RIB_RAD + nj;
        ribIdx.push(v0, v1, v2, v1, v3, v2);
      }
    }
  }
  const ribGeo = new THREE.BufferGeometry();
  ribGeo.setAttribute('position', new THREE.BufferAttribute(ribPos, 3));
  ribGeo.setAttribute('color', new THREE.BufferAttribute(ribCol, 3));
  ribGeo.setIndex(ribIdx);
  const ribbon = new THREE.Mesh(
    ribGeo,
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
  ribbon.frustumCulled = false;

  const group = new THREE.Group();
  group.add(ribbon, glow, core);
  scene.add(group);

  const list: Missile[] = Array.from({ length: POOL }, () => ({
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    life: 0,
    active: false,
    scatterT: 0,
    hist: new Float32Array(RIB_SEGS * 3),
  }));
  for (let i = 0; i < POOL; i++) {
    hideInstance(core, i);
    hideInstance(glow, i);
  }
  // collapse all ribbon slices off-screen
  for (let s = 0; s < POOL; s++) collapseRibbon(ribPos, s);

  return { group, core, glow, ribbon, ribPos, ribCol, list, color: new THREE.Color(0x66f6ff) };
}

function collapseRibbon(ribPos: Float32Array, slot: number) {
  const vertsPer = RIB_SEGS * RIB_RAD;
  const start = slot * vertsPer * 3;
  for (let k = 0; k < vertsPer * 3; k += 3) {
    ribPos[start + k] = 0;
    ribPos[start + k + 1] = -9999;
    ribPos[start + k + 2] = 0;
  }
}

/** Fire a fan of missiles forward (down-track) from `origin` (world space). */
export function fireMissiles(m: Missiles, origin: THREE.Vector3, colorHex: number, count = 7) {
  m.color.setHex(colorHex);
  
  const sl = slopeAt(origin.z);
  const fwd = new THREE.Vector3(-sl.x, -sl.y, -1).normalize();
  const upVec = new THREE.Vector3(0, 1, 0);
  const rightVec = new THREE.Vector3().crossVectors(fwd, upVec).normalize();
  if (rightVec.lengthSq() < 1e-4) rightVec.set(1, 0, 0);
  const upVecLocal = new THREE.Vector3().crossVectors(rightVec, fwd).normalize();

  let fired = 0;
  for (const mis of m.list) {
    if (mis.active) continue;
    mis.pos.copy(origin);
    
    // Sunflower spiral fanning pattern:
    const phi = fired * 137.5 * Math.PI / 180.0; // Golden angle
    const r = Math.sqrt(fired + 1) / Math.sqrt(count); // Normalized radius
    const spreadX = Math.cos(phi) * r * 42.0; // Outward expansion X
    const spreadY = Math.sin(phi) * r * 30.0; // Outward expansion Y

    // Forward velocity component
    // We add the player's current speed to the base missile speed, ensuring
    // that the missiles always travel faster than and stay ahead of the player even at ultra-high speeds!
    const playerSpeed = m.playerSpeedRef ? m.playerSpeedRef() : 20.0;
    const speed = (dev.missileSpeed + playerSpeed) * (0.85 + Math.random() * 0.3);
    const initialVel = fwd.clone().multiplyScalar(speed);

    // Add lateral/vertical fanning spread perpendicular to the ship's heading (made wider by 1.3x)
    initialVel.addScaledVector(rightVec, spreadX * 1.3);
    initialVel.addScaledVector(upVecLocal, spreadY * 1.3);

    mis.vel.copy(initialVel);
    mis.life = LIFE;
    mis.scatterT = SCATTER_TIME;
    mis.active = true;
    
    // seed the ribbon history at the spawn point
    for (let k = 0; k < RIB_SEGS; k++) {
      mis.hist[k * 3] = origin.x;
      mis.hist[k * 3 + 1] = origin.y;
      mis.hist[k * 3 + 2] = origin.z;
    }
    if (++fired >= count) break;
  }
}

/** Advance missiles, detonate on the destructibles they reach, and refresh visuals. */
export function updateMissiles(
  m: Missiles,
  dt: number,
  obstacles: Obstacle[],
  onHit: (o: Obstacle) => void,
  avatarPos: THREE.Vector3,
) {
  const sl = slopeAt(avatarPos.z);
  const coneAxis = new THREE.Vector3(-sl.x, -sl.y, -1).normalize();

  for (let i = 0; i < POOL; i++) {
    const b = m.list[i];
    if (!b.active) {
      hideInstance(m.core, i);
      hideInstance(m.glow, i);
      continue;
    }
    b.life -= dt;
    if (b.scatterT > 0) {
      b.scatterT -= dt;
      if (b.scatterT <= SCATTER_TIME * 0.5) {
        // CONVERGENCE PHASE: Pull the lateral/vertical velocities back inwards!
        const tRatio = b.scatterT / (SCATTER_TIME * 0.5); // 1.0 (start of convergence) down to 0.0 (fully converged)
        const slM = slopeAt(b.pos.z);
        const pathFwd = new THREE.Vector3(-slM.x, -slM.y, -1).normalize();
        const speed = b.vel.length();
        
        // Lerp direction towards path forward, preserving current forward speed
        b.vel.lerp(pathFwd.multiplyScalar(speed), Math.min(1.0, dt * 11.5 * (1.0 - tRatio)));
      }
    }
    if (b.life <= 0) {
      b.active = false;
      hideInstance(m.core, i);
      hideInstance(m.glow, i);
      collapseRibbon(m.ribPos, i);
      continue;
    }

    // Seek the nearest DESTRUCTIBLE (every breakable obstacle is a target). After
    // the brief scatter burst, missiles home onto it; they pass through steel.
    // Missiles now ONLY search for targets within the player's 3D targeting cone!
    // Every obstacle that is broken (or is breakable) is a potential target.
    let target: Obstacle | null = null;
    let bestD = Infinity;
    for (const o of obstacles) {
      if (o.broken || !o.breakable) continue;
      o.mesh.getWorldPosition(_wp);

      // Targeting Cone AOE Check:
      const disp = new THREE.Vector3().subVectors(_wp, avatarPos);
      const distAlongAxis = disp.dot(coneAxis);
      const dispLen = disp.length();
      const closeThreat = dispLen <= CLOSE_LOCK_RANGE && distAlongAxis > -8;

      if (!closeThreat) {
        // 1. Distance Range Check
        if (distAlongAxis < 0 || distAlongAxis > dev.missileConeRange) continue;

        // 2. Angular Cone Check
        if (dispLen > 1e-4) {
          const cosAngle = distAlongAxis / dispLen;
          const maxAngleRad = (dev.missileConeAngle * Math.PI) / 180;
          if (cosAngle < Math.cos(maxAngleRad)) continue; // outside cone half-angle!
        }
      }

      const d = _wp.distanceToSquared(b.pos);
      if (d < bestD) {
        bestD = d;
        target = o;
        _tpos.copy(_wp);
      }
    }
    if (target) {
      if (bestD < HIT_R * HIT_R) {
        onHit(target);
        b.active = false;
        hideInstance(m.core, i);
        hideInstance(m.glow, i);
        collapseRibbon(m.ribPos, i);
        continue;
      }
      const closeEnough = bestD < CLOSE_LOCK_RANGE * CLOSE_LOCK_RANGE;
      if ((b.scatterT <= 0 || closeEnough) && bestD < HOMING_RANGE * HOMING_RANGE) {
        _desired.copy(_tpos).sub(b.pos);
        if (_desired.lengthSq() > 1e-6) {
          _desired.setLength(b.vel.length());
          b.vel.lerp(_desired, Math.min(1, (closeEnough ? TURN * 1.6 : TURN) * dt));
        }
      }
    }

    b.pos.addScaledVector(b.vel, dt);

    // place + orient core + glow along the velocity
    _dummy.position.copy(b.pos);
    _dummy.lookAt(b.pos.x + b.vel.x, b.pos.y + b.vel.y, b.pos.z + b.vel.z);
    _dummy.scale.copy(CORE_SCALE);
    _dummy.updateMatrix();
    m.core.setMatrixAt(i, _dummy.matrix);
    _dummy.scale.copy(GLOW_SCALE);
    _dummy.updateMatrix();
    m.glow.setMatrixAt(i, _dummy.matrix);
    m.glow.setColorAt(i, m.color);
    m.core.setColorAt(i, _c.copy(m.color).lerp(WHITE, 0.35).multiplyScalar(2.6));

    // advance the ribbon centreline history (shift, push current head) + rebuild tube
    const h = b.hist;
    for (let k = 0; k < RIB_SEGS - 1; k++) {
      h[k * 3] = h[(k + 1) * 3];
      h[k * 3 + 1] = h[(k + 1) * 3 + 1];
      h[k * 3 + 2] = h[(k + 1) * 3 + 2];
    }
    const last = (RIB_SEGS - 1) * 3;
    h[last] = b.pos.x;
    h[last + 1] = b.pos.y;
    h[last + 2] = b.pos.z;
    buildRibbon(m, i, h);
  }

  m.core.instanceMatrix.needsUpdate = true;
  m.glow.instanceMatrix.needsUpdate = true;
  if (m.core.instanceColor) m.core.instanceColor.needsUpdate = true;
  if (m.glow.instanceColor) m.glow.instanceColor.needsUpdate = true;
  m.ribbon.geometry.attributes.position.needsUpdate = true;
  m.ribbon.geometry.attributes.color.needsUpdate = true;
}

/** Expand one missile's centreline history into a tapered conical-tube ribbon slice. */
function buildRibbon(m: Missiles, slot: number, h: Float32Array) {
  const vertsPer = RIB_SEGS * RIB_RAD;
  const base = slot * vertsPer * 3;
  const col = _c.copy(m.color);
  for (let i = 0; i < RIB_SEGS; i++) {
    const ci = i * 3;
    _pCurr.set(h[ci], h[ci + 1], h[ci + 2]);
    if (i < RIB_SEGS - 1) {
      _pNext.set(h[ci + 3], h[ci + 4], h[ci + 5]);
      _dir.subVectors(_pNext, _pCurr);
    } else {
      _pNext.set(h[ci - 3], h[ci - 2], h[ci - 1]);
      _dir.subVectors(_pCurr, _pNext);
    }
    if (_dir.lengthSq() < 1e-6) _dir.set(0, 0, -1);
    _dir.normalize();
    _nrm.crossVectors(_dir, _up);
    if (_nrm.lengthSq() < 1e-4) _nrm.set(1, 0, 0);
    _nrm.normalize();
    _bin.crossVectors(_dir, _nrm).normalize();

    const t = i / (RIB_SEGS - 1); // 0 tail → 1 head
    const radius = (RIB_WIDTH / 2) * Math.pow(t, RIB_DECAY);
    const intensity = Math.pow(t, 1.3);
    const r = col.r * intensity;
    const g = col.g * intensity;
    const bl = col.b * intensity;

    for (let j = 0; j < RIB_RAD; j++) {
      const a = (j / RIB_RAD) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const v = base + (i * RIB_RAD + j) * 3;
      m.ribPos[v] = _pCurr.x + (_nrm.x * ca + _bin.x * sa) * radius;
      m.ribPos[v + 1] = _pCurr.y + (_nrm.y * ca + _bin.y * sa) * radius;
      m.ribPos[v + 2] = _pCurr.z + (_nrm.z * ca + _bin.z * sa) * radius;
      m.ribCol[v] = r;
      m.ribCol[v + 1] = g;
      m.ribCol[v + 2] = bl;
    }
  }
}
