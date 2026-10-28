import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { FOG_FAR, FOG_NEAR } from '../config/constants';
import { $ } from '../utils/dom';

export interface RendererBundle {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  composer: EffectComposer;
  bloomPass: UnrealBloomPass;
  outlinePass: OutlinePass; // outlines destroyable, in-range obstacles (driven each frame)
  pmrem: THREE.PMREMGenerator;
  clock: THREE.Clock;
}

export function createRenderer(eyeY: number): RendererBundle {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x8fe8ff, FOG_NEAR, FOG_FAR);

  const camera = new THREE.PerspectiveCamera(74, innerWidth / innerHeight, 0.1, 600);
  camera.position.set(0, eyeY, 0);
  scene.add(camera);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.28;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  $('app').appendChild(renderer.domElement);

  const pmrem = new THREE.PMREMGenerator(renderer);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(innerWidth, innerHeight),
    0.6,
    0.5,
    0.88,
  );
  composer.addPass(bloomPass);

  const outlinePass = new OutlinePass(
    new THREE.Vector2(innerWidth, innerHeight),
    scene,
    camera,
  );
  outlinePass.edgeGlow = 0;
  outlinePass.edgeThickness = 2;
  outlinePass.edgeStrength = 3;
  outlinePass.pulsePeriod = 0;
  outlinePass.visibleEdgeColor.set('#6cf0ff');
  outlinePass.hiddenEdgeColor.set('#6cf0ff');
  composer.addPass(outlinePass);

  composer.setPixelRatio(Math.min(devicePixelRatio, 1.5));

  return {
    scene,
    camera,
    renderer,
    composer,
    bloomPass,
    outlinePass,
    pmrem,
    clock: new THREE.Clock(),
  };
}

export function resizeRenderer(bundle: RendererBundle) {
  const { camera, renderer, composer, outlinePass } = bundle;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  outlinePass.setSize(innerWidth, innerHeight);
}
