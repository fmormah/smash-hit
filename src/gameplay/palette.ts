import * as THREE from 'three';
import { CHAPTERS } from '../config/chapters';
import { gamesComChapterFor, isGamesComPlayMode } from '../config/gamescom-levels';
import { dev, gamescom } from '../config/runtime';
import type { SkyBundle } from '../rendering/sky';
import type { SceneVisuals } from '../rendering/scene-visuals';
import type { RendererBundle } from '../rendering/setup-renderer';

const _c1 = new THREE.Color();
const _c2 = new THREE.Color();

export function updatePalette(
  dt: number,
  distance: number,
  bundle: RendererBundle,
  sky: SkyBundle,
  visuals: SceneVisuals,
  lastChapterEnv: { value: number },
  refreshEnv: (idx: number) => void,
  onChapterName: (name: string) => void,
  splashMode = false,
) {
  const idx = splashMode
    ? (dev.splashZoneOverride >= 0 ? dev.splashZoneOverride % CHAPTERS.length : 0)
    : (isGamesComPlayMode()
      ? Math.floor(distance / dev.levelLength)
      : dev.zoneOverride >= 0
      ? dev.zoneOverride % CHAPTERS.length
      : Math.floor(distance / dev.levelLength) % CHAPTERS.length);
  // GamesCom Test Flight forces the curated grey canyon. GamesCom Play uses the
  // five Google-colour canyon chapters.
  const ch = gamescom.enabled ? gamesComChapterFor(idx) : CHAPTERS[idx];
  _c1.setHex(ch.top);
  _c2.setHex(ch.horizon);
  const k = Math.min(1, dt * 1.6);
  sky.top.lerp(_c1, k);
  sky.horizon.lerp(_c2, k);
  sky.material.uniforms.topColor.value.copy(sky.top);
  sky.material.uniforms.horizonColor.value.copy(sky.horizon);
  // mid stop of the sky gradient: GamesCom uses its own palette colour; other biomes
  // default to the midpoint of top↔horizon so their look is unchanged.
  if (sky.material.uniforms.midColor) {
    if (gamescom.enabled)
      _c1.setHex(isGamesComPlayMode() ? ch.mid ?? ch.light : gamescom.canyonSkyMid);
    else _c1.copy(sky.top).lerp(sky.horizon, 0.5);
    sky.material.uniforms.midColor.value.lerp(_c1, k);
  }

  // Twinkling stars and star intensity
  if (sky.material.uniforms.time) {
    sky.material.uniforms.time.value = performance.now() * 0.001;
  }
  if (sky.material.uniforms.starIntensity) {
    const targetStarIntensity = ch.style === 'nebula' ? 1.0 : ch.style === 'ethereal' ? 0.65 : 0.0;
    sky.material.uniforms.starIntensity.value += (targetStarIntensity - sky.material.uniforms.starIntensity.value) * Math.min(1, dt * 2.0);
  }
  if (sky.material.uniforms.canyonAmount) {
    const targetCanyon = ch.style === 'canyon' ? 1.0 : 0.0;
    sky.material.uniforms.canyonAmount.value += (targetCanyon - sky.material.uniforms.canyonAmount.value) * Math.min(1, dt * 3.0);
  }

  bundle.scene.fog!.color.copy(sky.horizon);
  
  // Dynamic fog adjustment based on chapter style to elevate atmosphere
  const fog = bundle.scene.fog as THREE.Fog;
  if (fog) {
    const targetNear =
      ch.style === 'ethereal'
        ? 6
        : ch.style === 'nebula'
        ? 24
        : ch.style === 'canyon'
        ? 10
        : ch.style === 'abyss'
        ? 12
        : ch.style === 'void'
        ? 16
        : 16;
    const targetFar =
      ch.style === 'ethereal'
        ? 90
        : ch.style === 'nebula'
        ? 180
        : ch.style === 'canyon'
        ? 105
        : ch.style === 'abyss'
        ? 130
        : ch.style === 'void'
        ? 160
        : 150;
    fog.near += (targetNear - fog.near) * Math.min(1, dt * 2.0);
    fog.far += (targetFar - fog.far) * Math.min(1, dt * 2.0);
  }

  // Dynamic bloom adjustment to make neon colors pop and ethereal levels dreamy
  if (bundle.bloomPass) {
    const targetStrength =
      ch.style === 'nebula'
        ? 1.15
        : ch.style === 'ethereal'
        ? 0.92
        : ch.style === 'canyon'
        ? 0.45
        : ch.style === 'abyss'
        ? 0.7
        : 0.65;
    const targetRadius =
      ch.style === 'nebula'
        ? 0.7
        : ch.style === 'ethereal'
        ? 0.65
        : ch.style === 'canyon'
        ? 0.42
        : 0.5;
    const targetThreshold =
      ch.style === 'nebula'
        ? 0.72 // higher threshold so sky & fog don't bloom, but bright neon panels/particles do!
        : ch.style === 'ethereal'
        ? 0.75 // higher threshold so sky & fog don't bloom, but bright spheres/panes do!
        : ch.style === 'canyon'
        ? 0.88
        : 0.85; // high strategic threshold for standard levels

    bundle.bloomPass.strength += (targetStrength * dev.bloomIntensity - bundle.bloomPass.strength) * Math.min(1, dt * 2.0);
    bundle.bloomPass.radius += (targetRadius - bundle.bloomPass.radius) * Math.min(1, dt * 2.0);
    bundle.bloomPass.threshold += (targetThreshold - bundle.bloomPass.threshold) * Math.min(1, dt * 2.0);
  }

  bundle.renderer.setClearColor(sky.horizon, 1);
  // Canyon: NEUTRAL ambient so the palette surface colours (floor/walls) read true
  // instead of being washed by a coloured sky. Other biomes tint ambient by the sky.
  if (ch.style === 'canyon') visuals.hemi.color.setHex(0xb8b8b8);
  else visuals.hemi.color.copy(sky.horizon);
  visuals.hemi.groundColor.setHex(ch.style === 'canyon' ? 0x222222 : 0x0a0e1c);
  visuals.hemi.intensity = ch.style === 'canyon' ? 0.9 : 0.9;
  _c1.setHex(ch.light);
  visuals.key.color.lerp(_c1, k);
  visuals.head.color.lerp(_c1, k);
  visuals.key.intensity = ch.style === 'canyon' ? 0.9 : 0.85;
  // canyon rim tracks the palette "light" colour (was hardcoded white) so it shows
  visuals.rim.color.setHex(ch.style === 'canyon' ? ch.light : 0x88bbff);
  visuals.rim.intensity = ch.style === 'canyon' ? 0.7 : 0.5;
  visuals.head.intensity =
    (dev.floorLightEnabled ? 1 : 0) *
    (ch.style === 'canyon' ? 0.55 : 1.0) *
    THREE.MathUtils.clamp(dev.floorGlowIntensity, 0, 1.5);
  visuals.sunSprite.scale.set(ch.style === 'canyon' ? 74 : 48, ch.style === 'canyon' ? 30 : 34, 1);
  const sunMat = visuals.sunSprite.material as THREE.SpriteMaterial;
  sunMat.opacity = ch.style === 'canyon' ? 0.16 : 0.5;
  if (visuals.sunSprite.material.color) visuals.sunSprite.material.color.copy(sky.horizon);
  
  // Dynamic particle color to match chapter accent for immersive ambient dust
  if (visuals.particles && visuals.particles.material) {
    const pMat = visuals.particles.material as THREE.PointsMaterial;
    _c1.setHex(ch.accent);
    pMat.color.lerp(_c1, k);
    pMat.opacity += ((ch.style === 'canyon' ? 0.12 : 0.7) - pMat.opacity) * Math.min(1, dt * 2.0);
  }
  const envIdx = gamescom.enabled
    ? CHAPTERS.length + (isGamesComPlayMode() ? idx + 1 : 0)
    : idx;
  if (envIdx !== lastChapterEnv.value) {
    lastChapterEnv.value = envIdx;
    refreshEnv(envIdx);
  }
  onChapterName(ch.name);
}
