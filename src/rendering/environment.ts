import * as THREE from 'three';
import { CHAPTERS, GAMESCOM_CANYON, GAMESCOM_PLAY_CHAPTERS } from '../config/chapters';

export function refreshEnv(
  pmrem: THREE.PMREMGenerator,
  scene: THREE.Scene,
  chapterIdx: number,
  currentEnv: THREE.Texture | null,
): THREE.Texture {
  const gamescomPlayIdx = chapterIdx - CHAPTERS.length - 1;
  const ch =
    chapterIdx === CHAPTERS.length
      ? GAMESCOM_CANYON
      : gamescomPlayIdx >= 0
      ? GAMESCOM_PLAY_CHAPTERS[
          Math.min(GAMESCOM_PLAY_CHAPTERS.length - 1, gamescomPlayIdx)
        ]
      : CHAPTERS[chapterIdx % CHAPTERS.length];
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createLinearGradient(0, 0, 0, 128);
  const horizonHex = '#' + ch.horizon.toString(16).padStart(6, '0');
  const topHex = '#' + ch.top.toString(16).padStart(6, '0');
  grd.addColorStop(0, topHex);
  grd.addColorStop(0.36, horizonHex);
  grd.addColorStop(0.5, '#ffffff');
  grd.addColorStop(0.64, horizonHex);
  grd.addColorStop(1, topHex);
  g.fillStyle = grd;
  g.fillRect(0, 0, 8, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  const env = pmrem.fromEquirectangular(tex).texture;
  tex.dispose();
  if (currentEnv) currentEnv.dispose();
  scene.environment = env;
  return env;
}
