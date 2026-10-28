import * as THREE from "three";
import { SPAWN_AHEAD } from "../config/constants";
import { rnd } from "../utils/random";

export interface SceneVisuals {
  hemi: THREE.HemisphereLight;
  key: THREE.DirectionalLight;
  rim: THREE.DirectionalLight;
  head: THREE.PointLight;
  sunSprite: THREE.Sprite;
  particles: THREE.Points;
}

export function buildLights(
  scene: THREE.Scene,
  camera: THREE.Camera,
): SceneVisuals {
  const hemi = new THREE.HemisphereLight(0xbfe8ff, 0x0a0e1c, 0.9);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 0.85);
  key.position.set(5, 14, 4);
  scene.add(key);
  scene.add(key.target);
  const rim = new THREE.DirectionalLight(0x88bbff, 0.5);
  rim.position.set(-7, 5, -12);
  scene.add(rim);
  const head = new THREE.PointLight(0xcfeaff, 1.0, 80, 1.6);
  head.position.set(0, 3, 5);
  camera.add(head);

  return {
    hemi,
    key,
    rim,
    head,
    sunSprite: buildSunGlow(scene),
    particles: buildParticles(scene),
  };
}

function buildParticles(scene: THREE.Scene) {
  const N = 520;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = rnd(-14, 14);
    pos[i * 3 + 1] = rnd(0, 15);
    pos[i * 3 + 2] = rnd(-SPAWN_AHEAD, 10);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({
    color: 0xeaffff,
    size: 0.09,
    transparent: true,
    opacity: 0.7,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: true,
  });
  const particles = new THREE.Points(g, m);
  particles.frustumCulled = false;
  scene.add(particles);
  return particles;
}

function buildSunGlow(scene: THREE.Scene) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, "rgba(255,255,255,0.95)");
  grd.addColorStop(0.4, "rgba(255,255,255,0.35)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  const sunSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      fog: false,
      opacity: 0.5,
    }),
  );
  sunSprite.name = "horizon-sun-glow";
  sunSprite.scale.set(48, 34, 1);
  scene.add(sunSprite);
  return sunSprite;
}

export function updateParticles(
  particles: THREE.Points,
  dt: number,
  camZ: number,
  camX = 0,
) {
  const p = particles.geometry.attributes.position;
  const arr = p.array as Float32Array;
  for (let i = 0; i < arr.length; i += 3) {
    arr[i + 1] += dt * 0.4;
    arr[i] += Math.sin((arr[i + 1] + i) * 0.6) * dt * 0.15;
    if (arr[i + 1] > 15) arr[i + 1] = 0;
    if (arr[i + 2] > camZ + 8) {
      arr[i + 2] = camZ - SPAWN_AHEAD;
      arr[i] = camX + rnd(-14, 14); // recentre on the (possibly drifted) lane
      arr[i + 1] = rnd(0, 15);
    } else if (arr[i + 2] < camZ - SPAWN_AHEAD - 5) {
      arr[i + 2] = camZ + rnd(0, 8);
    }
  }
  p.needsUpdate = true;
}
