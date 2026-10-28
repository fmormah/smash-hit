import { resizeRenderer, type RendererBundle } from '../rendering/setup-renderer';
import type { HudElements } from '../ui/hud';

/**
 * Steering input (fused build): the player WEAVES an avatar through the world —
 * no ball-throwing. `axisX/axisY` are −1..1 (left/right, down/up), fed from
 * keyboard (WASD / arrows) and touch-drag.
 */
export interface InputState {
  axisX: number;
  axisY: number;
  kLeft: boolean;
  kRight: boolean;
  kUp: boolean;
  kDown: boolean;
  /** Discrete: trigger the held power-up (Space / double-tap). Consumed by the loop. */
  powerRequest: boolean;
  /** Touch steering anchor (null when not dragging). */
  touch: { active: boolean; cx: number; cy: number };
}

export function createInputState(): InputState {
  return {
    axisX: 0,
    axisY: 0,
    kLeft: false,
    kRight: false,
    kUp: false,
    kDown: false,
    powerRequest: false,
    touch: { active: false, cx: 0, cy: 0 },
  };
}

/** Recompute axes from keyboard hold flags (touch overrides while dragging). */
export function syncAxes(input: InputState) {
  if (input.touch.active) return; // touch drag drives the axes directly
  input.axisX = (input.kRight ? 1 : 0) - (input.kLeft ? 1 : 0);
  input.axisY = (input.kUp ? 1 : 0) - (input.kDown ? 1 : 0);
}

export function bindControls(
  bundle: RendererBundle,
  hud: HudElements,
  input: InputState,
  callbacks: {
    onStart: () => void;
    onTogglePause: () => void;
    isRunning: () => boolean;
    isPaused: () => boolean;
    isStarted: () => boolean;
  },
) {
  addEventListener('resize', () => resizeRenderer(bundle));

  const cv = bundle.renderer.domElement;
  // Desktop is KEYBOARD-ONLY (no mouse-drag steering). Mobile uses the on-screen
  // joystick (see ui/touch-controls). Keep these guards so the canvas doesn't
  // trigger context menus / page scroll on touch.
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  cv.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });

  addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if ((k === 'p' || k === 'escape') && callbacks.isStarted()) callbacks.onTogglePause();
    if (k === 'arrowleft' || k === 'a') input.kLeft = true;
    if (k === 'arrowright' || k === 'd') input.kRight = true;
    if (k === 'arrowup' || k === 'w') input.kUp = true;
    if (k === 'arrowdown' || k === 's') input.kDown = true;
    if (k === ' ' && callbacks.isRunning()) input.powerRequest = true;
  });
  addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'arrowleft' || k === 'a') input.kLeft = false;
    if (k === 'arrowright' || k === 'd') input.kRight = false;
    if (k === 'arrowup' || k === 'w') input.kUp = false;
    if (k === 'arrowdown' || k === 's') input.kDown = false;
  });

  hud.playBtn.addEventListener('click', callbacks.onStart);
  hud.resumeBtn.addEventListener('click', callbacks.onTogglePause);
}
