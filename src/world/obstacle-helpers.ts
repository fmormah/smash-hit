import * as THREE from 'three';
import { EYE_Y, OBS_TOP } from '../config/constants';
import type { Obstacle, ObstacleOptions, Segment } from '../types';
import { laneAt } from './path';

const _box = new THREE.Box3();

export function makePane(
  geo: THREE.BoxGeometry,
  matFactory: () => THREE.MeshStandardMaterial,
  w: number,
  h: number,
  x: number,
  y: number,
  z: number,
  mat?: THREE.MeshStandardMaterial,
) {
  const m = new THREE.Mesh(geo, mat ?? matFactory());
  m.scale.set(w, h, 1);
  m.position.set(x, y, z);
  return m;
}

export function addObstacle(
  seg: Segment,
  mesh: THREE.Object3D,
  obstacles: Obstacle[],
  opts: ObstacleOptions = {},
): Obstacle {
  if (!opts.noAdd) seg.group.add(mesh);
  const o: Obstacle = {
    mesh,
    seg,
    type: opts.type ?? 'glass',
    breakable: opts.breakable !== false,
    hp: opts.hp ?? 1,
    maxHp: opts.hp ?? 1,
    blocksCenter: !!opts.blocksCenter,
    crystal: !!opts.crystal,
    steel: !!opts.steel,
    powerup: opts.powerup ?? 0,
    update: opts.update ?? null,
    broken: false,
    t: 0,
    base: mesh.position.clone(),
    fragColor: opts.fragColor ?? 0xaef0ff,
  };
  (mesh as THREE.Mesh).userData.obstacle = o;
  obstacles.push(o);
  seg.obstacles.push(o);
  return o;
}

export function coversCenter(mesh: THREE.Object3D, pad = 0.4) {
  mesh.updateWorldMatrix(true, false);
  _box.setFromObject(mesh);
  // the rail follows the curving centreline, so test against it (not world x=0,y=EYE_Y)
  const c = laneAt((_box.min.z + _box.max.z) / 2);
  const cx = c.x;
  const cy = EYE_Y + c.y;
  return (
    _box.min.x - pad <= cx &&
    _box.max.x + pad >= cx &&
    _box.min.y - pad <= cy &&
    _box.max.y + pad >= cy
  );
}

export function removeObstacle(o: Obstacle, obstacles: Obstacle[], dispose: (mesh: THREE.Object3D) => void) {
  if (o.cleanup) o.cleanup();
  if (o.mesh.parent) o.mesh.parent.remove(o.mesh);
  if ((o.mesh as THREE.Mesh).isMesh) dispose(o.mesh);
  const gi = obstacles.indexOf(o);
  if (gi >= 0) obstacles.splice(gi, 1);
  const si = o.seg.obstacles.indexOf(o);
  if (si >= 0) o.seg.obstacles.splice(si, 1);
}

export function tutorialText(seg: Segment, text: string) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.font = '700 120px -apple-system, Segoe UI, Roboto, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = 'rgba(150,230,255,0.9)';
  g.shadowBlur = 30;
  g.fillStyle = '#dffbff';
  g.fillText(text, 512, 128);
  const tex = new THREE.CanvasTexture(c);
  const spr = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: true, opacity: 0.95 }),
  );
  spr.scale.set(8, 2, 1);
  spr.position.set(0, EYE_Y + 0.4, -2);
  seg.group.add(spr);
}

export function removeFromArray<T>(a: T[], x: T) {
  const i = a.indexOf(x);
  if (i >= 0) a.splice(i, 1);
}

/** Two-line glowing banner announcing a new chapter/level, floating above the portal door. */
export function chapterBanner(seg: Segment, line1: string, line2: string, colorCss: string) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 384;
  const g = c.getContext('2d')!;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = colorCss;
  g.shadowBlur = 36;
  g.fillStyle = 'rgba(255,255,255,0.92)';
  g.font = '600 64px -apple-system, Segoe UI, Roboto, sans-serif';
  g.fillText(line1, 512, 90);
  g.font = '800 150px -apple-system, Segoe UI, Roboto, sans-serif';
  g.fillText(line2, 512, 232);
  const tex = new THREE.CanvasTexture(c);
  const spr = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: true, opacity: 0.96 }),
  );
  spr.scale.set(11, 4.1, 1);
  spr.position.set(0, OBS_TOP + 1.8, 0);
  seg.group.add(spr);
}
