import type { InputState } from '../input/controls';

/**
 * Visible mobile joystick (ported from the first game's TouchControls). On a
 * coarse-pointer device a floating stick appears under the thumb: drag to steer
 * (feeds `input.axisX/axisY`), tap without dragging to fire the power-up. Only
 * mounts on touch devices, so desktop mouse-drag steering is untouched.
 */
const DEADZONE = 0.05; // smaller deadzone → sharper response

export function createTouchControls(input: InputState, isRunning: () => boolean) {
  const isTouch = window.matchMedia('(pointer: coarse)').matches;
  if (!isTouch) return;

  const root = document.createElement('div');
  root.className = 'touch-controls';
  const base = document.createElement('div');
  base.className = 'joy-base';
  const knob = document.createElement('div');
  knob.className = 'joy-knob';
  base.appendChild(knob);
  root.appendChild(base);
  document.body.appendChild(root);

  let dragging = false;
  let pointerId: number | null = null;
  let cx = 0;
  let cy = 0;
  let moved = false;
  let lastTapT = 0; // for double-tap detection (fire scatter missiles)

  const radius = () => Math.max(24, base.getBoundingClientRect().width * 0.26); // tighter = sharper steering

  root.addEventListener('pointerdown', (e) => {
    if (e.target !== root && e.target !== base && e.target !== knob) return;
    if (!isRunning()) return;
    dragging = true;
    moved = false;
    pointerId = e.pointerId;
    cx = e.clientX;
    cy = e.clientY;
    base.style.left = `${e.clientX}px`;
    base.style.top = `${e.clientY}px`;
    base.style.bottom = 'auto';
    base.style.transform = 'translate(-50%, -50%)'; // centre the stick on the finger
    base.classList.add('active');
    root.setPointerCapture(e.pointerId);
  });

  root.addEventListener('pointermove', (e) => {
    if (!dragging || e.pointerId !== pointerId) return;
    const R = radius();
    let dx = e.clientX - cx;
    let dy = e.clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > R) {
      dx = (dx / dist) * R;
      dy = (dy / dist) * R;
    }
    if (dist > 4) moved = true;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;

    let nx = dx / R;
    let ny = -dy / R;
    const mag = Math.hypot(nx, ny);
    if (mag < DEADZONE) {
      nx = 0;
      ny = 0;
    } else {
      const f = (mag - DEADZONE) / (1 - DEADZONE) / mag;
      nx *= f;
      ny *= f;
    }
    input.touch.active = true;
    input.axisX = Math.max(-1, Math.min(1, nx));
    input.axisY = Math.max(-1, Math.min(1, ny));
  });

  const end = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    if (!moved && isRunning()) {
      // double-tap (two quick taps, no drag) = fire scatter missiles
      const now = performance.now();
      if (now - lastTapT < 320) {
        input.powerRequest = true;
        lastTapT = 0;
      } else {
        lastTapT = now;
      }
    }
    dragging = false;
    pointerId = null;
    input.touch.active = false;
    input.axisX = 0;
    input.axisY = 0;
    knob.style.transform = 'translate(0, 0)';
    base.classList.remove('active');
    base.style.left = '';
    base.style.top = '';
    base.style.bottom = ''; // back to the parked bottom-centre position
    base.style.transform = '';
  };
  root.addEventListener('pointerup', end);
  root.addEventListener('pointercancel', end);
}
