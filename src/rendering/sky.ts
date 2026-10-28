import * as THREE from 'three';
import { CHAPTERS } from '../config/chapters';

export interface SkyBundle {
  material: THREE.ShaderMaterial;
  mesh: THREE.Mesh;
  top: THREE.Color;
  horizon: THREE.Color;
  accent: THREE.Color;
}

export function buildSky(scene: THREE.Scene): SkyBundle {
  const top = new THREE.Color().setHex(CHAPTERS[0].top);
  const horizon = new THREE.Color().setHex(CHAPTERS[0].horizon);
  const accent = new THREE.Color().setHex(CHAPTERS[0].accent);

  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: true,
    uniforms: {
      topColor: { value: new THREE.Color().copy(top) },
      horizonColor: { value: new THREE.Color().copy(horizon) },
      midColor: { value: new THREE.Color().copy(top).lerp(horizon, 0.5) },
      time: { value: 0 },
      starIntensity: { value: 0 },
      canyonAmount: { value: 0 },
    },
    vertexShader: `
      varying vec3 vDir;
      varying vec3 vPos;
      varying vec3 vViewDir;
      void main(){
        vDir = normalize(position);
        vPos = position;
        vViewDir = normalize((modelViewMatrix * vec4(position, 0.0)).xyz);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
      }`,
    fragmentShader: `
      varying vec3 vDir;
      varying vec3 vPos;
      varying vec3 vViewDir;
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      uniform vec3 midColor;
      uniform float time;
      uniform float starIntensity;
      uniform float canyonAmount;

      float hash(vec3 p) {
        p = fract(p * 0.3183099 + .1);
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }

      void main(){
        float y = vDir.y;
        vec3 ground = horizonColor * 0.45;
        // 3-stop sky gradient: horizon (bottom) → mid → top
        vec3 col = y < 0.28
          ? mix(horizonColor, midColor, smoothstep(0.0, 0.28, y))
          : mix(midColor, topColor, smoothstep(0.28, 0.62, y));
        col = mix(col, ground, smoothstep(0.0, -0.45, y));
        float band = exp(-pow(y/0.05, 2.0));
        col += horizonColor * band * 0.55;

        if (canyonAmount > 0.001) {
          float sx = abs(vViewDir.x);
          float sy = vViewDir.y;
          float horizonWash = exp(-pow(sy / 0.22, 2.0));
          float sideGlow = horizonWash * smoothstep(0.08, 0.78, sx);
          float centerVoid = exp(-pow(sx / 0.18, 2.0)) * smoothstep(-0.18, 0.72, sy);
          // Palette-driven 3-stop vertical gradient: horizon (bottom) → mid → top,
          // plus the bright side-glow (horizon) and dark centre void (top).
          vec3 base = sy < 0.4
            ? mix(horizonColor * 0.6, midColor, smoothstep(-0.1, 0.4, sy))
            : mix(midColor, topColor, smoothstep(0.4, 0.95, sy));
          vec3 canyonCol = base;
          canyonCol = mix(canyonCol, horizonColor, sideGlow);
          canyonCol += horizonColor * 0.28 * horizonWash * (1.0 - centerVoid);
          canyonCol = mix(canyonCol, topColor * 0.3, centerVoid);
          col = mix(col, max(canyonCol, vec3(0.0)), canyonAmount);
        }

        if (starIntensity > 0.0 && y > -0.1) {
          vec3 starPos = vDir * 180.0;
          vec3 ip = floor(starPos);
          vec3 fp = fract(starPos);
          float h = hash(ip);
          if (h > 0.985) {
            float size = 0.05 + 0.95 * fract(h * 123.456);
            float dist = length(fp - 0.5);
            float star = smoothstep(0.5 * size, 0.0, dist);
            float twinkle = 0.6 + 0.4 * sin(time * 3.0 + h * 62.8);
            col += vec3(1.0, 0.95, 0.9) * star * starIntensity * twinkle;
          }
        }

        gl_FragColor = vec4(col, 1.0);
      }`,
  });

  const mesh = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  mesh.name = 'sky';
  scene.add(mesh);

  return { material, mesh, top, horizon, accent };
}
